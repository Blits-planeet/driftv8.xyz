import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderSchema, insertCustomOrderSchema, insertContactSubmissionSchema, insertCartItemSchema, insertDonationSchema } from "@shared/schema";
import { sendContactNotification, sendCustomOrderNotification, sendOrderConfirmation } from "./email";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } from "./paypal";
import { createStripeCheckoutSession, verifyStripeSession, getStripePublishableKey } from "./stripe";

export async function registerRoutes(app: Express): Promise<Server> {
  // AI Price Estimation
  app.post("/api/estimate-price", async (req, res) => {
    try {
      const { category, description } = req.body;
      
      if (!category || !description || description.trim().length < 10) {
        return res.json({
          price: 0,
          difficulty: "Not assessed",
          estimatedDays: "N/A",
          difficultyLevel: 0
        });
      }

      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      
      // Simple fallback pricing based on description length and category
      const calculateFallbackPrice = (cat: string, desc: string) => {
        const basePrice = 100;
        const lengthMultiplier = Math.min(desc.length / 100, 5);
        const categoryMultiplier = cat.includes("Mobile") || cat.includes("Web") ? 1.5 : 1;
        return Math.round(basePrice * lengthMultiplier * categoryMultiplier);
      };
      
      if (!GROQ_API_KEY) {
        // Fallback if no API key
        const price = calculateFallbackPrice(category, description);
        return res.json({
          price,
          difficulty: "Estimated",
          estimatedDays: "3-7 days",
          difficultyLevel: 2
        });
      }

      // Category-specific price ranges
      const categoryRanges: { [key: string]: string } = {
        "Discord Bots": "$50-$300",
        "Discord Servers": "$30-$150",
        "Web Development": "$100-$500",
        "Mobile Apps": "$200-$700 (capped at $500)",
        "Design Services": "$25-$200",
        "Database Setup": "$50-$250",
        "API Integration": "$40-$200",
        "Custom Solution": "$100-$600 (capped at $500)"
      };

      const priceRange = categoryRanges[category] || "$0-$500";

      const prompt = `You are a professional software development pricing expert. Analyze this project request and provide a realistic price estimate in USD.

Category: ${category}
Typical Range: ${priceRange}
Description: ${description}

CRITICAL PRICING RULES - Read the description VERY carefully:

1. DO NOT overcharge for standard/common features
2. Many Discord bots with moderation + music + leveling = $50-$150 (NOT $200+)
3. Basic websites with standard features = $75-$150 (NOT $300+)
4. Price based on ACTUAL complexity, not feature count

EXAMPLES OF REALISTIC PRICING:
- "Discord bot with moderation, roles, logging" = $50-$100 (standard bot)
- "Discord bot with moderation, music, leveling, games" = $75-$150 (feature-rich bot)
- "Basic website with contact form" = $50-$100
- "E-commerce site with payment processing" = $150-$300
- "Custom ML/AI integration with unique algorithm" = $300-$500

PRICING TIERS:
- $0-$25: Tiny tweaks, simple questions, basic configs
- $25-$75: Simple standard projects (basic Discord bot, simple webpage)
- $75-$150: Standard projects with common features (moderation bot, basic web app)
- $150-$250: Above-average complexity (custom integrations, unique features)
- $250-$400: High complexity (advanced custom systems, multiple integrations)
- $400-$500: RARE - Very complex custom development (AI/ML, complex architecture)

Be FAIR and HONEST. Don't inflate prices!

Respond ONLY with valid JSON in this exact format:
{
  "price": <number between 0-500>,
  "difficulty": "<Easy|Moderate|Medium|Hard|Very Hard>",
  "estimatedDays": "<time estimate>",
  "difficultyLevel": <1-5>
}`;

      // Add delay to show AI is processing (improves UX)
      await new Promise(resolve => setTimeout(resolve, 1500));

      const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 200
        })
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("Groq API error:", aiResponse.status, errorText);
        throw new Error(`Groq API error: ${aiResponse.status} - ${errorText}`);
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices[0].message.content.trim();
      const estimate = JSON.parse(content);

      // Round to nearest dollar, cap at $500 maximum
      estimate.price = Math.min(500, Math.max(0, Math.round(estimate.price)));

      res.json(estimate);
    } catch (error) {
      console.error("Error estimating price:", error);
      
      // Use fallback pricing algorithm if AI fails
      const { category, description } = req.body;
      const basePrice = 100;
      const lengthMultiplier = Math.min(description.length / 100, 5);
      const categoryMultiplier = category.includes("Mobile") || category.includes("Web") ? 1.5 : 1;
      const price = Math.round(basePrice * lengthMultiplier * categoryMultiplier);
      
      res.json({
        price,
        difficulty: "Estimated (AI unavailable)",
        estimatedDays: "3-7 days",
        difficultyLevel: 2
      });
    }
  });

  // PayPal routes (from blueprint integration)
  app.get("/paypal/setup", async (req, res) => {
    await loadPaypalDefault(req, res);
  });

  app.post("/paypal/order", async (req, res) => {
    await createPaypalOrder(req, res);
  });

  app.post("/paypal/order/:orderID/capture", async (req, res) => {
    await capturePaypalOrder(req, res);
  });

  // Stripe routes
  app.get("/stripe/config", async (req, res) => {
    await getStripePublishableKey(req, res);
  });

  app.post("/stripe/create-checkout-session", async (req, res) => {
    await createStripeCheckoutSession(req, res);
  });

  app.get("/stripe/session/:sessionId", async (req, res) => {
    await verifyStripeSession(req, res);
  });

  // Stripe webhook for payment confirmations
  app.post("/stripe/webhook", async (req, res) => {
    const { handleStripeWebhook } = await import('./stripe-webhook');
    await handleStripeWebhook(req, res, storage);
  });

  // Manual payment methods (CashApp, Crypto)
  app.post("/api/payment/manual", async (req, res) => {
    try {
      const { paymentMethod, customerName, customerEmail, amount, description } = req.body;
      
      if (!["cashapp", "crypto"].includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment method" });
      }

      let paymentInstructions = {};
      
      if (paymentMethod === "cashapp") {
        paymentInstructions = {
          method: "Cash App",
          cashtag: "$DriftV8",
          amount: amount,
          note: `Order for ${description}`,
        };
      } else if (paymentMethod === "crypto") {
        paymentInstructions = {
          method: "Cryptocurrency",
          wallet: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
          network: "Bitcoin (BTC)",
          amount: amount,
          note: `Order for ${description}`,
        };
      }

      const orderData = {
        customerName,
        customerEmail,
        amount: amount.toString(),
        paymentMethod: paymentMethod === "cashapp" ? "Cash App" : "Cryptocurrency",
        description,
      };

      const order = await storage.createOrder(orderData);
      
      await sendOrderConfirmation(
        order.orderNumber,
        customerName,
        customerEmail,
        amount.toString(),
        orderData.paymentMethod,
        description
      );

      res.json({
        success: true,
        order,
        paymentInstructions,
      });
    } catch (error) {
      console.error("Error processing manual payment:", error);
      res.status(500).json({ error: "Failed to process payment" });
    }
  });

  // Orders API
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validatedData);
      
      await sendOrderConfirmation(
        order.orderNumber,
        validatedData.customerName,
        validatedData.customerEmail,
        validatedData.amount,
        validatedData.paymentMethod,
        validatedData.description
      );
      
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(400).json({ error: "Invalid order data" });
    }
  });

  app.patch("/api/orders/:id/rating", async (req, res) => {
    try {
      const { rating } = req.body;
      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      const order = await storage.updateOrderRating(req.params.id, rating);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error updating order rating:", error);
      res.status(500).json({ error: "Failed to update rating" });
    }
  });

  // Custom Orders API
  app.get("/api/custom-orders", async (req, res) => {
    try {
      const customOrders = await storage.getCustomOrders();
      res.json(customOrders);
    } catch (error) {
      console.error("Error fetching custom orders:", error);
      res.status(500).json({ error: "Failed to fetch custom orders" });
    }
  });

  app.get("/api/custom-orders/:id", async (req, res) => {
    try {
      const customOrder = await storage.getCustomOrder(req.params.id);
      if (!customOrder) {
        return res.status(404).json({ error: "Custom order not found" });
      }
      res.json(customOrder);
    } catch (error) {
      console.error("Error fetching custom order:", error);
      res.status(500).json({ error: "Failed to fetch custom order" });
    }
  });

  app.post("/api/custom-orders", async (req, res) => {
    try {
      const validatedData = insertCustomOrderSchema.parse(req.body);
      const customOrder = await storage.createCustomOrder(validatedData);

      // Send email notifications
      await sendCustomOrderNotification(
        validatedData.customerName,
        validatedData.customerEmail,
        validatedData.category,
        validatedData.description,
        validatedData.estimatedPrice
      );

      res.status(201).json(customOrder);
    } catch (error) {
      console.error("Error creating custom order:", error);
      res.status(400).json({ error: "Invalid custom order data" });
    }
  });

  // Contact Submissions API
  app.get("/api/contact", async (req, res) => {
    try {
      const submissions = await storage.getContactSubmissions();
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching contact submissions:", error);
      res.status(500).json({ error: "Failed to fetch contact submissions" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const validatedData = insertContactSubmissionSchema.parse(req.body);
      const submission = await storage.createContactSubmission(validatedData);

      // Send email notification
      await sendContactNotification(
        validatedData.name,
        validatedData.email,
        validatedData.subject,
        validatedData.message
      );

      res.status(201).json(submission);
    } catch (error) {
      console.error("Error creating contact submission:", error);
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  // Donations API
  app.get("/api/donations/leaderboard", async (req, res) => {
    try {
      const donations = await storage.getDonations();
      const leaderboard = donations.slice(0, 10);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching donation leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch donation leaderboard" });
    }
  });

  app.post("/stripe/create-donation-checkout", async (req, res) => {
    try {
      const { donorName, donorEmail, amount, message } = req.body;

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) < 1) {
        return res.status(400).json({
          error: "Invalid amount. Minimum donation is $1.",
        });
      }

      const Stripe = await import("stripe");
      const stripe = new Stripe.default(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-09-30.clover",
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "link", "klarna"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Donation from ${donorName}`,
                description: "Support Project V8 development",
              },
              unit_amount: Math.round(parseFloat(amount) * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.BASE_URL || "http://localhost:5000"}/stripe/donation-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL || "http://localhost:5000"}/?donation_cancelled=true`,
        customer_email: donorEmail,
        metadata: {
          type: "donation",
          donorName,
          donorEmail,
          amount: amount.toString(),
          message: message || "",
        },
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error("Error creating donation checkout:", error);
      res.status(500).json({ error: "Failed to create donation checkout" });
    }
  });

  app.get("/stripe/donation-success", async (req, res) => {
    try {
      const { session_id } = req.query;

      if (!session_id || typeof session_id !== "string") {
        return res.redirect("/?donation_error=missing_session");
      }

      // Check idempotency - prevent duplicate donations from same session
      const alreadyProcessed = await storage.isEventProcessed(`donation_${session_id}`);
      if (alreadyProcessed) {
        return res.redirect("/?donation_success=true");
      }

      const Stripe = await import("stripe");
      const stripe = new Stripe.default(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-09-30.clover",
      });

      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["payment_intent", "line_items"],
      });

      // Verify payment is complete and this is a donation session
      if (
        session.payment_status !== "paid" ||
        session.metadata?.type !== "donation" ||
        !session.metadata?.donorName ||
        !session.metadata?.donorEmail
      ) {
        return res.redirect("/?donation_error=payment_failed");
      }

      // Get the actual paid amount from Stripe (not from metadata which could be tampered)
      const amountPaid = session.amount_total ? (session.amount_total / 100).toFixed(2) : "0";

      // Validate donor information from metadata
      const donationData = {
        donorName: session.metadata.donorName,
        donorEmail: session.metadata.donorEmail,
        amount: amountPaid,
        message: session.metadata.message || "",
      };

      try {
        // Validate using schema
        const validatedData = insertDonationSchema.parse(donationData);
        
        // Create donation record
        await storage.createDonation(validatedData);
        
        // Mark as processed to prevent duplicates
        await storage.markEventProcessed(`donation_${session_id}`);
        
        res.redirect("/?donation_success=true");
      } catch (error) {
        console.error("Error saving donation:", error);
        res.redirect("/?donation_error=save_failed");
      }
    } catch (error) {
      console.error("Error processing donation success:", error);
      res.redirect("/?donation_error=processing_failed");
    }
  });

  // Cart API
  app.get("/api/cart", async (req, res) => {
    try {
      const items = await storage.getCartItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching cart items:", error);
      res.status(500).json({ error: "Failed to fetch cart items" });
    }
  });

  app.post("/api/cart", async (req, res) => {
    try {
      const validatedData = insertCartItemSchema.parse(req.body);
      const item = await storage.addCartItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding cart item:", error);
      res.status(400).json({ error: "Invalid cart item data" });
    }
  });

  app.patch("/api/cart/:id", async (req, res) => {
    try {
      const { quantity } = req.body;
      if (typeof quantity !== "number" || quantity < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      const item = await storage.updateCartItemQuantity(req.params.id, quantity);
      if (!item) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", async (req, res) => {
    try {
      const deleted = await storage.removeCartItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error removing cart item:", error);
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  app.delete("/api/cart", async (req, res) => {
    try {
      await storage.clearCart();
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ error: "Failed to clear cart" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
