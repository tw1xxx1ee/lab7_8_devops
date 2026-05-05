let express = require('express');
let path = require('path');
let fs = require('fs');
let MongoClient = require('mongodb').MongoClient;
let bodyParser = require('body-parser');
let client = require('prom-client');
let app = express();

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

const mongoConnectionsActive = new client.Gauge({
  name: 'mongo_connections_active',
  help: 'Currently active MongoDB connections from this process'
});

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.path,
      status_code: res.statusCode
    });
    end({ method: req.method, route: req.path });
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, "index.html"));
  });

app.get('/health', function (req, res) {
  res.status(200).send('ok');
});

app.get('/profile-picture', function (req, res) {
  let img = fs.readFileSync(path.join(__dirname, "images/profile-1.jpg"));
  res.writeHead(200, {'Content-Type': 'image/jpg' });
  res.end(img, 'binary');
});

let mongoUrlLocal = "mongodb://admin:password@localhost:27017";
let mongoUrlDockerCompose = "mongodb://admin:password@mongodb";
let mongoUrl = process.env.MONGO_URL || mongoUrlLocal;

let mongoClientOptions = { useNewUrlParser: true, useUnifiedTopology: true };

let databaseName = "user-account";
let collectionName = "users";

app.get('/get-profile', function (req, res) {
  let response = {};
  mongoConnectionsActive.inc();
  MongoClient.connect(mongoUrl, mongoClientOptions, function (err, client) {
    if (err) { mongoConnectionsActive.dec(); throw err; }

    let db = client.db(databaseName);

    let myquery = { userid: 1 };

    db.collection(collectionName).findOne(myquery, function (err, result) {
      if (err) { mongoConnectionsActive.dec(); throw err; }
      response = result;
      client.close();
      mongoConnectionsActive.dec();

      res.send(response ? response : {});
    });
  });
});

app.post('/update-profile', function (req, res) {
  let userObj = req.body;
  mongoConnectionsActive.inc();
  MongoClient.connect(mongoUrl, mongoClientOptions, function (err, client) {
    if (err) { mongoConnectionsActive.dec(); throw err; }

    let db = client.db(databaseName);
    userObj['userid'] = 1;

    let myquery = { userid: 1 };
    let newvalues = { $set: userObj };

    db.collection(collectionName).updateOne(myquery, newvalues, {upsert: true}, function(err, result) {
      if (err) { mongoConnectionsActive.dec(); /* swallow */ }
      client.close();
      mongoConnectionsActive.dec();
    });

  });
  res.send(userObj);
});

app.listen(3000, function () {
  console.log("app listening on port 3000!");
});
