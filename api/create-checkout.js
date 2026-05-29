const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Prix Stripe — remplace par tes vrais Price IDs depuis le dashboard Stripe
const PRICES = {
  premium:  'price_1TcYHgARnjPEH6yClyMeTrzE',   // 9,99€/mois
  pro:      'price_1TcYHvARnjPEH6yC8XQDKHr6',   // 29,99€/mois
  pack5:    'price_1TcYIJARnjPEH6yCcXfsX9wE',   // 1,99€
  pack20:   'price_1TcYIZARnjPEH6yCN5HaLiGO',   // 6,99€
  pack50:   'price_1TcYIuARnjPEH6yCxv8lrmfm',   // 14,99€
};

const SUBSCRIPTIONS = ['premium', 'pro'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { plan, email } = req.body;

  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Plan invalide' });
  }

  const isSubscription = SUBSCRIPTIONS.includes(plan);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: isSubscription ? 'subscription' : 'payment',
      customer_email: email || undefined,
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      success_url: `https://www.moncontrat.app/monespace.html?payment=success&plan=${plan}`,
      cancel_url:  `https://www.moncontrat.app/?payment=cancelled`,
      metadata: { plan },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
