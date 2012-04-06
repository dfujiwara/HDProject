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

  step = require("step/lib/step");

  bartFunc = function(req, res, tokens, values) {
    var get_params, params, parserCallback, requestCallback, start, url;
    params = {};
    params.cmd = "etd";
    params.key = config.bart.key;
    get_params = urlPackage.parse(req.url, true);
    params.dir = get_params.query.dir;
    params.orig = get_params.query.station;
    url = config.bart.realTimeUrl + "?" + querystring.stringify(params);
    console.log(url);
    return step((start = function() {
      request(url, this);
    }), (requestCallback = function(err, response, body) {
      if (err) {
        console.log("error:" + err);
        this(err);
        return;
      }
      res.writeHead(response.statusCode, {
        "Content-Type": "text/plain"
      });
      parser.parseString(body, this);
    }), parserCallback = function(err, result) {
      if (!err) {
        console.log(JSON.stringify(result));
        res.end(JSON.stringify(result));
      } else {
        console.log("failed bart!!!!!: " + err);
        res.end("failed! : " + err);
      }
    });
  };

  distanceFunc = function(req, res, tokens, values) {
    var callback, get_params, params, start, url;
    get_params = urlPackage.parse(req.url, true);
    params = {};
    params.origins = get_params.query.origin;
    params.destinations = get_params.query.destination;
    params.sensor = "false";
    params.mode = "walking";
    url = config.google.distanceUrl + "?" + querystring.stringify(params);
    console.log(url);
    return step((start = function() {
      request(url, this);
    }), callback = function(err, response, body) {
      res.writeHead(response.statusCode, {
        "Content-Type": "text/plain"
      });
      if (err) {
        res.end("failed! : " + err);
      } else {
        res.end(body);
      }
    });
  };

  notifyFunc = function(req, res, tokens, values) {
    var post_data;
    post_data = "";
    req.on("data", function(chunk) {
      return post_data += chunk;
    });
    return req.on("end", function() {
      var direction, distanceCalc, location, notificationTime, notify, phone, processed_data, start, start_station;
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
      distanceCalc = function(origin, destination, next) {
        var callBack, start;
        return step((start = function() {
          var params, url;
          params = {};
          params.origin = origin;
          params.destination = destination;
          url = "http://localhost:1337/distance/" + "?" + querystring.stringify(params);
          console.log(url);
          request(url, this);
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
      notificationTime = function(next) {
        var callBack, start;
        return step((start = function() {
          var params, url;
          params = {};
          params.station = start_station;
          params.dir = direction;
          url = "http://localhost:1337/bart/" + "?" + querystring.stringify(params);
          console.log(url);
          request(url, this);
        }), callBack = function(err, response, body) {
          var arrivalEstimates, bartETD, estimate, etd, _i, _j, _len, _len2, _ref, _ref2;
          if (err) {
            res.writeHead(500, {
              "Content-Type": "text/plain"
            });
            res.end("bad bart error");
            return;
          }
          console.log("body is " + body);
          bartETD = JSON.parse(body);
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
          return next(err, arrivalEstimates);
        });
      };
      return step((start = function() {
        distanceCalc(location, bartAddress[start_station], this.parallel());
        return notificationTime(this.parallel());
      }), notify = function(err, duration, arrivalETDs) {
        var arrivalETD, arrivalTime, bestArrivalTime, jsonResponse, message, _i, _len;
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
    "/bart/": {
      GET: bartFunc
    },
    "/distance/": {
      GET: distanceFunc
    },
    "/notify/": {
      POST: notifyFunc
    },
    "/check/": {
      GET: checkFunc
    }
  });

  bartAddress = {};

  step((initialize = function() {
    var params, url;
    params = {};
    params.cmd = "stns";
    params.key = config.bart.key;
    url = config.bart.stationUrl + "?" + querystring.stringify(params);
    console.log(url);
    request(url, this);
  }), (parseResponse = function(err, res, body) {
    if (err) {
      console.log("error requesting station info");
      return;
    }
    parser.parseString(body, this);
  }), (populateAddresses = function(err, result) {
    var address, station, _i, _len, _ref;
    if (err) {
      console.log("error parsing station info: " + err);
      this(true);
      return;
    }
    _ref = result.stations.station;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      station = _ref[_i];
      address = "" + station.address + " " + station.city + " " + station.state + " " + station.zipcode;
      bartAddress[station.abbr] = address;
    }
    this(false);
  }), (startServer = function(err) {
    var server;
    if (err) {
      console.log("not starting the server");
      return;
    }
    if (err) console.error("error occurred: " + err);
    server = http.createServer(router);
    server.listen(config.HDProject.port, "0.0.0.0");
    return console.log("running the server");
  }));

}).call(this);
