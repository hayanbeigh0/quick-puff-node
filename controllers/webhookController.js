const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/orderModel');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const { sendNotification } = require('../notifications');

const webhookHandler = catchAsync(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify the webhook signature
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle different event types
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            // Find order by payment intent ID and update its status
            const order = await Order.findOne({ paymentIntentId: paymentIntent.id });

            if (order) {
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
                    await sendNotification(
                        user.deviceTokens,
                        'Payment Successful!',
                        `Your payment for order ${order.orderNumber} has been confirmed.`
                    );
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
            }
            break;

        // Add more event types as needed
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
});

module.exports = {
    webhookHandler
}; 