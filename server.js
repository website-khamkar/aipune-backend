// server.js (updated)
// --- DEBUG: mask and show presence of Razorpay env vars (safe; does NOT print secret) ---
function mask(s){
  if(!s) return '<MISSING>';
  const t = String(s);
  if (t.length <= 8) return t.slice(0,2) + '•••' + t.slice(-2);
  return t.slice(0,4) + '••••' + t.slice(-4);
}

console.log('DEBUG: RAZORPAY_KEY_ID present? ->', !!process.env.RAZORPAY_KEY_ID);
console.log('DEBUG: RAZORPAY_KEY_ID masked ->', mask(process.env.RAZORPAY_KEY_ID));
console.log('DEBUG: RAZORPAY_KEY_SECRET present? ->', !!process.env.RAZORPAY_KEY_SECRET);
console.log('DEBUG: RAZORPAY_KEY_SECRET masked ->', mask(process.env.RAZORPAY_KEY_SECRET));
// --- end debug ---

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const cors = require("cors");

const app = express();

// Parse JSON (built-in)
app.use(express.json());

// Configure CORS
// Set FRONTEND_ORIGIN in environment to your front-end origin (e.g. https://aipune.skta.in).
// If not set, defaults to allow all origins (useful for testing; restrict in production).
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || '*').trim();

const corsOptions = (origin, callback) => {
  if (FRONTEND_ORIGIN === '*' ) {
    // allow all
    callback(null, { origin: true });
  } else {
    // allow only the configured origin
    callback(null, { origin: origin === FRONTEND_ORIGIN });
  }
};

// Enable CORS for all routes + preflight handling
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // respond to preflight

// Serve static files (HTML, CSS, JS) from /public folder if present
// If you don't use a public folder on the backend, this does no harm.
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// ---- Razorpay configuration (use environment variables only) ----
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('FATAL: Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in env vars.');
  // don't exit here — let process start (so you can see logs in Render). But Razorpay calls will fail.
}

// initialize client
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Simple health check
app.get('/healthz', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

// Create order API
app.post("/api/create-order", async (req, res) => {
  try {
    // read amount/currency/receipt from body (client may send these)
    const { amount, currency, receipt } = req.body || {};

    const options = {
      amount: typeof amount === 'number' ? amount : 99900, // amount in paise (₹999.00)
      currency: currency || "INR",
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: { source: 'aipune_form' }
    };

    // Basic validation
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.warn('Attempt to create order without Razorpay credentials present');
      return res.status(500).json({ error: 'Payment service not configured' });
    }

    const order = await razorpay.orders.create(options);
    console.log("✅ Order created:", order.id);

    // Return the order + public key to the client (never send secret)
    res.json({
      success: true,
      order,
      keyId: RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error("❌ Razorpay error:", err && err.error ? err.error : err);
    // If the Razorpay SDK returns structured error, try to send a friendly message
    const message = (err && err.error && err.error.description) ? err.error.description : (err.message || 'Unknown error');
    res.status(500).json({ error: message });
  }
});

// Verify payment API (called by client after Razorpay success)
app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing verification parameters' });
    }
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // signature valid
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (error) {
    console.error("Payment verification failed:", error);
    res.status(500).send("Error verifying payment");
  }
});

// Optional redirect root -> frontend (safe default)
app.get('/', (req, res) => {
  // if you want to redirect to your front, set FRONTEND_ORIGIN env var
  if (FRONTEND_ORIGIN && FRONTEND_ORIGIN !== '*') return res.redirect(FRONTEND_ORIGIN);
  res.send('API running. Use /api/create-order');
});

// PORT (use Render's provided PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://localhost:${PORT} (PORT env used: ${process.env.PORT || 'none'})`);
  console.log(`✅ FRONTEND_ORIGIN = ${FRONTEND_ORIGIN === '*' ? '<any>' : FRONTEND_ORIGIN}`);
});
