require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:5500';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const squareSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
const squareWebhookUrl = process.env.SQUARE_WEBHOOK_URL;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const emailFrom =
  process.env.EMAIL_FROM ||
  'Capalot Cheese <noreply@capalotcheats.shop>';

const supportEmail =
  process.env.SUPPORT_EMAIL ||
  'store.capalot@gmail.com';

const discordInvite =
  process.env.DISCORD_INVITE ||
  'https://discord.gg/NQBR2AQ3cX';

if (!supabaseUrl || !serviceKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false }
      })
    : null;

app.use(cors({ origin: FRONTEND_URL, credentials: true }));

app.use((req, res, next) => {
  if (req.path === '/webhooks/square') return next();
  return express.json()(req, res, next);
});

const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'capalot-cheese-backend' });
});

function verifySquareWebhook(rawBody, signature) {
  if (!squareSignatureKey || !squareWebhookUrl) {
    throw new Error('Square webhook verification is not configured.');
  }

  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', squareSignatureKey);
  hmac.update(squareWebhookUrl + rawBody);

  const expected = hmac.digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getEventObject(event) {
  return event?.data?.object || {};
}

function extractPayment(event) {
  const obj = getEventObject(event);
  return obj.payment || obj;
}

function getBuyerEmail(payment) {
  return (
    payment?.buyer_email_address ||
    payment?.receipt_email ||
    payment?.shipping_address?.email_address ||
    null
  );
}

async function findUserIdByEmail(email) {
  if (!supabase || !email) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  return profile?.id || null;
}

async function saveRawWebhook(event) {
  if (!supabase) return;

  await supabase.from('square_webhook_events').insert({
    square_event_id: event?.event_id || event?.id || null,
    event_type: event?.type || null,
    signature_valid: true,
    payload: event,
    received_at: new Date().toISOString()
  });
}

async function sendPurchaseEmail({
  buyerEmail,
  total,
  game = 'Unknown Product',
  plan = '',
  orderId = '',
  receiptUrl = ''
}) {
  if (!resend || !buyerEmail) {
    console.log('Skipping purchase email. Missing Resend or buyer email.');
    return;
  }

  try {
    await resend.emails.send({
      from: emailFrom,
      to: buyerEmail,
      subject: 'Capalot Cheese Purchase Instructions',
      html: `
        <div style="background:#050607;color:#fff;font-family:Arial,sans-serif;padding:28px;">
          <div style="max-width:650px;margin:auto;background:#11161b;border:1px solid #333;padding:28px;border-radius:14px;">
            <h1 style="color:#ffd400;margin-top:0;">Thank you for your purchase!</h1>

            <p style="color:#ddd;font-size:15px;line-height:1.6;">
              Your payment has been received. Please follow the instructions below so we can verify your order and send your details.
            </p>

            <h2 style="margin-top:25px;color:#ffffff;">
              ${game}${plan ? ` — ${plan}` : ''}
            </h2>

            <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#0b0f14;border:1px solid #2a323d;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:12px;color:#aaa;border-bottom:1px solid #222;">Order ID</td>
                <td style="padding:12px;text-align:right;color:#fff;border-bottom:1px solid #222;">${orderId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px;color:#aaa;border-bottom:1px solid #222;">Product</td>
                <td style="padding:12px;text-align:right;color:#fff;border-bottom:1px solid #222;">${game}</td>
              </tr>
              <tr>
                <td style="padding:12px;color:#aaa;border-bottom:1px solid #222;">Plan</td>
                <td style="padding:12px;text-align:right;color:#fff;border-bottom:1px solid #222;">${plan || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:12px;color:#aaa;">Total Paid</td>
                <td style="padding:12px;text-align:right;color:#ffd400;font-weight:bold;">
                  $${Number(total || 0).toFixed(2)}
                </td>
              </tr>
            </table>

            <h2 style="color:#ffd400;">Next Steps</h2>

            <ol style="color:#ddd;line-height:1.7;">
              <li>Join our Discord server.</li>
              <li>Create a <strong>Purchase Support</strong> ticket.</li>
              <li>Use the <strong>same email address</strong> you used during checkout.</li>
              <li>Tell us the product and pass length you purchased.</li>
            </ol>

            <p style="color:#ddd;">Once your payment is verified, our team will provide:</p>

            <ul style="color:#ddd;line-height:1.7;">
              <li>Download instructions</li>
              <li>Installation guide</li>
              <li>Activation instructions</li>
              <li>Setup support if needed</li>
            </ul>

            <p style="margin-top:24px;">
              <a href="${discordInvite}" style="display:inline-block;background:#ffd400;color:#000;padding:14px 22px;border-radius:8px;font-weight:bold;text-decoration:none;">
                Join Discord
              </a>
            </p>

            ${
              receiptUrl
                ? `
            <p style="margin-top:12px;">
              <a href="${receiptUrl}" style="display:inline-block;background:#252b33;color:#fff;padding:14px 22px;border-radius:8px;font-weight:bold;text-decoration:none;">
                View Square Receipt
              </a>
            </p>
            `
                : ''
            }

            <hr style="border:none;border-top:1px solid #333;margin:26px 0;">

            <p style="color:#ff5a5a;font-weight:bold;">
              All sales are final. No refunds will be issued after payment is completed.
            </p>

            <p style="color:#aaa;font-size:14px;">
              Need help? Contact us at ${supportEmail}
            </p>
          </div>
        </div>
      `
    });

    console.log(`Purchase email sent to ${buyerEmail}`);
  } catch (err) {
    console.error('Failed to send purchase email:', err);
  }
}

async function saveOrderFromSquareEvent(event) {
  if (!supabase) return;

  const eventType = event?.type || '';
  const payment = extractPayment(event);

  if (!payment || !payment.id || !eventType.includes('payment')) return;

  const status = String(payment.status || '').toLowerCase();
  const amountMoney = payment.amount_money || payment.total_money || {};
  const total = Number(amountMoney.amount || 0) / 100;
  const squareOrderId = payment.order_id || payment.id;
  const buyerEmail = getBuyerEmail(payment);
  const userId = await findUserIdByEmail(buyerEmail);
  const receiptUrl = payment.receipt_url || null;
  const paymentId = payment.id || null;

  const { data: existing } = await supabase
    .from('orders')
    .select('id')
    .eq('square_order_id', squareOrderId)
    .maybeSingle();

  let orderId = existing?.id;
  let isNewOrder = false;

  if (!orderId) {
    const { data: inserted, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        buyer_email: buyerEmail,
        square_order_id: squareOrderId,
        square_payment_id: paymentId,
        square_receipt_url: receiptUrl,
        status: status || 'paid',
        total
      })
      .select('id')
      .single();

    if (error) throw error;

    orderId = inserted.id;
    isNewOrder = true;
  } else {
    const { error } = await supabase
      .from('orders')
      .update({
        status: status || 'paid',
        total,
        buyer_email: buyerEmail,
        square_payment_id: paymentId,
        square_receipt_url: receiptUrl
      })
      .eq('id', orderId);

    if (error) throw error;
  }

  const { data: existingItems } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  let emailGame = 'Square Payment';
  let emailPlan = 'Paid Order';

  if (!existingItems || existingItems.length === 0) {
    const { error } = await supabase.from('order_items').insert({
      order_id: orderId,
      game: emailGame,
      plan: emailPlan,
      price: total,
      quantity: 1
    });

    if (error) throw error;
  } else {
    const { data: itemData } = await supabase
      .from('order_items')
      .select('game, plan')
      .eq('order_id', orderId)
      .limit(1)
      .maybeSingle();

    if (itemData) {
      emailGame = itemData.game || emailGame;
      emailPlan = itemData.plan || emailPlan;
    }
  }

  const paidStatuses = ['paid', 'completed', 'approved'];

  if (isNewOrder && paidStatuses.includes(status)) {
    await sendPurchaseEmail({
      buyerEmail,
      total,
      game: emailGame,
      plan: emailPlan,
      orderId,
      receiptUrl
    });
  }
}

