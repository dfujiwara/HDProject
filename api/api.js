var http = require('http');
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser(); 
var beeline = require('beeline');
var querystring = require('querystring');

var bartUrlBase = "http://api.bart.gov/api/etd.aspx?cmd=etd";
var bartFunc = function(req, res, tokens, values){
        var params = {};
        var key = 'MW9S-E7SL-26DU-VV8V';
        var direction = 'n';
        params.key = key;
        params.dir = direction;
        params.orig = tokens.station;
        var url = bartUrlBase + "&" + querystring.stringify(params); 
        function requestCallback(error, response, body){
            function parserCallback(err, result){
                if (!err){
                    res.writeHead(response, {'Content-Type': 'text/plain'});
                    res.end(JSON.stringify(result));
                }
                else{
                    res.end("failed!");
                }
            }
             parser.parseString(body, parserCallback);
        }
        request(url, requestCallback);
};

var distanceUrlBase = 
    'https://maps.googleapis.com/maps/api/distancematrix/json';
var distanceFunc = function(req, res, tokens, values){
    var params = {};
    params.origins = "300 Bush St San Francisco CA";
    params.destinations = "110 Sutter St San Francisco CA";
    params.sensor = 'false';
    params.mode = 'walking';
    var url = distanceUrlBase + "?" + querystring.stringify(params);
    request(url, function(err, response, body){
        res.writeHead(response, {'Content-Type': 'text/plain'});
        if (err){
            res.end("failed");
        }
        res.end(body);
    });
};

var router = beeline.route({
    // doesn't work
    //"/bart/`station`": {'GET': bartFunc},
    "/bart/`station`": bartFunc,
    '/distance': {'GET': distanceFunc} 
});

var server = http.createServer(router);
server.listen(1337, '127.0.0.1');
console.log("running the server");
