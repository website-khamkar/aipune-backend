// server.js
// Express + Razorpay backend for aipune
// - Adds CORS (allowing your frontend origin)
// - Uses express.json() for body parsing
// - Reads credentials from env vars (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
// - Returns JSON responses suitable for frontend use

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

// ----------------- Configuration -----------------
const PORT = process.env.PORT || 3000;

// Set your frontend origin exactly (including https://). Put this in Render env vars as FRONTEND_ORIGIN
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://aipune.skta.in";

// Razorpay keys must be set in env vars on Render (do NOT commit keys to Git)
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('FATAL: Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in env vars.');
  // we continue so the process still starts (logs will show missing info). Optionally, you can process.exit(1);
}

// ----------------- Middleware -----------------
// CORS: only allow your frontend origin (safer than allowing '*')
app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"]
}));
// handle preflight for all routes
app.options("*", cors());

// Parse JSON bodies
app.use(express.json({ limit: "300kb" }));

// Serve static files (if you place frontend assets in public/)
app.use(express.static(path.join(__dirname, "public")));

// ----------------- Razorpay client -----------------
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

// ----------------- Helpers -----------------
function safeJson(res, obj){
  res.setHeader("Content-Type", "application/json");
  res.json(obj);
}

// ----------------- Routes -----------------

// health check
app.get("/api/health", (req, res) => {
  safeJson(res, { status: "ok", ts: Date.now() });
});

// Create order
// Expects JSON: { amount: 99900, currency: "INR", receipt: "rcpt_..." }
app.post("/api/create-order", async (req, res) => {
  try {
    const body = req.body || {};
    const amount = parseInt(body.amount, 10) || 99900;
    const currency = body.currency || "INR";
    const receipt = body.receipt || `rcpt_${Date.now()}`;

    const options = {
      amount: amount,
      currency,
      receipt,
      payment_capture: 1 // auto-capture; change to 0 if you prefer manual capture
    };

    const order = await razorpay.orders.create(options);
    console.log("=> Order created:", order && order.id);

    // Return the order and the public key (keyId) to the frontend
    return safeJson(res, {
      success: true,
      keyId: RAZORPAY_KEY_ID, // public key to use in Razorpay checkout
      order
    });
  } catch (err) {
    console.error("Razorpay create-order error:", err && err.message ? err.message : err);
    return res.status(500).json({
      success: false,
      error: "order_creation_failed",
      message: err && err.message ? String(err.message) : "Unknown error"
    });
  }
});

// Verify payment
// Expects: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "missing_parameters" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(sign.toString()).digest("hex");

    if (expectedSign === razorpay_signature) {
      console.log("Payment verified:", razorpay_payment_id, "for order:", razorpay_order_id);
      // TODO: mark order paid in DB, send email/whatsapp notification, unlock ticket, etc.
      return res.json({ success: true });
    } else {
      console.warn("Payment verification failed - signature mismatch");
      return res.status(400).json({ success: false, error: "signature_mismatch" });
    }
  } catch (err) {
    console.error("verify-payment error:", err);
    return res.status(500).json({ success: false, error: "server_error", message: String(err) });
  }
});

// Generic API index / quick debug
app.get("/api", (req, res) => {
  safeJson(res, { ok: true, message: "Razorpay backend running" });
});

// Fallback: prefer returning JSON for /api/* requests
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "not_found" });
  }
  // If you host frontend in this server, uncomment the following to serve index.html
  // res.sendFile(path.join(__dirname, "public", "index.html"));
  res.status(404).send("Not found");
});

// ----------------- Start server -----------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend origin allowed: ${FRONTEND_ORIGIN}`);
});
