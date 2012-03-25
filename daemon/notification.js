var redis = require('redis'),
    twilio = require('twilio'),
    config = require('../common/config');
// how to pool connection
var client = redis.createClient();

console.log(config.twilio);
var twilioRestClient = new twilio.RestClient(config.twilio.SID, 
    config.twilio.AUTH_TOKEN);

var suc = function (){
    console.log('success!!');
};
var err = function (){
    console.log('error sms');
};

setInterval(function() {
    var timestamp = new Date().getTime();
    client.zrangebyscore("notification", 0, timestamp, function(err, values){
        if (err){
            return console.error("error happened " + err);
        }
        for (var i = 0; i < values.length; ++i){
            var notification = JSON.parse(values[i]);
            console.log(notification);
            var fromNum = notification.fromNum;
            var toNum = notification.toNum;
            var message = notification.message;
            twilioRestClient.sendSms(fromNum, toNum, message, '', suc, err);
            client.zrem("notification", values[i], function(err){
                // perhaps log it somewhere
                console.log("removed");
            });
        }
    });
}, 5000);

