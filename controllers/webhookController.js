const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/orderModel');
const User = require('../models/userModel');
const { sendNotification } = require('../notifications');

const webhookHandler = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // req.body is now a Buffer thanks to express.raw()
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`⚠️  Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                const order = await Order.findOne({ paymentIntentId: paymentIntent.id });

                if (order) {
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
                    if (user && user.deviceTokens?.length > 0) {
                        try {
                            await sendNotification(
                                user.deviceTokens,
                                'Payment Successful!',
                                `Your payment for order ${order.orderNumber} has been confirmed.`
                            );
                        } catch (notificationError) {
                            console.error('Notification error:', notificationError);
                            // Don't throw error here, continue processing
                        }
                    }
                }
                break;

            case 'payment_intent.payment_failed':
                const failedPaymentIntent = event.data.object;
                const failedOrder = await Order.findOne({ paymentIntentId: failedPaymentIntent.id });

                if (failedOrder) {
                    failedOrder.paymentStatus = 'failed';
                    failedOrder.status = 'failed';
                    failedOrder.statusHistory.push({
                        status: 'failed',
                        changedAt: new Date()
                    });
                    await failedOrder.save();

                    // Optionally notify user about failed payment
                    const user = await User.findById(failedOrder.user);
                    if (user && user.deviceTokens?.length > 0) {
                        try {
                            await sendNotification(
                                user.deviceTokens,
                                'Payment Failed',
                                `Your payment for order ${failedOrder.orderNumber} was unsuccessful. Please try again.`
                            );
                        } catch (notificationError) {
                            console.error('Notification error:', notificationError);
                        }
                    }
                }
                break;

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        // Return a response to acknowledge receipt of the event
        res.json({ received: true });
    } catch (err) {
        console.error(`Error processing webhook: ${err.message}`);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

module.exports = {
    webhookHandler
}; 