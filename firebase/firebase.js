// firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('./quick-puff-d86bd-firebase-adminsdk-pdvtd-7cefeaf0a0.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Export Firebase services if needed in other files
const messaging = admin.messaging();

module.exports = { messaging };
