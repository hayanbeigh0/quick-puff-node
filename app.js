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

// Body parser, reading data from body into req.body
app.use(
  express.json({
    limit: '10kb',
  }),
);

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
  res.send('Server has started!');
});

// app.use((req, res, next) => {
//   const userAgent = req.headers['user-agent'];
//   console.log(userAgent);
//   const appStoreURL = 'https://testflight.apple.com/join/fwMRsTzw'; // Replace with your App Store URL
//   const playStoreURL =
//     'https://play.google.com/store/apps/details?id=YOUR_PACKAGE_NAME'; // Replace with your Play Store URL
//   const deepLinkURL = 'yourappscheme://'; // Replace with your app's custom URL scheme

//   // Check if the request path is intended for deep linking
//   if (req.path.includes('api/v1')) {
//     // Adjust this check based on your deep link structure
//     if (/iPhone|iPad|iPod/i.test(userAgent)) {
//       // iOS device
//       res.send(`
//         <html>
//           <head>
//             <title>Redirecting...</title>
//           </head>
//           <body>
//             <script type="text/javascript">
//               window.location.href = '${deepLinkURL}';
//               setTimeout(function () {
//                 window.location.href = '${appStoreURL}';
//               }, 500);
//             </script>
//           </body>
//         </html>
//       `);
//     } else if (/Android/i.test(userAgent)) {
//       // Android device
//       res.send(`
//         <html>
//           <head>
//             <title>Redirecting...</title>
//           </head>
//           <body>
//             <script type="text/javascript">
//               window.location.href = '${deepLinkURL}';
//               setTimeout(function () {
//                 window.location.href = '${playStoreURL}';
//               }, 500);
//             </script>
//           </body>
//         </html>
//       `);
//     } else {
//       // For other devices or if detection fails, redirect to a landing page or app website
//       res.redirect('https://yourappwebsite.com'); // Replace with your website or fallback page
//     }
//   } else {
//     // If the path is not a deep link, proceed as usual
//     next();
//   }
// });

app.use('/api/v1/', router);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find the ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
