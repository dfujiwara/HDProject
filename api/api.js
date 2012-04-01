var http = require('http');
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser(); 
var beeline = require('beeline');
var querystring = require('querystring');
var urlPackage = require('url');
var apiutils = require('./apiutils');
var config = require('../common/config');
var step = require('step/lib/step');

var bartFunc = function(req, res, tokens, values){
    var params = {};
    var get_params = urlPackage.parse(req.url, true);
    params.cmd = 'etd';
    params.key = config.bart.key;
    params.dir = get_params.query.dir;
    params.orig = get_params.query.station;
    var url = config.bart.realTimeUrl + '?' + querystring.stringify(params); 
    console.log(url);
    step(
        function start(){
            request(url, this);
        },
        function requestCallback(err, response, body){
            if (err){
                return;
            }
            res.writeHead(response.statusCode, {'Content-Type': 'text/plain'});
            parser.parseString(body, this);
        },
        function parserCallback(err, result){
            if (!err){
                res.end(JSON.stringify(result));
            }
            else{
                res.end("failed!");
            }
        }
    );
};

// distance API
var distanceFunc = function(req, res, tokens, values){
    // get the request GET params
    var get_params = urlPackage.parse(req.url, true);
    var params = {};
    params.origins = get_params.query.origin;
    params.destinations = get_params.query.destination;
    params.sensor = 'false';
    params.mode = 'walking';
    var url = config.google.distanceUrl + "?" + querystring.stringify(params);
    console.log(url);
    step(
        function start(){
            request(url, this);
        },
        function callback(err, response, body){
            res.writeHead(response.statusCode, {'Content-Type': 'text/plain'});
            if (err){
                res.end("failed");
                return;
            }
            res.end(body);
        } 
    );
};

var notifyFunc = function(req, res, tokens, values){
    var post_data = '';
    req.on('data', function(chunk){
        post_data += chunk;
    }); 
    req.on('end', function(){
        var processed_data = querystring.parse(post_data);
        var start_station = processed_data.start.toUpperCase();
        var direction = processed_data.dir;
        var location = processed_data.lat + ',' + processed_data.long
        var phone = processed_data.phone;
        console.log(start_station, direction, location, phone); 

        /* function to calculate the walking distance and time */
        var distanceCalc = function(origin, destination, next){
            step(
                function start(){
                    var params = {};
                    params.origin = origin;
                    params.destination = destination;
                    var url = 'http://localhost:1337/distance/' +  "?" + 
                        querystring.stringify(params);
                    console.log(url);
                    request(url, this);
                },
                function callBack(err, response, body){
                    if (err){
                        console.log("error occurred while calculating");
                        next(err, null);
                        return;
                    }        
                    // retrieve the time it takes to get to that point
                    console.log("distance is " + body);
                    var distanceResult = JSON.parse(body);
                    var duration = distanceResult.rows[0].elements[0].duration;
                    next(err, duration.value);
                }
            );
        }; 
        var notificationTime = function(next){
            step(
                function start(){
                    var params = {}
                    params.station = start_station;
                    params.dir = direction;
                    var url = 'http://localhost:1337/bart/' + '?' + 
                        querystring.stringify(params);
                    request(url, this)
                },
                function callBack(err, response, body){
                    if (err){
                        res.writeHead(500, {'Content-Type': 'text/plain'});
                        res.end("bad bart error");
                        return;
                    }
                    console.log("body is " + body);
                    var bartETD = JSON.parse(body);
                    var bestArrivalTime = null; // fix this
                    for (var i = 0; i < bartETD.station.etd.length; ++i){
                        var etd = bartETD.station.etd[i];
                        for (var j = 0; j < etd.estimate.length; ++j){
                            var arrivalTime = etd.estimate[j].minutes * 60;
                            console.log("duration is " + duration);
                            console.log("arrivalTime is " + arrivalTime); 
                            if (duration < arrivalTime && 
                                (!bestArrivalTime || arrivalTime < bestArrivalTime)){
                                bestArrivalTime = arrivalTime;    
                            }
                        }
                    }
                    next(err, bestArrivalTime);
                }
            );
        };     
        step(
            function start(){
                distanceCalc(location, bartAddress[start_station], 
                    this.parallel());
                notificationTime(this.parallel());    
            },
            function notify(err, duration, arrivalTime){
                var jsonResponse = {'notificationTime': -1,  'phone': phone};
                res.writeHead(200, {'Content-Type': 'text/plain'});
                if (arrivalTime){
                    console.log("best time is " + arrivalTime);
                    var notificationTime = 
                        Math.round(new Date().getTime() / 1000) + 
                        (arrivalTime - duration);
                    apiutils.submitNotificationRequest(phone, notificationTime,
                        apiutils.createNotificationMessage(start_station, 
                        duration, arrivalTime));
                    jsonResponse.notificationTime = notificationTime;
                }
                res.end(JSON.stringify(jsonResponse));
            }    
        );
    }); 
};

var checkFunc = function(req, res){
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end("check func success");
};

var router = beeline.route({
    "/bart/": {'GET': bartFunc},
    '/distance/': {'GET': distanceFunc},
    '/notify/': {'POST': notifyFunc},
    '/check/': {'GET': checkFunc}
});

// initialize function
var bartAddress = {};
step(
    function initialize(){
        var params = {};
        params.cmd = 'stns';
        params.key = config.bart.key;
        var url = config.bart.stationUrl + "?" + querystring.stringify(params);
        debugger;
        request(url, this);
    },
    function parseResponse(err, res, body){
        if (err){
            console.log("error requesting station info");
            return;
        }
        parser.parseString(body, this);
    },
    function populateAddresses(err, result){ 
        if (err){
            console.log("error parsing station info");
            return;
        }
        for (var i = 0; i < result.stations.station.length; ++i) {
            var station = result.stations.station[i];
            var address = station.address + ' ' + 
                station.city + ' ' + station.state + ' ' + station.zipcode;
            bartAddress[station.abbr] = address;
        }
        return true;
    },
    function startServer(err){
        if (err){
            console.error("error occurred: " + err);
        }
        var server = http.createServer(router);
        server.listen(config.HDProject.port, '0.0.0.0');
        console.log("running the server");
    }
);
