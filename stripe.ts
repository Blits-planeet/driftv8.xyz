
import Stripe from 'stripe';
import { Request, Response } from 'express';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    })
  : null;

export async function createStripeCheckoutSession(req: Request, res: Response) {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        error: "Stripe is not configured. Please set up Stripe credentials." 
      });
    }

    const { amount, currency = 'usd', description, customerEmail, customerName } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({
        error: "Invalid amount. Amount must be a positive number.",
      });
    }

    // Create Stripe Checkout Session with automatic payment method detection
    // This enables all payment methods activated in your Stripe Dashboard:
    // - Credit/Debit Cards (Visa, Mastercard, Amex, etc.)
    // - Apple Pay
    // - Google Pay
    // - Link (Stripe's 1-click checkout)
    // - Klarna (buy now, pay later)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link', 'klarna'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: description || 'Project V8 Order',
              description: 'Custom development services by DriftV8',
            },
            unit_amount: Math.round(parseFloat(amount) * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.BASE_URL || 'http://localhost:5000'}/orders?session_id={CHECKOUT_SESSION_ID}&payment_success=true`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:5000'}/custom-order?payment_cancelled=true`,
      customer_email: customerEmail,
      metadata: {
        customerName: customerName || '',
        description: description || '',
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    res.status(500).json({ error: "Failed to create checkout session." });
  }
}

export async function verifyStripeSession(req: Request, res: Response) {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        error: "Stripe is not configured." 
      });
    }

    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: session.payment_status,
      customerEmail: session.customer_email,
      amountTotal: session.amount_total ? session.amount_total / 100 : 0,
    });
  } catch (error) {
    console.error("Failed to verify session:", error);
    res.status(500).json({ error: "Failed to verify payment session." });
  }
}

export async function getStripePublishableKey(req: Request, res: Response) {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(503).json({ 
      error: "Stripe is not configured." 
    });
  }

  res.json({ 
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY 
  });
}
