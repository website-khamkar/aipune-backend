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
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// Serve static files (HTML, CSS, JS) from /public folder
app.use(express.static("public"));

// ---- Razorpay configuration (use environment variables only) ----
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('FATAL: Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in env vars.');
  // optionally continue so logs show the masked values you added earlier
}

// initialize client
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});


// Create order API
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;
    const options = {
      amount: amount || 99900,
      currency: currency || "INR",
      receipt: receipt || `rcpt_${Date.now()}`
    };

const order = await razorpay.orders.create(options);
console.log("✅ Order created:", order.id);

// Return both the public key id (for client) and the order object
// IMPORTANT: do NOT return the secret key to the client.
res.json({
  success: true,
  order: order,                   // full Razorpay order object (id, amount, currency...)
  keyId: process.env.RAZORPAY_KEY_ID || RAZORPAY_KEY_ID
});

  } catch (err) {
    console.error("❌ Razorpay error:", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});


// Verify payment API
app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
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
  res.redirect('https://your-frontend-domain.com');
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));

