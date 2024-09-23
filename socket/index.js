const mongoose = require('mongoose');
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { Server, Socket } = require('socket.io');
const User = require('../models/userModel');
const Order = require('../models/orderModel');

const mountBuyerJoinOrderEvent = async (socket) => {
  socket.on('joinOrder', async (orderId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(orderId))
        throw { message: 'Invalid orderId' };

      const order = await Order.findById(orderId);
      if (!order) throw { message: 'No order found with that id' };

      // Check if the orderId belongs to the user
      if (order.user.toString() !== socket.user._id.toString())
        throw { message: `The order doesn't belong to you` };

      socket.join(orderId);
    } catch (error) {
      console.log('this is the error message: ', error.message);
      socket.emit(
        'error',
        error?.message ||
          'Something went wrong while connecting to the socket.',
      );
    }
  });
};

const initialiseSocketIo = (io) => {
  io.on('connection', async (socket) => {
    try {
      // parse the cookies from the handshake headers (This is only possible if client has `withCredentials: true`)
      const cookies = cookie.parse(socket.handshake.headers?.cookie || '');

      let token = cookies?.accessToken; // get the accessToken

      if (!token) {
        // If there is no access token in cookies. Check inside the handshake auth
        // token = socket.handshake.auth?.token;
        token = socket.handshake.headers.accesstoken;
      }

      const decodedToken = jwt.verify(token, process.env.JWT_SECRET); // decode the token

      const user = await User.findById(decodedToken.id);

      if (!user) throw { message: 'No user found with that id' };
      socket.user = user;

      socket.join(decodedToken.id);

      mountBuyerJoinOrderEvent(socket);
    } catch (error) {
      socket.emit(
        'connection_error',
        error?.message ||
          'Something went wrong while connecting to the socket.',
      );
    }
  });
};

const emitSocketEvent = (req, roomId, event, payload) => {
  req.app.get('io').in(roomId).emit(event, payload);
};

module.exports = { initialiseSocketIo, emitSocketEvent };
