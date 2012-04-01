config = require '../common/config'
redis = require 'redis'
redisClient = redis.createClient()
twilio = require 'twilio'
twilioRestClient = new twilio.RestClient(config.twilio.SID, 
    config.twilio.AUTH_TOKEN);

errorHandler = (err) ->
    if err
        console.error("error removing: " + err)
    else
        console.log("removed")
callBack = (err, values) ->
    if err
        return console.error("error happened: " + err)
    for value in values
        notification = JSON.parse(value)
        console.log(notification)
        fromNum = notification.fromNum;
        toNum = notification.toNum;
        message = notification.message;
        twilioRestClient.sendSms(fromNum, toNum, message, '');
        redisClient.zrem("notification", value, errorHandler)
timer = () ->
    timestamp = new Date().getTime()
    redisClient.zrangebyscore("notification", 0, timestamp, callBack) 

setInterval(timer, 5000)

