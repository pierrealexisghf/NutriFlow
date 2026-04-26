import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(payload, signature, secret) {
  const elements = signature.split(',');
  const timestamp = elements.find(e => e.startsWith('t=')).split('=')[1];
  const sig = elements.find(e => e.startsWith('v1=')).split('=')[1];
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  try {
    if (!verifyStripeSignature(rawBody.toString(), signature, process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } catch(e) {
    return res.status(400).json({ error: 'Signature error' });
  }

  const event = JSON.parse(rawBody.toString());
  if (event.type !== 'checkout.session.completed') return res.status(200).json({ ignored: true });

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const creditsToAdd = parseInt(session.metadata?.credits || '0');

  if (!userId || !creditsToAdd) return res.status(400).json({ error: 'Missing metadata' });

  const SUPABASE_URL = 'https://yqvyguyxjnktajbnmavw.supabase.co';
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Get current balance
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/credits?user_id=eq.${userId}&select=balance`, {
      headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
    });
    const credits = await getRes.json();
    const newBalance = (credits[0]?.balance || 0) + creditsToAdd;

    // Update balance
    await fetch(`${SUPABASE_URL}/rest/v1/credits?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE,
        'Authorization': `Bearer ${SUPABASE_SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() })
    });

    // Log transaction
    await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE,
        'Authorization': `Bearer ${SUPABASE_SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        amount_euros: (session.amount_total || 0) / 100,
        credits_added: creditsToAdd,
        stripe_payment_id: session.payment_intent || session.id
      })
    });

    return res.status(200).json({ success: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
