'use strict';

var fs = require('fs');
var async = require('async');
var zlib = require('zlib');
var readline = require('readline');
var https = require('https');
var url = require('url');
var buffer = require('buffer');
var ekmd = require('../helpers/evekit_market');

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

module.exports = {
  history: history
};

function history(req, res) {
    var typeID = req.swagger.params.typeID.value || -1;
    var regionID = req.swagger.params.regionID.value || -1;
    var date = req.swagger.params.date.value || String(Date.now());
    // Convert date to an instance of Date.  We accept the following formats:
    // 1. Any date format parseable by Javascript Date
    // 2. Milliseconds since the epoch
    var dateObj = new Date(date);
    if (dateObj == 'Invalid Date' || dateObj == NaN) {
        // Parsing didn't work, assume millis since epoch
        var timeVal = parseInt(date);
        if (timeVal == NaN) {
            var err = { 'message': 'Failed to parse date: ' + date};
            res.status(400).json(err);
            return;
        }
        dateObj = new Date(timeVal);
    }
    var dateTime = dateObj.getTime() - (dateObj.getTime() % MILLIS_PER_DAY);
    // If the requested type and region exist in a local snapshot file, then return that file
    var historyLocation = process.env.SNAP_DIR + "/history/" + typeID + "/";
    async.waterfall([
        // Retrieve files in history location
        function findLocal(cb) {
            fs.readdir(historyLocation, function(err,filelist) {
                // On error, pass null to switch to looking up in the archive
                cb(null, err ? null : filelist);
            });
        },
        // Look for latest region file and see if data for the requested data exists
        function checkLocal(filelist, cb) {
            if (filelist) {
                var best = null;
                for (var i = 0; i < filelist.length; i++) {
                    var next = filelist[i].split('_');
                    if (next[2] == regionID) {
                        if (best == null) {
                            best = filelist[i];
                        } else {
                            var bsplit = best.split('_');
                            if (parseInt(next[1]) > parseInt(bsplit[1])) {
                                best = filelist[i];
                            }
                        }
                    }
                }
                // Only continue if we found a candidate file.  Otherwise drop through and look in the online archive.
                if (best) {
                    var stream = fs.createReadStream(historyLocation + best);
                    var gunzip = zlib.createUnzip();
                    stream.pipe(gunzip);
                    var rl = readline.createInterface({
                        input: gunzip
                    });
                    var start = true
                    var found = false;
                    rl.on('line', function(line) {
                        if (found) return;
                        if (start) {
                            // First line is just a row count, skip
                            start = false;
                        } else {
                            // Check if line contains needed data
                            var data = line.split(',');
                            if (parseInt(data[7]) == dateTime) {
                                found = true;
                                var market = new ekmd.MarketHistory(line);
                                res.status(200).json(market);
                            }
                        }
                    });
                    rl.on('close', function() {
                        if (!found) {
                            // We never found a usable line, try the online archive
                            cb(null);
                        }
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
	    ekmd.MarketHistory.lookup(typeID, regionID, dateObj.getTime(), function(err, history) {
		if (err) {
		    cb(err);
		} else if (history == null) {
		    // Not found, error
		    cb(new Error());
		} else {
		    // Return history result
                    res.status(200).json(history);
                    return;
		}
	    });
        }
    ], function def(err,data) {
        if (err) {
            // If we failed to lookup in both locations, then return an error
            var err = { 'message': 'Failed to find market history for type: ' + typeID + ', region: ' + regionID + ', on date: ' + date};
            res.status(404).json(err);
        }
    });
}
