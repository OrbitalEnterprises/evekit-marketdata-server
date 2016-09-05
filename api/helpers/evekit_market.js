'use strict';

// EveKit MarketData classes

var zlib = require('zlib');
var readline = require('readline');
var https = require('https');
var url = require('url');
var buffer = require('buffer');
var assert = require('assert');

// Host for online storage
const ONLINE_MARKET_HOST = 'storage.googleapis.com';

// Root location of all online market data for EveKit
const ONLINE_MARKET_ROOT = 'https://storage.googleapis.com/evekit_md/';

// Milliseconds per day for date conversion
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

// MarketHistory class
function MarketHistory(opt_line) {
    opt_line = opt_line || "0,0,0,0,0,0,0,0";
    var data = opt_line.split(',');
    this.typeID = parseInt(data[0]);
    this.regionID = parseInt(data[1]);
    this.orderCount = parseInt(data[2]);
    this.lowPrice = parseFloat(data[3]);
    this.highPrice = parseFloat(data[4]);
    this.avgPrice = parseFloat(data[5]);
    this.volume = parseInt(data[6]);
    this.date = parseInt(data[7]);
}

/**
 * Attempt to lookup market history from the online archive.
 *
 * @param typeID desired market type
 * @param regionID desired region
 * @param dt Lookup date in milliseconds UTC (since the epoch)
 * @param cb errorback to receive the result (e.g. function(err,result)).  Result is null if the requested history can't be found.
 */
MarketHistory.lookup = function(typeID, regionID, dt, cb) {
    // Convert date to midnight on the desired day
    dt = dt - (dt % MILLIS_PER_DAY);
    var dateObj = new Date(dt);
    // Retrieve market index file.  If this fails then we're done
    var historyIndex = ONLINE_MARKET_ROOT;
    var yy = String(dateObj.getUTCFullYear());
    var mm = String(dateObj.getUTCMonth() + 1);
    if (mm.length < 2) mm = '0' + mm;
    var dd = String(dateObj.getUTCDate());
    if (dd.length < 2) dd = '0' + dd;
    historyIndex += yy + "/" + mm + "/" + dd;
    historyIndex += "/market_" + (yy + mm + dd) + ".index.gz";
    // Retrieve index
    var gunzip = zlib.createGunzip();
    https.get(historyIndex, function(indexResult) {
        gunzip.on('error', function(err) {
            // Error reading archive (perhaps because it doesn't exist), return error
            cb(err);
        });
        indexResult.pipe(gunzip);
        var rl = readline.createInterface({
            input: gunzip
        });
        var offsetStart = -1, offsetEnd = -1, found = false;
        rl.on('close', function() {
            if (!found) {
                // Data not found
                cb(null, null);
            } else {
                // Found range, retrieve and send data
                historyIndex = historyIndex.replace(".index.gz", ".bulk");
                offsetEnd--;
                var rangeString = 'bytes=' + offsetStart + '-' + (offsetEnd > 0 ? offsetEnd : '');
                https.get({
                    'host': ONLINE_MARKET_HOST,
                    'path': url.parse(historyIndex).pathname,
                    'headers' : { 'Range' : rangeString }
                }, function(bulkResult,err) {
                    if (err) cb(err);
                    // Node.js zlib annoyingly doesn't handle a buffer with concatenated gzip'd streams.
                    // So we have to separate streams ourself once we have the complete buffer.
                    // We can identify the streams by looking for the magic header.
                    var gzip_head_1 = 0x1F;
                    var gzip_head_2 = 0x8B;
                    var raw = new Buffer(0);
                    bulkResult.on('data', function(chunk) {
                        raw = buffer.Buffer.concat([raw, chunk]);
                    });
                    bulkResult.on('end', function() {
                        // Unzip buffer segments until we find the appropriate region.
                        var iStart = 0, iEnd = iStart + 2;
                        try {
                            while (iStart + 2 < raw.length && raw[iStart] == gzip_head_1 && raw[iStart + 1] == gzip_head_2) {
                                iEnd = raw.indexOf(gzip_head_1, iEnd);
                                if (iEnd == -1 || iEnd + 1 == raw.length) {
                                    // Found end of buffer, attempt to unzip from here
                                    var unzipped = zlib.gunzipSync(raw.slice(iStart)).toString('utf8').trim();
                                    var history = new MarketHistory(unzipped);
                                    if (history['regionID'] == regionID) {
					cb(null, history);
                                        return;
                                    }
                                    // Failed to unzip the last record, force exit
                                    iStart = raw.length;
                                } else if (raw[iEnd + 1] == gzip_head_2) {
                                    // unzip iStart to iEnd - 1
                                    var unzipped = zlib.gunzipSync(raw.slice(iStart, iEnd)).toString('utf8').trim();
                                    var history = new MarketHistory(unzipped);
                                    if (history['regionID'] == regionID) {
					cb(null, history);
                                        return;
                                    }
                                    // Failed, move to next record
                                    iStart = iEnd;
                                    iEnd = iStart + 2;
                                } else {
                                    // Keep looking for the next header or end of buffer
                                    iEnd++;
                                }
                            }
                        } catch (err) {
			    cb(err);
			    return;
                        }
                        // If we exit without finding our region then end
                        cb(null, null);
			return;
                    });
                });
            }
        });
        rl.on('line', function(line) {
	    // Skip if we've already found the index line we're looking for
            if (found) return;
            var pair = line.split(' ');
            var fields = pair[0].split('_');
            if (offsetStart != -1) {
		// Found end of offset, save it and skip any future lines
                offsetEnd = parseInt(pair[1]);
                found = true;
            } else if (parseInt(fields[1]) == typeID) {
		// Found start of offset, save it
                offsetStart = parseInt(pair[1]);
            }
        });
    });
}

