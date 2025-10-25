import Stripe from 'stripe';
import { Request, Response } from 'express';
import { IStorage } from './storage';
import { sendOrderConfirmation } from './email';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    })
  : null;

export async function handleStripeWebhook(req: Request, res: Response, storage: IStorage) {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      console.error('Missing signature or webhook secret');
      return res.status(400).send('Webhook error: Missing signature');
    }

    let event: Stripe.Event;

    try {
      // Use rawBody for signature verification (set by express.json verify callback)
      const rawBody = (req as any).rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Check if event has already been processed (idempotency)
    const isProcessed = await storage.isEventProcessed(event.id);
    if (isProcessed) {
      console.log(`Event ${event.id} already processed, skipping`);
      return res.json({ received: true, message: 'Event already processed' });
    }

    // Mark event as processed IMMEDIATELY to prevent race conditions
    // This must happen before any async work to prevent duplicate processing
    await storage.markEventProcessed(event.id);

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Fetch the actual payment method used
      let paymentMethodType = 'Unknown';
      if (session.payment_intent) {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent as string,
          { expand: ['latest_charge.payment_method_details'] }
        );
        
        const charge = paymentIntent.latest_charge as Stripe.Charge;
        const pmDetails = charge?.payment_method_details;
        
        if (pmDetails) {
          if (pmDetails.type === 'card') {
            // Check if it's Apple Pay or Google Pay wallet
            if (pmDetails.card?.wallet?.type === 'apple_pay') {
              paymentMethodType = 'Apple Pay';
            } else if (pmDetails.card?.wallet?.type === 'google_pay') {
              paymentMethodType = 'Google Pay';
            } else {
              paymentMethodType = 'Credit/Debit Card';
            }
          } else if (pmDetails.type === 'link') {
            paymentMethodType = 'Link';
          } else if (pmDetails.type === 'klarna') {
            paymentMethodType = 'Klarna';
          } else if (pmDetails.type === 'cashapp') {
            paymentMethodType = 'Cash App';
          } else if (pmDetails.type === 'us_bank_account') {
            paymentMethodType = 'ACH Bank Transfer';
          } else if (pmDetails.type === 'crypto') {
            paymentMethodType = 'Cryptocurrency';
          } else {
            paymentMethodType = pmDetails.type.charAt(0).toUpperCase() + pmDetails.type.slice(1);
          }
        }
      }

      // Create order in database
      const orderData = {
        customerName: session.metadata?.customerName || session.customer_details?.name || 'Unknown',
        customerEmail: session.customer_details?.email || session.customer_email || '',
        amount: ((session.amount_total || 0) / 100).toString(),
        paymentMethod: paymentMethodType,
        description: session.metadata?.description || 'Project V8 Order',
      };

      const order = await storage.createOrder(orderData);

      // Send confirmation email
      await sendOrderConfirmation(
        order.orderNumber,
        orderData.customerName,
        orderData.customerEmail,
        orderData.amount,
        orderData.paymentMethod,
        orderData.description
      );

      console.log(`✅ Order ${order.orderNumber} created from Stripe payment ${session.id} using ${paymentMethodType}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
