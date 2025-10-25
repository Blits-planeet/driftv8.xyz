export const config = {
  resendApiKey: process.env.RESEND_API_KEY || 're_Gs497RBu_ARcFhWeLuUjT2KskHdSyozjs',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
};

if (!config.resendApiKey) {
  throw new Error('RESEND_API_KEY environment variable is required but not set');
}