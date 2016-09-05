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
  livebook: livebook
};

function livebook(req, res) {
    var typeID = req.swagger.params.typeID.value || [];
    var regionID = req.swagger.params.regionID.value || -1;
    // If the requested types and region exist in a local snapshot file, then return the appropriate order book from that file
    var regionLocation = process.env.SNAP_DIR + "/regions/" + regionID + "/";
    async.waterfall([
        // Retrieve files in regions location
        function findLocal(cb) {
            fs.readdir(regionLocation, function(err,filelist) {
                // On error, pass null to switch to looking up in the archive
                cb(null, err ? null : filelist);
            });
        },
        // Look for the file with the highest timestamp.
        function checkLocal(filelist, cb) {
            if (filelist) {
                var best = null, bestTime = 0;
                for (var i = 0; i < filelist.length; i++) {
                    var next = filelist[i].split('_');
		    var nextTime = parseInt(next[1]);
		    if (nextTime > bestTime) {
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
		    var orderMap = {};
		    for (var i = 0; i < typeID.length; i++) {
			orderMap[typeID[i]] = [];
		    }
                    rl.on('line', function(line) {
                        if (start) {
                            // First line is just a row count, skip
                            start = false;
                        } else {
			    // Convert line to order.  If it has the appropriate type, then save it.
			    var data = new ekmd.Order(line);
			    if (typeID.indexOf(data.typeID) != -1) {
				orderMap[data.typeID].push(data);
                            }
                        }
                    });
                    rl.on('close', function() {
			// Return the set of books we found.  A given book could be empty if the associated type had no orders.
			// Raw snaps don't sort orders, so do that here.
			// bids from highest to lowest price
			// asks from lowest to highest price
			var bookList = []
			for (var i = 0; i < typeID.length; i++) {
			    var nextType = typeID[i];
			    var bids = []
			    var asks = []
			    for (var j = 0; j < orderMap[nextType].length; j++) {
				if (orderMap[nextType][j].buy) {
				    bids.push(orderMap[nextType][j]);
				} else {
				    asks.push(orderMap[nextType][j]);
				}
			    }
			    bids.sort(function(a, b) {
				if (a.price > b.price) return -1;
				if (a.price < b.price) return 1;
				return 0;
			    });
			    asks.sort(function(a, b) {
				if (a.price > b.price) return 1;
				if (a.price < b.price) return -1;
				return 0;
			    });
			    bookList.push(new ekmd.OrderBook(bestTime, bids.concat(asks), nextType, regionID));
			}
			res.status(200).json(bookList);
			return;
                    });
                } else {
                    // Couldn't find a best file, error
                    cb(new Error());
                }
            } else {
                // Couldn't get a file list, error
                cb(new Error());
            }
        }
    ], function def(err,data) {
        if (err) {
            // If we failed to lookup in both locations, then return an error
            var err = { 'message': 'Failed to find order book for type: ' + typeID + ', region: ' + regionID + ', at: ' + date};
            res.status(404).json(err);
        }
    });
}
