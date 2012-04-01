var http = require('http');
var request = require('request');
var xml2js = require('xml2js');
var parser = new xml2js.Parser(); 
var beeline = require('beeline');
var querystring = require('querystring');
var urlPackage = require('url');
var redis = require('redis');
var client = redis.createClient();

// bart API
var bartUrlBase = "http://api.bart.gov/api/etd.aspx?";
var bartStationUrlBase = "http://api.bart.gov/api/stn.aspx"; 
var bartKey = 'MW9S-E7SL-26DU-VV8V';

var bartFunc = function(req, res, tokens, values){
   var params = {};
   var get_params = urlPackage.parse(req.url, true);
   params.cmd = 'etd';
   params.key = bartKey;
   params.dir = get_params.query.dir;
   params.orig = get_params.query.station;

   var url = bartUrlBase + querystring.stringify(params); 
   console.log(url);
   function requestCallback(error, response, body){
     function parserCallback(err, result){
       res.writeHead(response.statusCode, {'Content-Type': 'text/plain'});
       if (!err){
         res.end(JSON.stringify(result));
       }
       else{
         res.end("failed!");
       }
     }
     // parse the results into JSON
     parser.parseString(body, parserCallback);
   }
   request(url, requestCallback);
};

// distance API
var distanceUrlBase = 
    'https://maps.googleapis.com/maps/api/distancematrix/json?';
var distanceFunc = function(req, res, tokens, values){
    // get the request GET params
    var get_params = urlPackage.parse(req.url, true);
    var params = {};
    params.origins = get_params.query.origin;
    params.destinations = get_params.query.destination;
    params.sensor = 'false';
    params.mode = 'walking';
    var url = distanceUrlBase + querystring.stringify(params);
    request(url, function(err, response, body){
        res.writeHead(response.statusCode, {'Content-Type': 'text/plain'});
        if (err){
            res.end("failed");
            return;
        }
        res.end(body);
    });
};

/* function to calculate the walking distance and time */
var distanceCalc = function(start, end, next){
    var params = {};
    params.origin = start;
    params.destination = end;
    var url = 'http://localhost:1337/distance/' +  "?" + 
        querystring.stringify(params);
    request(url, function(err, response, body){
        if (err){
            console.log("error occurred while calculating");
            next(err, null);
            return;
        }        
        // retrieve the time it takes to get to that point
        var distanceResult = JSON.parse(body);
        var duration = distanceResult.rows[0].elements[0].duration;
        next(err, duration.value);
    });
}; 

/* submit notification request */
var submitNotificationRequest = function(phone, time, message){
    var notification = {};
    notification.time = time * 1000;
    notification.toNum = phone;
    notification.fromNum = '+14155992671';
    notification.message = message; 
    client.zadd("notification", notification.time,  
        JSON.stringify(notification),
        function (err, resp){
            if (err){
                console.error("error submitted notification: " + err);
                return;
            }
            console.log("submitted notification for " + 
                new Date(notification.time * 1000));
    });
}

/* create notification message */
var createNotificationMessage = function(station, duration, arrivalTime){
    var message = "Leave now to get to " + station + " station. ";
    message += "Train arrives in " + 
        (arrivalTime / 60).toString()+ " minutes; ";
    message += "it will take " + (duration / 60).toString() + 
        " minutes to walk there.";
    return message;
}
 
var notifyFunc = function(req, res, tokens, values){
    var post_data = '';
    req.on('data', function(chunk){
        post_data += chunk;
    }); 
    req.on('end', function(){
        var processed_data = querystring.parse(post_data);
        var start_station = processed_data.start;
        var direction = processed_data.dir;
        var location = processed_data.location;
        var phone = processed_data.phone;
        var notificationTime = function(err, duration){
            if (err){
                res.writeHead(500, {'Content-Type': 'text/plain'});
                res.end("something went wrong");
                return;
            }
            var params = {}
            params.station = start_station;
            params.dir = direction;
            var url = 'http://localhost:1337/bart/' + '?' + 
                querystring.stringify(params);
            request(url, function(err, response, body){
                if (err){
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    res.end("bad bart error");
                    return;
                }
                var bartETD = JSON.parse(body);
                var bestArrivalTime = 10000000; // fix this
                for (var i = 0; i < bartETD.station.etd.length; ++i){
                    var etd = bartETD.station.etd[i];
                    for (var j = 0; j < etd.estimate.length; ++j){
                        var arrivalTime = etd.estimate[j].minutes * 60;
                        console.log("duration is " + duration);
                        console.log("arrivalTime is " + arrivalTime); 
                        if (duration < arrivalTime && 
                            arrivalTime < bestArrivalTime){
                            bestArrivalTime = arrivalTime;    
                        }
                    }
                }
                if (bestArrivalTime){
                    console.log("best time is " + bestArrivalTime);
                    var notificationTime = 
                        Math.round(new Date().getTime() / 1000) + 
                        (bestArrivalTime - duration);
                    submitNotificationRequest(phone, notificationTime,
                        createNotificationMessage(start_station, 
                        duration, bestArrivalTime));
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    res.end("will get notified at " + 
                        new Date(notificationTime * 1000) + " to " + phone);
                    return; 
                }
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end("NO TIME!");
            });
        };     
        var distanceTravel = distanceCalc(location, 
            bartAddress[start_station], notificationTime);      
    }); 
};

var checkFunc = function(req, res){
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end("hello world");
};

var router = beeline.route({
    //"/bart/`station`": {'GET': bartFunc}, // doesn't work
    "/bart/": {'GET': bartFunc},
    '/distance/': {'GET': distanceFunc},
    '/notify/': {'POST': notifyFunc},
    '/check/': {'GET': checkFunc}
});

// initialize function
var bartAddress = {};
(function (){
    // get all bart station information first
    var params = {}
    params.cmd = 'stns';
    params.key = bartKey;
    var url = bartStationUrlBase + "?" + querystring.stringify(params);
    request(url, function(err, response, body){
        if (err){
            console.log("error requesting station info");
            return;
        }
        parser.parseString(body, function(err, result){  
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
            var server = http.createServer(router);
            server.listen(1337, '0.0.0.0');
            console.log("running the server");
        });
    });
})();
