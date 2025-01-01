const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const { sendNotification } = require('../notifications');

const stripeWebhookHandler = async (req, res) => {
    let event;

    try {
        const signature = req.headers['stripe-signature'];

        // Verify the event
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

                // Update order status
                order.paymentStatus = 'paid';
                order.status = 'confirmed';
                order.statusHistory.push({
                    status: 'confirmed',
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

                // Notify user about failed payment
                const user = await User.findById(order.user);
                if (user?.deviceTokens?.length > 0) {
                    try {
                        await sendNotification(
                            user.deviceTokens,
                            'Payment Failed',
                            `Your payment for order ${order.orderNumber} was unsuccessful. Please try again.`
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
        if (err.type === 'StripeSignatureVerificationError') {
            console.error('⚠️ Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        console.error('Webhook Error:', err.message);
        res.status(500).json({
            error: 'Webhook processing failed',
            message: err.message
        });
    }
};

module.exports = {
    stripeWebhookHandler
}; 