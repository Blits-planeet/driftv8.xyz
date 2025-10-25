
import { Resend } from 'resend';
import { config } from './config';

// Initialize Resend with API key from config
const resend = new Resend(config.resendApiKey);

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    await resend.emails.send({
      from: 'Project V8 <noreply@driftv8.xyz>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text.replace(/\n/g, '<br>'),
    });
    console.log(`✅ Email sent to ${options.to}: ${options.subject}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

export async function sendContactNotification(
  name: string,
  email: string,
  subject: string,
  message: string
): Promise<void> {
  await sendEmail({
    to: "contact@driftv8.xyz",
    subject: `New Contact Form: ${subject}`,
    text: `
New contact form submission from Project V8:

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}

---
This is an automated notification from Project V8 Payment Platform.
    `.trim(),
  });

  // Send confirmation to customer
  await sendEmail({
    to: email,
    subject: "We received your message - Project V8",
    text: `
Hello ${name},

Thank you for contacting us! We've received your message and will get back to you shortly.

Your message:
${message}

Best regards,
DriftV8 Team

---
Project V8 Payment Platform
    `.trim(),
  });
}

export async function sendCustomOrderNotification(
  customerName: string,
  customerEmail: string,
  category: string,
  description: string,
  estimatedPrice: string
): Promise<void> {
  // Prepare business notification email content
  const businessNotificationHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-row:last-child { border-bottom: none; }
    .price { font-size: 24px; font-weight: bold; color: #dc2626; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Custom Order Request</h1>
      <p>${category}</p>
    </div>
    <div class="content">
      <p><strong>A new custom order request has been submitted on Project V8!</strong></p>
      
      <div class="order-details">
        <div class="detail-row">
          <span><strong>Customer Name:</strong></span>
          <span>${customerName}</span>
        </div>
        <div class="detail-row">
          <span><strong>Customer Email:</strong></span>
          <span>${customerEmail}</span>
        </div>
        <div class="detail-row">
          <span><strong>Category:</strong></span>
          <span>${category}</span>
        </div>
        <div class="detail-row">
          <span><strong>Estimated Price:</strong></span>
          <span class="price">$${estimatedPrice}</span>
        </div>
        <div class="detail-row">
          <span><strong>Description:</strong></span>
          <span style="white-space: pre-wrap;">${description}</span>
        </div>
      </div>
      
      <p><strong>Action Required:</strong> Please review this request and contact the customer to discuss the project details and finalize pricing.</p>
      
      <div class="footer">
        <p>Project V8 Payment Platform - Custom Order Notification</p>
        <p>This is an automated notification email.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const businessNotificationText = `
NEW CUSTOM ORDER REQUEST

Category: ${category}

CUSTOMER DETAILS:
Name: ${customerName}
Email: ${customerEmail}

ORDER DETAILS:
Estimated Price: $${estimatedPrice}

Description:
${description}

ACTION REQUIRED: Please review this request and contact the customer to discuss the project details and finalize pricing.

---
Project V8 Payment Platform - Custom Order Notification
This is an automated notification email.
  `.trim();

  // Send to primary business email
  await sendEmail({
    to: "allouzimohammed53@gmail.com",
    subject: `New Custom Order: ${category} - Project V8`,
    html: businessNotificationHtml,
    text: businessNotificationText,
  });

  // Also send to secondary business email
  await sendEmail({
    to: "custom@driftv8.xyz",
    subject: `New Custom Order: ${category} - Project V8`,
    html: businessNotificationHtml,
    text: businessNotificationText,
  });

  // Send confirmation to customer
  await sendEmail({
    to: customerEmail,
    subject: "Custom Order Received - Project V8",
    text: `
Hello ${customerName},

Thank you for your custom order request! We've received the following details:

Category: ${category}
Estimated Price: $${estimatedPrice} (excluding VAT/BTW)

Description:
${description}

We'll review your request and get back to you shortly with a detailed quote and timeline.

Best regards,
DriftV8 Team