// Order class
function Order(opt_line) {
    opt_line = opt_line || "0,0,0,false,0,0,0,0,0,,0,0";
    var data = opt_line.split(',');
    this.typeID = parseInt(data[1]);
    this.regionID = parseInt(data[0]);
    this.orderID = parseInt(data[2]);
    this.buy = (data[3] === 'true');
    this.issued = parseInt(data[4]);
    this.price = parseFloat(data[5]);
    this.volumeEntered = parseInt(data[6]);
    this.minVolume = parseInt(data[7]);
    this.volume = parseInt(data[8]);
    this.orderRange =  data[9];
    this.locationID = parseInt(data[10]);
    this.duration = parseInt(data[11]);
}

// OrderBook class
function OrderBook(opt_tm, opt_orders, opt_typeid, opt_regionid) {
    opt_tm = opt_tm || 0;
    opt_orders = opt_orders || [];
    opt_typeid = opt_typeid || 0;
    opt_regionid = opt_regionid || 0;
    this.bookTime = opt_tm;
    this.orders = opt_orders;
    this.typeID = opt_typeid;
    this.regionID = opt_regionid;
}

/**
 * Attempt to lookup order book from the online archive.
 *
 * @param typeID desired market type
 * @param regionID desired region
 * @param dt Lookup datetime in milliseconds UTC (since the epoch)
 * @param cb errorback to receive the result (e.g. function(err,result)).  Result is null if the requested history can't be found.
 */
