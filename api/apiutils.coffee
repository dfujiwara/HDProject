redis = require 'redis'
require('date-utils')
redisClient = redis.createClient()

createNotificationMessage = (station, duration, arrivalTime) ->
    trainArrivalTime = 
        new Date().addMinutes((arrivalTime / 60)).toFormat('MM/DD HH:MIP')
    walk = Math.round(duration / 60).toString() 
    message = "Leave now to get to #{station} station. Train arrives at"
    message += " #{trainArrivalTime}; it will take #{walk} minutes to walk there"
    return message

submitNotificationRequest = (phone, time, message) ->
    callBack = (err, resp) ->
        if err
            console.error("error submitting notification: " + err)
        console.log("submittied notification: " + new Date(notification.time) + 
            ":" + message)
    notification =
        time: time * 1000
        toNum: phone
        fromNum: '+14155992671'
        message: message
    redisClient.zadd("notification", notification.time, JSON.stringify(notification), callBack)    

module.exports.createNotificationMessage = createNotificationMessage
module.exports.submitNotificationRequest = submitNotificationRequest