---
Project V8 Payment Platform
    `.trim(),
  });
}

export async function sendOrderConfirmation(
  orderNumber: string,
  customerName: string,
  customerEmail: string,
  amount: string,
  paymentMethod: string,
  description: string
): Promise<void> {
  const orderEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-row:last-child { border-bottom: none; }
    .total { font-size: 24px; font-weight: bold; color: #667eea; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Order Confirmed!</h1>
      <p>Thank you for your purchase</p>
    </div>
    <div class="content">
      <p>Hello ${customerName},</p>
      <p>Your order has been successfully processed. Here are your order details:</p>
      
      <div class="order-details">
        <div class="detail-row">
          <span><strong>Order Number:</strong></span>
          <span>${orderNumber}</span>
        </div>
        <div class="detail-row">
          <span><strong>Description:</strong></span>
          <span>${description}</span>
        </div>
        <div class="detail-row">
          <span><strong>Payment Method:</strong></span>
          <span>${paymentMethod}</span>
        </div>
        <div class="detail-row">
          <span><strong>Total Amount:</strong></span>
          <span class="total">$${amount}</span>
        </div>
      </div>
      
      <p>We appreciate your business! If you have any questions about your order, please don't hesitate to contact us.</p>
      
      <p>Best regards,<br>DriftV8 Team</p>
      
      <div class="footer">
        <p>Project V8 Payment Platform</p>
        <p>This is an automated confirmation email.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const orderEmailText = `
Hello ${customerName},

Your order has been successfully confirmed!

Order Details:
--------------
Order Number: ${orderNumber}
Description: ${description}
Payment Method: ${paymentMethod}
Total Amount: $${amount}

We appreciate your business! If you have any questions about your order, please don't hesitate to contact us.

Best regards,
DriftV8 Team

---
Project V8 Payment Platform
This is an automated confirmation email.
  `.trim();

  // Send confirmation to customer
  await sendEmail({
    to: customerEmail,
    subject: `Order Confirmation #${orderNumber} - Project V8`,
    html: orderEmailHtml,
    text: orderEmailText,
  });

  // Send notification to business email (both addresses)
  const businessNotificationHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .detail-row:last-child { border-bottom: none; }
    .total { font-size: 24px; font-weight: bold; color: #dc2626; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Order Received</h1>
      <p>Order #${orderNumber}</p>
    </div>
    <div class="content">
      <p><strong>A new order has been placed on Project V8!</strong></p>
      
      <div class="order-details">
        <div class="detail-row">
          <span><strong>Order Number:</strong></span>
          <span>${orderNumber}</span>
        </div>
        <div class="detail-row">
          <span><strong>Customer Name:</strong></span>
          <span>${customerName}</span>
        </div>
        <div class="detail-row">
          <span><strong>Customer Email:</strong></span>
          <span>${customerEmail}</span>
        </div>
        <div class="detail-row">
          <span><strong>Description:</strong></span>
          <span>${description}</span>
        </div>
        <div class="detail-row">
          <span><strong>Payment Method:</strong></span>
          <span>${paymentMethod}</span>
        </div>
        <div class="detail-row">
          <span><strong>Total Amount:</strong></span>
          <span class="total">$${amount}</span>
        </div>
      </div>
      
      <p><strong>Action Required:</strong> Please process this order and contact the customer if needed.</p>
      
      <div class="footer">
        <p>Project V8 Payment Platform - Business Notification</p>
        <p>This is an automated notification email.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const businessNotificationText = `
NEW ORDER RECEIVED - Order #${orderNumber}

CUSTOMER DETAILS:
Name: ${customerName}
Email: ${customerEmail}

ORDER DETAILS:
Description: ${description}
Payment Method: ${paymentMethod}
Total Amount: $${amount}

ACTION REQUIRED: Please process this order and contact the customer if needed.

---
Project V8 Payment Platform - Business Notification
This is an automated notification email.
  `.trim();

  // Send to primary business email
  await sendEmail({
    to: "allouzimohammed53@gmail.com",
    subject: `New Order #${orderNumber} - Project V8`,
    html: businessNotificationHtml,
    text: businessNotificationText,
  });

  // Also send to secondary business email
  await sendEmail({
    to: "orders@driftv8.xyz",
    subject: `New Order #${orderNumber} - Project V8`,
    html: businessNotificationHtml,
    text: businessNotificationText,
  });
}
