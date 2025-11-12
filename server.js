// server.js (fixed)
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const cors = require("cors");

const app = express();

// Parse JSON
app.use(express.json());

// Allow CORS from your frontend origin (adjust if needed)
app.use(cors({
  origin: [ "https://aipune.skta.in", "https://www.aipune.skta.in" ], // add other origins if needed
  methods: ["GET","POST","OPTIONS"]
}));

// Serve static files from ./public if you want to host frontend from this service
app.use(express.static(path.join(__dirname, "public")));

// IMPORTANT: load keys from environment (do NOT hardcode)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn("WARNING: Razorpay keys are not set in environment variables.");
}

// Initialize Razorpay client
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || "",
  key_secret: RAZORPAY_KEY_SECRET || ""
});

// Create order API
app.post("/api/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount || 99900); // paise
    const options = {
      amount,
      currency: "INR",
      receipt: req.body.receipt || "rcpt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);
    return res.json({ orderId: order.id, order });
  } catch (err) {
    console.error("Order creation failed:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// Verify payment API
app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSign = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET || "")
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
});

// Root route (show friendly message)
app.get("/", (req, res) => {
  res.send("Server is running successfully at aipune.skta.in 🚀");
});

// Start server (use env PORT for Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
