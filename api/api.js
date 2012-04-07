(function() {
  var apiutils, bartAddress, bartFunc, beeline, checkFunc, config, distanceFunc, http, initialize, notifyFunc, parseResponse, parser, populateAddresses, querystring, request, router, startServer, step, urlPackage, xml2js;

  http = require("http");

  request = require("request");

  xml2js = require("xml2js");

  parser = new xml2js.Parser();

  beeline = require("beeline");

  querystring = require("querystring");

  urlPackage = require("url");

  apiutils = require("./apiutils");

  config = require("../common/config");

  step = require("stepc");

  bartFunc = function(station, direction, next) {
    var params, parserCallback, requestCallback, start, url;
    params = {};
    params.cmd = "etd";
    params.key = config.bart.key;
    params.dir = direction;
    params.orig = station;
    url = config.bart.realTimeUrl + "?" + querystring.stringify(params);
    console.log(url);
    return step.async((start = function() {
      return request(url, this);
    }), (requestCallback = function(err, response, body) {
      if (err) throw err;
      return parser.parseString(body, this);
    }), parserCallback = function(err, bartETD) {
      var arrivalEstimates, estimate, etd, _i, _j, _len, _len2, _ref, _ref2;
      if (err) next(err, []);
      console.dir(bartETD.station.etd);
      arrivalEstimates = [];
      _ref = bartETD.station.etd;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        etd = _ref[_i];
        if (etd.estimate instanceof Array) {
          _ref2 = etd.estimate;
          for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
            estimate = _ref2[_j];
            arrivalEstimates.push(estimate);
          }
        } else {
          arrivalEstimates.push(etd.estimate);
        }
      }
      console.dir(arrivalEstimates);
      return next(err, arrivalEstimates);
    });
  };

  distanceFunc = function(origin, destination, next) {
    var callBack, params, start, url;
    params = {};
    params.origins = origin;
    params.destinations = destination;
    params.sensor = "false";
    params.mode = "walking";
    url = config.google.distanceUrl + "?" + querystring.stringify(params);
    console.log(url);
    return step.async((start = function() {
      return request(url, this);
    }), callBack = function(err, response, body) {
      var distanceResult, duration;
      if (err) {
        console.log("error occurred while calculating");
        next(err, null);
        return;
      }
      console.log("distance is " + body);
      distanceResult = JSON.parse(body);
      duration = distanceResult.rows[0].elements[0].duration;
      return next(err, duration.value);
    });
  };

  notifyFunc = function(req, res, tokens, values) {
    var post_data;
    post_data = "";
    req.on("data", function(chunk) {
      return post_data += chunk;
    });
    return req.on("end", function() {
      var direction, location, notify, phone, processed_data, start, start_station;
      processed_data = querystring.parse(post_data);
      start_station = processed_data.start.toUpperCase();
      direction = processed_data.dir;
      location = processed_data.lat + "," + processed_data.long;
      phone = processed_data.phone;
      if (!(start_station && direction && location && phone)) {
        res.writeHead(200, {
          "Content-Type": "text/plain"
        });
        res.end("not all parameters were provided");
        return;
      }
      console.log(start_station, direction, location, phone);
      return step.async((start = function() {
        distanceFunc(location, bartAddress[start_station], this.parallel());
        return bartFunc(start_station, direction, this.parallel());
      }), notify = function(err, duration, arrivalETDs) {
        var arrivalETD, arrivalTime, bestArrivalTime, jsonResponse, message, notificationTime, _i, _len;
        console.log(duration, arrivalETDs);
        jsonResponse = {
          notificationTime: -1,
          phone: phone
        };
        res.writeHead(200, {
          "Content-Type": "text/plain"
        });
        bestArrivalTime = null;
        for (_i = 0, _len = arrivalETDs.length; _i < _len; _i++) {
          arrivalETD = arrivalETDs[_i];
          arrivalTime = arrivalETD.minutes * 60;
          console.log("duration is " + duration);
          console.log("arrivalTime is " + arrivalTime);
          if (duration < arrivalTime && (!bestArrivalTime || arrivalTime < bestArrivalTime)) {
            bestArrivalTime = arrivalTime;
          }
        }
        if (bestArrivalTime) {
          console.log("best time is " + bestArrivalTime);
          notificationTime = Math.round(new Date().getTime() / 1000) + (bestArrivalTime - duration);
          message = apiutils.createNotificationMessage(start_station, duration, bestArrivalTime);
          apiutils.submitNotificationRequest(phone, notificationTime, message);
          jsonResponse.notificationTime = notificationTime;
          jsonResponse.message;
        }
        return res.end(JSON.stringify(jsonResponse));
      });
    });
  };

  checkFunc = function(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });
    return res.end("check func success");
  };

  router = beeline.route({
    "/notify/": {
      POST: notifyFunc
    },
    "/check/": {
      GET: checkFunc
    }
  });

  bartAddress = {};

  step.async((initialize = function() {
    var params, url;
    params = {};
    params.cmd = "stns";
    params.key = config.bart.key;
    url = config.bart.stationUrl + "?" + querystring.stringify(params);
    console.log(url);
    return request(url, this);
  }), (parseResponse = function(err, res, body) {
    if (err) {
      console.log("error requesting station info");
      throw err;
    }
    return parser.parseString(body, this);
  }), (populateAddresses = function(err, result) {
    var address, station, _i, _len, _ref;
    if (err) {
      console.log("error parsing station info: " + err);
      throw err;
    }
    _ref = result.stations.station;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      station = _ref[_i];
      address = "" + station.address + " " + station.city + " " + station.state + " " + station.zipcode;
      bartAddress[station.abbr] = address;
    }
  }), (startServer = function(err) {
    var server;
    if (err) throw err;
    server = http.createServer(router);
    server.listen(config.HDProject.port, "0.0.0.0");
    return console.log("running the server");
  }));

}).call(this);
