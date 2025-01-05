const express = require('express');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
// const userRouter = require("./routes/userRoutes");
const router = require('./routes/router');
const webhookRouter = require('./routes/webhookRouter');

const app = express();

// Trust the reverse proxy (e.g., Vercel)
app.set('trust proxy', 1);

// Middlewares
// Set security HTTP headers
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limit requests from same IP
const limiter = rateLimit({
  max: 100,
  window: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});

app.use('/api', limiter);

// Important: Place this BEFORE any other middleware that might process the body
app.use('/api/v1/webhook/stripe', 
  express.raw({ type: 'application/json' }), // This ensures the body remains raw for webhooks
  webhookRouter
);

// Regular middleware for other routes
app.use(express.json()); // This should come AFTER the webhook route
app.use(express.urlencoded({ extended: true }));

// Data sanitization against NoSql query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsAverage',
      'ratingsQuantity',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  }),
);

// Implement CORS
app.use(cors());

// Serving static files
app.use(express.static(`${__dirname}/public`));

// Serve assetlinks.json directly
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

app.get('/', (req, res) => {
  res.send('Server has started!!!!!!');
});

app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'];

  // Define app store URLs and deep link URL
  const appStoreURL = 'https://testflight.apple.com/join/fwMRsTzw'; // App Store URL
  const playStoreURL =
    'https://play.google.com/store/apps/details?id=YOUR_PACKAGE_NAME'; // Play Store URL
  const deepLinkURL = 'yourappscheme://'; // app's custom URL scheme

  // Check if the request path is intended for deep linking
  if (req.path.includes('api/v1')) {
    // Detect if coming from a mobile browser (not a native app)
    const isMobileBrowser =
      (/iPhone|iPad|iPod/i.test(userAgent) && /Safari/i.test(userAgent)) || // iOS Safari
      (/Android/i.test(userAgent) && /Chrome/i.test(userAgent)); // Android Chrome or other browser

    if (isMobileBrowser) {
      // Serve an HTML page with options to download or open the app
      if (/iPhone|iPad|iPod/i.test(userAgent) && /Safari/i.test(userAgent)) {
        res.send(`
            <html>
              <head>
                <title>Get the App</title>
                <style>
                  body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                  .container { text-align: center; }
                  .button { display: inline-block; padding: 15px 25px; margin: 10px; font-size: 16px; text-decoration: none; color: white; border-radius: 5px; }
                  .app-store { background-color: #007aff; } /* iOS color */
                  .play-store { background-color: #34a853; } /* Android color */
                  .open-app { background-color: #333; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h2>Get Our App</h2>
                  <p>Download the app from the store:</p>
                  <a href="${appStoreURL}" class="button app-store">Download on App Store</a>
                </div>
              </body>
            </html>
          `);
      } else if (/Android/i.test(userAgent) && /Chrome/i.test(userAgent)) {
        res.send(`
          <html>
            <head>
              <title>Get the App</title>
              <style>
                body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .container { text-align: center; }
                .button { display: inline-block; padding: 15px 25px; margin: 10px; font-size: 16px; text-decoration: none; color: white; border-radius: 5px; }
                .app-store { background-color: #007aff; } /* iOS color */
                .play-store { background-color: #34a853; } /* Android color */
                .open-app { background-color: #333; }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Get Our App</h2>
                <p>Download the app from the store:</p>
                <a href="${playStoreURL}" class="button play-store">Download on Play Store</a>
              </div>
            </body>
          </html>
        `);
      } else {
        next();
      }
    } else {
      // If not a mobile browser, bypass the middleware
      next();
    }
  } else {
    // If the path is not a deep link, proceed as usual
    next();
  }
});

app.use('/api/v1/', router);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find the ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
