http = require("http")
request = require("request")
xml2js = require("xml2js")
parser = new xml2js.Parser()
beeline = require("beeline")
querystring = require("querystring")
urlPackage = require("url")
apiutils = require("./apiutils")
config = require("../common/config")
step = require("step/lib/step")

bartFunc = (req, res, tokens, values) ->
  params = {}
  params.cmd = "etd"
  params.key = config.bart.key
  get_params = urlPackage.parse(req.url, true)
  params.dir = get_params.query.dir
  params.orig = get_params.query.station
  url = config.bart.realTimeUrl + "?" + querystring.stringify(params)
  console.log url
  step (start = ->
    request url, this
    return
  ), (requestCallback = (err, response, body) ->
    if err
        console.log("error:" + err)
        this(err)
        return
    res.writeHead response.statusCode,
      "Content-Type": "text/plain"
    parser.parseString body, this
    return
  ), parserCallback = (err, result) ->
    # check for the error code
    unless err
      console.log(JSON.stringify(result))
      res.end JSON.stringify(result)
    else
      console.log("failed bart!!!!!: " + err)
      res.end "failed! : " + err
    return

distanceFunc = (req, res, tokens, values) ->
  get_params = urlPackage.parse(req.url, true)
  params = {}
  params.origins = get_params.query.origin
  params.destinations = get_params.query.destination
  params.sensor = "false"
  params.mode = "walking"
  url = config.google.distanceUrl + "?" + querystring.stringify(params)
  console.log url
  step (start = ->
    request url, this
    return
  ), callback = (err, response, body) ->
    res.writeHead response.statusCode,
      "Content-Type": "text/plain"

    # check the error code
    if err
      res.end "failed! : " + err
    else
      res.end body
    return

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
    distanceCalc = (origin, destination, next) ->
      step (start = ->
        params = {}
        params.origin = origin
        params.destination = destination
        url = "http://localhost:1337/distance/" + "?" + querystring.stringify(params)
        console.log url
        request url, this
        return
      ), callBack = (err, response, body) ->
        if err
          console.log "error occurred while calculating"
          next err, null
          return
        console.log "distance is " + body
        distanceResult = JSON.parse(body)
        duration = distanceResult.rows[0].elements[0].duration
        next err, duration.value

    notificationTime = (next) ->
      step (start = ->
        params = {}
        params.station = start_station
        params.dir = direction
        url = "http://localhost:1337/bart/" + "?" + querystring.stringify(params)
        console.log url
        request url, this
        return
      ), callBack = (err, response, body) ->
        if err
          res.writeHead 500,
            "Content-Type": "text/plain"

          res.end "bad bart error"
          return
        console.log "body is " + body
        bartETD = JSON.parse(body)
        console.dir bartETD.station.etd

        arrivalEstimates = []
        for etd in bartETD.station.etd
            if etd.estimate instanceof Array
              for estimate in etd.estimate
                arrivalEstimates.push(estimate)
            else 
              arrivalEstimates.push(etd.estimate)
        next err, arrivalEstimates

    step (start = ->
      distanceCalc location, bartAddress[start_station], @parallel()
      notificationTime @parallel()
    ), notify = (err, duration, arrivalETDs) ->
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
  "/bart/":
    GET: bartFunc
  "/distance/":
    GET: distanceFunc
  "/notify/":
    POST: notifyFunc
  "/check/":
    GET: checkFunc
)

bartAddress = {}
step (initialize = ->
  params = {}
  params.cmd = "stns"
  params.key = config.bart.key
  url = config.bart.stationUrl + "?" + querystring.stringify(params)
  console.log url
  request(url, this)
  return
), 
(parseResponse = (err, res, body) ->
  if err
    console.log("error requesting station info")
    return
  parser.parseString(body, this)
  return
), 
(populateAddresses = (err, result) ->
  if err
    console.log("error parsing station info: " + err)
    this(true)
    return
  for station in result.stations.station
    address = "#{station.address} #{station.city} #{station.state} #{station.zipcode}"
    bartAddress[station.abbr] = address
  this(false)
  return
), 
(startServer = (err) ->
  if err
     console.log("not starting the server")
     return
  console.error "error occurred: " + err  if err
  server = http.createServer(router)
  server.listen(config.HDProject.port, "0.0.0.0")
  console.log("running the server")
)
