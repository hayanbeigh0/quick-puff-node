// Import Firebase Cloud Messaging
const { messaging } = require('./firebase/firebase');

// Function to send a notification
const sendNotification = async (token, title, body) => {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: token, // Device token obtained from the client app
  };

  const response = await messaging.send(message);
  console.log('Notification sent successfully:', response);
};

const sendNotificationToAllUsers = async (title, body) => {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    topic: 'all_users', // Target the topic
  };

  try {
    const response = await messaging.send(message);
    console.log('Notification sent to all users:', response);
  } catch (error) {
    console.log('Error sending notification to all users:', error);
  }
};

module.exports = { sendNotification, sendNotificationToAllUsers };
