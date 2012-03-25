var redis = require('redis');
var client = redis.createClient();

var notification = {};
notification.time = new Date().getTime();
notification.toNum = '+17815263182';
notification.fromNum = '+14155992671';
notification.message = 'Leave now!';

console.log("notifying " + notification.toNum + " @" + notification.time);
client.zadd("notification", notification.time,  JSON.stringify(notification),
    function (err, resp){
        if (err){
            console.error("error response " + err);
        }
        console.log("success with test_client");
}); 
client.quit();
