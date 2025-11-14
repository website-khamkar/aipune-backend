// server.js (updated)
/*
  - Adds CORS support so the browser can call /api/create-order from your front-end
  - Keeps your debug masking for Razorpay env vars
  - Uses process.env.PORT for Render
*/

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
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");
const cors = require("cors");

const app = express();

// parse JSON (body-parser is fine; keeping your usage)
app.use(bodyParser.json());

// ---------- CORS setup ----------
// Allow a specific origin (recommended) or set FRONTEND_ORIGIN env var.
// Default to your known front-end domain as fallback.
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "https://aipune.skta.in").trim();

// Configure CORS to accept requests from the frontend and allow credentials if needed.
app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Handle preflight for all routes explicitly (helps some proxies)
app.options('*', cors({
  origin: FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// Serve static files (HTML, CSS, JS) from /public folder
app.use(express.static("public"));

// ---- Razorpay configuration (use environment variables only) ----
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('FATAL: Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in env vars.');
  // We continue so logs show debug info, but orders will fail until creds are set.
}

// initialize client
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Create order API
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body || {};
    const options = {
      amount: amount || 99900,
      currency: currency || "INR",
      receipt: receipt || `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    console.log("✅ Order created:", order.id);

    // Return order + public key id (do NOT return secret)
    res.json({
      success: true,
      order: order,
      keyId: RAZORPAY_KEY_ID
    });

  } catch (err) {
    console.error("❌ Razorpay error:", err && err.error ? err.error : err);
    // if Razorpay returns structured error it may be in err.error; send minimal message
    const msg = (err && err.message) ? err.message : 'Unknown error creating order';
    res.status(500).json({ error: msg });
  }
});

// Verify payment API
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
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  } catch (error) {
    console.error("Payment verification failed:", error);
    res.status(500).send("Error verifying payment");
  }
});

app.get('/', (req, res) => {
  // keep this, or change to your frontend domain path if needed
  res.redirect('https://aipune.skta.in');
});

// Start the server with the port provided by Render (or fallback)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT} (PORT=${PORT}), FRONTEND_ORIGIN=${FRONTEND_ORIGIN}`));
