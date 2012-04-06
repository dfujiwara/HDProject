twilio =
    SID: 'AC0c53da20b1544ef7a3cbd96ccaf8466f'
    AUTH_TOKEN: '805bef776331da4a21fbd6870306e2fd'

bart = 
    key: 'MW9S-E7SL-26DU-VV8V' 
    stationUrl:  'http://api.bart.gov/api/stn.aspx'
    realTimeUrl: 'http://api.bart.gov/api/etd.aspx'

google = 
    distanceUrl: 'https://maps.googleapis.com/maps/api/distancematrix/json'

HDProject =
    port: process.env.PORT || 3000; 
    domain: 'localhost'

module.exports.twilio = twilio
module.exports.bart = bart
module.exports.google = google
module.exports.HDProject = HDProject
