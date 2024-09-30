const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });
const cookie = require('cookie');

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const app = require('./app');
const { initialiseSocketIo } = require('./socket/index');

const socketIo = require('socket.io');

const cloudinary = require('cloudinary').v2;

// Return "https" URLs by setting secure: true
cloudinary.config({
  secure: true,
});

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD,
);

mongoose
  .connect(DB, {
    useNewUrlParser: true, // New URL string parser
    useUnifiedTopology: true, // New server discovery and monitoring engine
    useCreateIndex: true, // Deprecation warning for `ensureIndex`
    useFindAndModify: false,
  })
  .then(() => {
    console.log('DB connection successful!');
  })
  .catch((err) => {
    console.log('Error connecting to database...');
    console.log(err);
  });

// CONFIGURE SERVER (HTTP & HTTPS)
const http_server = http.createServer(app);

const io = new socketIo.Server(http_server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

initialiseSocketIo(io);

const http_port = +(process.env.PORT || 3000);

http_server.on('listening', () => {
  console.log(`HTTP server running on port ${http_port}`);
});

http_server.on('error', (err) => {
  console.log(`Error starting HTTP server 💥💥💥`, err);
});

http_server.listen(http_port, '0.0.0.0', 0);

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION . Shutting down...');
  console.log(err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLER REJECTION❗️. Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = { http_server, io };
