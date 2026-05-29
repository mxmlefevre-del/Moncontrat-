const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Désactive le body parser automatique de Vercel (nécessaire pour Stripe)
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Paiement réussi
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const plan = session.metadata?.plan;
    const email = session.customer_email;

    console.log(`✅ Paiement confirmé — Plan: ${plan} — Email: ${email}`);
    // TODO V2 : mettre à jour Supabase ici
  }

  // Abonnement annulé
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    console.log(`❌ Abonnement annulé — ID: ${subscription.id}`);
    // TODO V2 : rétrograder l'utilisateur dans Supabase
  }

  res.status(200).json({ received: true });
};
