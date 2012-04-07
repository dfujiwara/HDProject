http = require("http")
request = require("request")
xml2js = require("xml2js")
parser = new xml2js.Parser()
beeline = require("beeline")
querystring = require("querystring")
urlPackage = require("url")
apiutils = require("./apiutils")
config = require("../common/config")
step = require("stepc")

bartFunc = (station, direction, next) ->
  params = {}
  params.cmd = "etd"
  params.key = config.bart.key
  params.dir = direction 
  params.orig = station
  url = config.bart.realTimeUrl + "?" + querystring.stringify(params)
  console.log url
  step.async (start = ->
    request url, this
  ), (requestCallback = (err, response, body) ->
    if err
        throw err
    parser.parseString body, this
  ), parserCallback = (err, bartETD) ->
    # check for the error code
    if err
      next(err, [])
    console.dir bartETD.station.etd

    arrivalEstimates = []
    for etd in bartETD.station.etd
        if etd.estimate instanceof Array
          for estimate in etd.estimate
            arrivalEstimates.push(estimate)
        else 
          arrivalEstimates.push(etd.estimate)
    console.dir(arrivalEstimates)
    next(err, arrivalEstimates)

distanceFunc = (origin, destination, next) ->
  params = {}
  params.origins = origin
  params.destinations = destination
  params.sensor = "false"
  params.mode = "walking"
  url = config.google.distanceUrl + "?" + querystring.stringify(params)
  console.log url
  step.async (start = ->
    request url, this
  ), callBack = (err, response, body) ->
    if err
      console.log "error occurred while calculating"
      next err, null
      return
    console.log "distance is " + body
    distanceResult = JSON.parse(body)
    duration = distanceResult.rows[0].elements[0].duration
    next err, duration.value

notifyFunc = (req, res, tokens, values) ->
  post_data = ""
  req.on "data", (chunk) ->
    post_data += chunk

  req.on "end", ->
    processed_data = querystring.parse(post_data)
    start_station = processed_data.start.toUpperCase()
    direction = processed_data.dir
    location = processed_data.lat + "," + processed_data.long
    phone = processed_data.phone
    
    if not (start_station and direction and location and phone)
        res.writeHead 200,
          "Content-Type": "text/plain"
        res.end("not all parameters were provided") 
        return

    console.log start_station, direction, location, phone
      
    step.async (start = ->
      distanceFunc location, bartAddress[start_station], @parallel()
      bartFunc start_station, direction, @parallel()
    ), notify = (err, duration, arrivalETDs) ->
      console.log duration, arrivalETDs
      jsonResponse =
        notificationTime: -1
        phone: phone

      res.writeHead 200,
        "Content-Type": "text/plain"

      bestArrivalTime = null 
      for arrivalETD in arrivalETDs 
        arrivalTime = arrivalETD.minutes * 60
        console.log "duration is " + duration
        console.log "arrivalTime is " + arrivalTime
        bestArrivalTime = arrivalTime if duration < arrivalTime and (not bestArrivalTime or arrivalTime < bestArrivalTime)

      if bestArrivalTime 
        console.log "best time is " + bestArrivalTime 
        notificationTime = Math.round(new Date().getTime() / 1000) + (bestArrivalTime - duration)
        message = apiutils.createNotificationMessage(start_station, duration, bestArrivalTime)
        apiutils.submitNotificationRequest phone, notificationTime, message 
        jsonResponse.notificationTime = notificationTime
        jsonResponse.message
      res.end JSON.stringify(jsonResponse)

checkFunc = (req, res) ->
  res.writeHead(200, {"Content-Type": "text/plain"})
  res.end "check func success"

router = beeline.route(
  "/notify/":
    POST: notifyFunc
  "/check/":
    GET: checkFunc
)

bartAddress = {}
step.async (initialize = ->
  params = {}
  params.cmd = "stns"
  params.key = config.bart.key
  url = config.bart.stationUrl + "?" + querystring.stringify(params)
  console.log url
  request(url, this)
), 
(parseResponse = (err, res, body) ->
  if err
    console.log("error requesting station info")
    throw err
  parser.parseString(body, this)
), 
(populateAddresses = (err, result) ->
  if err
    console.log("error parsing station info: " + err)
    throw err
  for station in result.stations.station
    address = "#{station.address} #{station.city} #{station.state} #{station.zipcode}"
    bartAddress[station.abbr] = address
  return
), 
(startServer = (err) ->
  if err
    throw err
  server = http.createServer(router)
  server.listen(config.HDProject.port, "0.0.0.0")
  console.log("running the server")
)
