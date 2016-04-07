'use strict';

/**
 * Module dependencies.
 */
var fs         = require('fs'),
http           = require('http'),
https          = require('https'),
express        = require('express'),
morgan         = require('morgan'),
logger         = require('./logger'),
bodyParser     = require('body-parser'),
session        = require('express-session'),
compression    = require('compression'),
methodOverride = require('method-override'),
cookieParser   = require('cookie-parser'),
helmet         = require('helmet'),
passport       = require('passport'),
flash          = require('connect-flash'),
config         = require('./config'),
consolidate    = require('consolidate'),
path           = require('path'),
Twit           = require('twit');

var twitter = new Twit({
  consumer_key       : 'HBN8qu2azFV9yY2fQVN17dAa5',
  consumer_secret    : 'G310IkEfCOsoBeodQvspPHv9zEjUp11SSeBO4TOKN8g3WnqhA2',
  access_token       : '856221361-zVHymidG3JafyBPNoeRWDvARoKcFQqFLhqt44py4',
  access_token_secret: 'oESKAghiEtelBU9HiTiFZf2ncVHxi1qEfoP0wYnOEPLeo'
});
var tStream = null;
var track = 'venezuela,simon bolivar';
var users = [];

// A log function for debugging purposes
function logConnectedUsers () {
  console.log('============= CONNECTED USERS ==============');
  console.log('==  ::  ' + users.length);
  console.log('============================================');
}

var initializeSocketIO = function (server) {
  var io = require('socket.io').listen(server, {log: true});
  io.sockets.on('connection', function (socket) {
    if (users.indexOf(socket.id) === -1) {
      users.push(socket.id);
    }

    logConnectedUsers();

    twitter.get('search/tweets', {
      q    : '#SumUp',
      count: 100
    }, function (err, data) {
      if (err) {
        return;
      }
      if(data.statuses.length === 0) {
        return;
      }

      data.statuses.forEach(function(status) {
        socket.emit('twitter_feed:history', status);
      });
    });

    if (tStream === null) {
      tStream = twitter.stream('statuses/filter', {
        track   : '#SumUp',
        language: 'en'
      });

      tStream.on('error', function (err) {
        console.log('error');
      });

      tStream.on('tweet', function (data) {
        // only broadcast when users are online
        if (users.length > 0) {
          // This emits the signal to all users but the one
          // that started the stream
          socket.broadcast.emit('twitter_feed:new', data);
          // This emits the signal to the user that started
          // the stream
          socket.emit('twitter_feed:new', data);
        }
        else {
          // If there are no users connected we destroy the stream.
          // Why would we keep it running for nobody?
          //tStream.destroy();
          tStream = null;
        }
      });

      tStream.on('disconnect', function (disconnectMessage) {
        console.log(disconnectMessage);
      });
    }

    // This handles when a user is disconnected
    socket.on('disconnect', function (o) {
      // find the user in the array
      var index = users.indexOf(socket.id);
      if (index !== -1) {
        // Eliminates the user from the array
        users.splice(index, 1);
      }

      logConnectedUsers();
    });

    // Emits signal when the user is connected sending
    // the tracking words the app it's using
    socket.emit('connected', {
      tracking: track
    });
  });
};

module.exports = function () {
  // Initialize express app
  var app = express();
  var http = require('http');
  var server = http.createServer(app);
  initializeSocketIO(server);

  // Globbing model files
  config.getGlobbedFiles('./app/models/**/*.js').forEach(function (modelPath) {
    require(path.resolve(modelPath));
  });

  // Setting application local variables
  app.locals.title = config.app.title;
  app.locals.description = config.app.description;
  app.locals.keywords = config.app.keywords;
  app.locals.facebookAppId = config.facebook.clientID;
  app.locals.jsFiles = config.getJavaScriptAssets();
  app.locals.cssFiles = config.getCSSAssets();

  // Passing the request url to environment locals
  app.use(function (req, res, next) {
    res.locals.url = req.protocol + '://' + req.headers.host + req.url;
    next();
  });

  // Should be placed before express.static
  app.use(compression({
    // only compress files for the following content types
    filter: function (req, res) {
      return (/json|text|javascript|css/).test(res.getHeader('Content-Type'));
    },
    // zlib option for compression level
    level : 3
  }));

  app.use(require('../app/middlewares/twitter')(twitter));

  // Showing stack errors
  app.set('showStackError', true);

  // Set swig as the template engine
  app.engine('server.view.html', consolidate[config.templateEngine]);

  // Set views path and view engine
  app.set('view engine', 'server.view.html');
  app.set('views', './app/views');

  // Enable logger (morgan)
  app.use(morgan(logger.getLogFormat(), logger.getLogOptions()));

  // Environment dependent middleware
  if (process.env.NODE_ENV === 'development') {
    // Disable views cache
    app.set('view cache', false);
  } else {
    if (process.env.NODE_ENV === 'production') {
      app.locals.cache = 'memory';
    }
  }

  // Request body parsing middleware should be above methodOverride
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());
  app.use(methodOverride());

  // Use helmet to secure Express headers
  app.use(helmet.xframe());
  app.use(helmet.xssFilter());
  app.use(helmet.nosniff());
  app.use(helmet.ienoopen());
  app.disable('x-powered-by');

  // Setting the app router and static folder
  app.use(express.static(path.resolve('./public')));

  // CookieParser should be above session
  app.use(cookieParser());

  // Express MongoDB session storage
  app.use(session({
    saveUninitialized: true,
    resave           : true,
    secret           : config.sessionSecret,
    cookie           : config.sessionCookie,
    name             : config.sessionName
  }));

  // use passport session
  app.use(passport.initialize());
  app.use(passport.session());

  // connect flash for flash messages
  app.use(flash());

  // Globbing routing files
  config.getGlobbedFiles('./app/routes/**/*.js').forEach(function (routePath) {
    require(path.resolve(routePath))(app);
  });

  // Assume 'not found' in the error msgs is a 404. this is somewhat silly, but valid, you can do whatever you like, set properties, use instanceof etc.
  app.use(function (err, req, res, next) {
    // If the error object doesn't exists
    if (!err) {
      return next();
    }

    // Log it
    console.error(err.stack);

    // Error page
    res.status(500).render('500', {
      error: err.stack
    });
  });

  // Assume 404 since no middleware responded
  app.use(function (req, res) {
    res.status(404).render('404', {
      url  : req.originalUrl,
      error: 'Not Found'
    });
  });

  if (process.env.NODE_ENV === 'secure') {
    // Load SSL key and certificate
    var privateKey = fs.readFileSync('./config/sslcerts/key.pem', 'utf8');
    var certificate = fs.readFileSync('./config/sslcerts/cert.pem', 'utf8');

    // Create HTTPS Server
    var httpsServer = https.createServer({
      key : privateKey,
      cert: certificate
    }, app);

    // Return HTTPS server instance
    return httpsServer;
  }

  // Return Express server instance
  return server;
};
