'use strict';

var fs = require('fs');
var async = require('async');
var zlib = require('zlib');
var readline = require('readline');
var https = require('https');
var url = require('url');
var buffer = require('buffer');
var ekmd = require('../helpers/evekit_market');

module.exports = {
  book: book
};

function book(req, res) {
    var typeID = req.swagger.params.type.value || -1;
    var regionID = req.swagger.params.region.value || -1;
    var date = req.swagger.params.date.value || String(Date.now());
    // Convert date to an instance of Date.  We accept the following formats:
    // 1. Any date format parseable by Javascript Date
    // 2. Milliseconds since the epoch
    var dateObj = new Date(date), tzOffset = 0;
    if (dateObj == 'Invalid Date' || dateObj == NaN) {
        // Parsing didn't work, assume millis since epoch
        var timeVal = parseInt(date);
        if (timeVal == NaN) {
            var err = { 'message': 'Failed to parse date: ' + date};
            res.status(400).json(err);
            return;
        }
        dateObj = new Date(timeVal);
    } else {
	tzOffset = dateObj.getTimezoneOffset();
    }
    // Extract millis since epoch, converting for timezone if the date was parsed
    var dateTime = dateObj.getTime() - (tzOffset * 60 * 1000);
    // If the requested type and region exist in a local snapshot file, then return the appropriate order book from that file
    var regionLocation = process.env.SNAP_DIR + "/regions/" + regionID + "/";
    async.waterfall([
        // Retrieve files in regions location
        function findLocal(cb) {
            fs.readdir(regionLocation, function(err,filelist) {
                // On error, pass null to switch to looking up in the archive
                cb(null, err ? null : filelist);
            });
        },
        // Look for the file with the highest timestamp which does not exceed the requested date/time
	// If all files have a higher timestamp, then we have to look in the online archive.
	// Otherwise, we return the closest found orderbook.
        function checkLocal(filelist, cb) {
            if (filelist) {
                var best = null, bestTime = 0;
                for (var i = 0; i < filelist.length; i++) {
                    var next = filelist[i].split('_');
		    var nextTime = parseInt(next[1]);
		    if (nextTime < dateTime && nextTime > bestTime) {
			best = filelist[i];
			bestTime = nextTime;
		    }
                }
                // Only continue if we found a candidate file.  Otherwise drop through and look in the online archive.
                if (best) {
                    var stream = fs.createReadStream(regionLocation + best);
                    var gunzip = zlib.createUnzip();
                    stream.pipe(gunzip);
                    var rl = readline.createInterface({
                        input: gunzip
                    });
                    var start = true;
		    var orders = [];
                    rl.on('line', function(line) {
                        if (start) {
                            // First line is just a row count, skip
                            start = false;
                        } else {
			    // Convert line to order.  If it has the appropriate type, then save it.
			    var data = new ekmd.Order(line);
			    if (data.typeID == typeID) {
				orders.push(data);
                            }
                        }
                    });
                    rl.on('close', function() {
			// Return the book we found.  Could be empty if this type had no orders at the requested time.
			var bookResult = new ekmd.OrderBook(bestTime, orders);
			res.status(200).json(bookResult);
			return;
                    });
                } else {
                    // Couldn't find a best file, try the online archive
                    cb(null);
                }
            } else {
                // Couldn't get a file list, try the online archive
                cb(null);
            }
        },
        // Attempt lookup in online archive
        function checkOnline(cb) {
	    ekmd.OrderBook.lookup(typeID, regionID, dateObj.getTime(), function(err, book) {
		if (err) {
		    cb(err);
		} else if (book == null) {
		    // Not found, error
		    cb(new Error());
		} else {
		    // Return order book  result
                    res.status(200).json(book);
                    return;
		}
	    });
        }
    ], function def(err,data) {
        if (err) {
            // If we failed to lookup in both locations, then return an error
            var err = { 'message': 'Failed to find order book for type: ' + typeID + ', region: ' + regionID + ', at: ' + date};
            res.status(404).json(err);
        }
    });
}
