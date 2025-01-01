const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const Cart = require('../models/cartModel');
const Product = require('../models/productModel');
const { sendNotification } = require('../notifications');

const stripeWebhookHandler = async (req, res) => {
    let event;

    try {
        const signature = req.headers['stripe-signature'];

        // req.body is already raw buffer thanks to express.raw()
        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        // Log the event type for debugging
        console.log('Webhook received:', event.type);

        // Handle the event
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                const order = await Order.findOne({ paymentIntentId: paymentIntent.id });

                if (!order) {
                    console.log(`No order found for payment intent: ${paymentIntent.id}`);
                    return res.json({ received: true });
                }

                // Just update payment status - cart is already cleared
                order.paymentStatus = 'paid';
                order.status = 'pending';
                order.statusHistory.push({
                    status: 'pending',
                    changedAt: new Date()
                });
                await order.save();

                // Send notification to user
                const user = await User.findById(order.user);
                if (user?.deviceTokens?.length > 0) {
                    try {
                        await sendNotification(
                            user.deviceTokens,
                            'Payment Successful!',
                            `Your payment for order ${order.orderNumber} has been confirmed.`
                        );
                    } catch (notificationError) {
                        console.error('Notification error:', notificationError);
                    }
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                const order = await Order.findOne({ paymentIntentId: paymentIntent.id });

                if (!order) {
                    console.log(`No order found for failed payment intent: ${paymentIntent.id}`);
                    return res.json({ received: true });
                }

                // Update order status
                order.paymentStatus = 'failed';
                order.status = 'failed';
                order.statusHistory.push({
                    status: 'failed',
                    changedAt: new Date()
                });
                await order.save();

                // Restore cart items with populated product details for price calculation
                try {
                    const cart = await Cart.create({
                        user: order.user,
                        items: order.items.map(item => ({
                            product: item.product,
                            quantity: item.quantity
                        }))
                    });

                    // The pre-save middleware will automatically calculate the total price
                    await cart.calculateTotalPrice();
                    await cart.save();

                    // Restore product inventory
                    for (const item of order.items) {
                        await Product.findByIdAndUpdate(
                            item.product,
                            { $inc: { stock: item.quantity } }
                        );
                    }
                } catch (error) {
                    console.error('Error restoring cart:', error);
                }

                // Notify user about failed payment
                const user = await User.findById(order.user);
                if (user?.deviceTokens?.length > 0) {
                    try {
                        await sendNotification(
                            user.deviceTokens,
                            'Payment Failed',
                            `Your payment for order ${order.orderNumber} was unsuccessful. Your cart has been restored.`
                        );
                    } catch (notificationError) {
                        console.error('Notification error:', notificationError);
                    }
                }
                break;
            }

            case 'payment_intent.canceled': {
                const paymentIntent = event.data.object;
                const order = await Order.findOne({ paymentIntentId: paymentIntent.id });

                if (!order) {
                    console.log(`No order found for canceled payment intent: ${paymentIntent.id}`);
                    return res.json({ received: true });
                }

                // Update order status
                order.paymentStatus = 'cancelled';
                order.status = 'cancelled';
                order.statusHistory.push({
                    status: 'cancelled',
                    changedAt: new Date()
                });
                await order.save();

                // Restore cart items and inventory just like with failed payments
                try {
                    const cart = await Cart.create({
                        user: order.user,
                        items: order.items.map(item => ({
                            product: item.product,
                            quantity: item.quantity
                        }))
                    });

                    await cart.calculateTotalPrice();
                    await cart.save();

                    // Restore product inventory
                    for (const item of order.items) {
                        await Product.findByIdAndUpdate(
                            item.product,
                            { $inc: { stock: item.quantity } }
                        );
                    }
                } catch (error) {
                    console.error('Error restoring cart:', error);
                }

                // Notify user about cancelled payment
                const user = await User.findById(order.user);
                if (user?.deviceTokens?.length > 0) {
                    try {
                        await sendNotification(
                            user.deviceTokens,
                            'Payment Cancelled',
                            `Your payment for order ${order.orderNumber} was cancelled. Your cart has been restored.`
                        );
                    } catch (notificationError) {
                        console.error('Notification error:', notificationError);
                    }
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        // Return a success response
        res.json({ received: true });
    } catch (err) {
        console.error('Webhook Error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
};

module.exports = {
    stripeWebhookHandler
}; 