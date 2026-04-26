export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { priceId, userId, userEmail, credits } = req.body;
    const siteUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://nutriflowbyia.vercel.app';

    const params = new URLSearchParams({
      'payment_method_types[]': 'card',
      'mode': 'payment',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'success_url': `${siteUrl}?payment=success&credits=${credits}`,
      'cancel_url': `${siteUrl}?payment=cancelled`,
      'customer_email': userEmail,
      'metadata[user_id]': userId,
      'metadata[credits]': credits.toString(),
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });

    const session = await response.json();
    if (session.error) throw new Error(session.error.message);
    return res.status(200).json({ url: session.url });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
