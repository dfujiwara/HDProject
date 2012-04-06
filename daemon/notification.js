(function() {
  var callBack, config, errorHandler, redis, redisClient, timer, twilio, twilioRestClient;

  config = require('../common/config');

  redis = require('redis');

  redisClient = redis.createClient();

  twilio = require('twilio');

  twilioRestClient = new twilio.RestClient(config.twilio.SID, config.twilio.AUTH_TOKEN);

  errorHandler = function(err) {
    if (err) {
      return console.error("error removing: " + err);
    } else {
      return console.log("removed");
    }
  };

  callBack = function(err, values) {
    var fromNum, message, notification, toNum, value, _i, _len, _results;
    if (err) return console.error("error happened: " + err);
    _results = [];
    for (_i = 0, _len = values.length; _i < _len; _i++) {
      value = values[_i];
      notification = JSON.parse(value);
      console.log(notification);
      fromNum = notification.fromNum;
      toNum = notification.toNum;
      message = notification.message;
      twilioRestClient.sendSms(fromNum, toNum, message, '');
      _results.push(redisClient.zrem("notification", value, errorHandler));
    }
    return _results;
  };

  timer = function() {
    var timestamp;
    timestamp = new Date().getTime();
    return redisClient.zrangebyscore("notification", 0, timestamp, callBack);
  };

  setInterval(timer, 5000);

}).call(this);