app.post('/webhooks/square', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const signature = req.get('x-square-hmacsha256-signature');

    const valid = verifySquareWebhook(rawBody, signature);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid Square signature' });
    }

    const event = JSON.parse(rawBody);

    await saveRawWebhook(event);
    await saveOrderFromSquareEvent(event);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Square webhook error:', err);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

app.post('/admin/test-order', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const {
      email,
      game = 'Email Test Product',
      plan = '30 Day Pass',
      total = 1
    } = req.body || {};

    const userId = await findUserIdByEmail(email);

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        buyer_email: email,
        square_order_id: 'TEST-' + Date.now(),
        status: 'paid',
        total
      })
      .select('id')
      .single();

    if (error) throw error;

    await supabase.from('order_items').insert({
      order_id: order.id,
      game,
      plan,
      price: total,
      quantity: 1
    });

    await sendPurchaseEmail({
      buyerEmail: email,
      total,
      game,
      plan,
      orderId: order.id
    });

    res.json({ ok: true, order_id: order.id });
  } catch (err) {
    console.error('Test order error:', err);
    res.status(500).json({
      error: err.message || 'Failed to create test order'
    });
  }
});

app.delete('/admin/orders/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    await supabase.from('order_items').delete().eq('order_id', id);

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(500).json({
      error: err.message || 'Failed to delete order'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Capalot Cheese backend running on http://localhost:${PORT}`);
});