OrderBook.lookup = function(typeID, regionID, dt, cb) {
    var dateObj = new Date(dt);
    // Retrieve order book index file.  If this fails then we're done
    var bookIndex = ONLINE_MARKET_ROOT;
    var yy = String(dateObj.getUTCFullYear());
    var mm = String(dateObj.getUTCMonth() + 1);
    if (mm.length < 2) mm = '0' + mm;
    var dd = String(dateObj.getUTCDate());
    if (dd.length < 2) dd = '0' + dd;
    bookIndex += yy + "/" + mm + "/" + dd;
    bookIndex += "/interval_" + (yy + mm + dd) + "_5.index.gz";
    // Retrieve index
    var gunzip = zlib.createGunzip();
    https.get(bookIndex, function(indexResult) {
        gunzip.on('error', function(err) {
            // Error reading archive (perhaps because it doesn't exist), return error
            cb(err);
        });
        indexResult.pipe(gunzip);
        var rl = readline.createInterface({
            input: gunzip
        });
        var offsetStart = -1, offsetEnd = -1, found = false;
        rl.on('close', function() {
            if (!found) {
                // Data not found
                cb(null, null);
            } else {
                // Found range, retrieve data
                bookIndex = bookIndex.replace(".index.gz", ".bulk");
                offsetEnd--;
                var rangeString = 'bytes=' + offsetStart + '-' + (offsetEnd > 0 ? offsetEnd : '');
                https.get({
                    'host': ONLINE_MARKET_HOST,
                    'path': url.parse(bookIndex).pathname,
                    'headers' : { 'Range' : rangeString }
                }, function(bulkResult,err) {
                    if (err) cb(err);
		    // Orderbook for the day is one contiguous gzip archive so we can just pipe and process
		    var gunzip = zlib.createGunzip();
		    gunzip.on('error', function(err) {
			// Error reading archive (perhaps because it doesn't exist), return error
			cb(err);
		    });
		    bulkResult.pipe(gunzip);
		    var bl = readline.createInterface({
			input: gunzip
		    });
		    var fileType = 0;
		    var intervalCount = 0;
		    var currentInterval = 0;
		    var nextRegion = 0;
		    var nextBookTime = 0;
		    var nextAskCount = -1;
		    var nextBidCount = -1;
		    var orderSet = 0;
		    var orders = [];
		    var bestBookTime = 0;
		    var bestBookOrders = null;
		    var finished = false;
		    bl.on('line', function(line) {
			// Skip all further lines when we've found the best book
			if (finished) return;
			// Scan convert to find desired value
			if (fileType == 0) {
			    fileType = parseInt(line);
			    assert.equal(fileType, typeID);
			    return;
			}
			if (intervalCount == 0) {
			    intervalCount = parseInt(line);
			    return;
			}
			if (nextRegion == 0) {
			    nextRegion = parseInt(line);
			    currentInterval = 0;
			    nextBookTime = 0;
			    return;
			}
			if (nextBookTime == 0) {
			    nextBookTime = parseInt(line);
			    nextAskCount = -1;
			    nextBidCount = -1;
			    return;
			}
			if (nextAskCount == -1) {
			    nextAskCount = parseInt(line);
			    return;
			}
			if (nextBidCount == -1) {
			    nextBidCount = parseInt(line);
			    orderSet = nextAskCount + nextBidCount;
			    orders = [];
			    if (orderSet > 0) return;
			}
			if (orderSet > 0) {
			    orderSet--;
			    if (nextRegion == regionID) {
				// Accumulate orders for this region
				orders.push(new Order(regionID + ',' + typeID + ',' + line));
			    }
			}
			if (orderSet == 0) {
			    // See if this is the best book so far.  If so, then keep
			    if (nextRegion == regionID && nextBookTime > bestBookTime && nextBookTime <= dt) {
				bestBookTime = nextBookTime;
				bestBookOrders = orders;
			    }
			    // Reset for next interval or region
			    currentInterval++;
			    if (currentInterval == intervalCount) {
				// If we've found our book then we're done.
				if (bestBookTime > 0) finished = true;
				nextRegion = 0;
			    } else {
				nextBookTime = 0;
			    }
			}
		    });
		    bl.on('close', function() {
			if (bestBookTime == 0) {
			    // We never found the order book, exit
			    cb(null, null);
			} else {
			    // Return the order book we found
			    // Note that archived books are already sorted
			    cb(null, new OrderBook(bestBookTime, bestBookOrders, typeID, regionID));
			}
		    });		    
                });
            }
        });
        rl.on('line', function(line) {
	    // Skip if we've already found the index line we're looking for
            if (found) return;
            var pair = line.split(' ');
            var fields = pair[0].split('_');
            if (offsetStart != -1) {
		// Found end of offset, save it and skip any future lines
                offsetEnd = parseInt(pair[1]);
                found = true;
            } else if (parseInt(fields[1]) == typeID) {
		// Found start of offset, save it
                offsetStart = parseInt(pair[1]);
            }
        });
    });
}

exports.MarketHistory = MarketHistory;
exports.OrderBook = OrderBook;
exports.Order = Order;

