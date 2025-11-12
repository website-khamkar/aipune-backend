const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// Serve static files (HTML, CSS, JS) from /public folder
app.use(express.static("public"));

// Razorpay configuration
const RAZORPAY_KEY_ID = " rzp_live_ReiQmXsvV4tBpc"; // or test key for testing
const RAZORPAY_KEY_SECRET = "zcItOjvUm2OyetCdznqafF1N"; // replace this

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Create order API
app.post("/api/create-order", async (req, res) => {
  try {
    const options = {
      amount: 99900, // amount in paise (₹999)
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).send("Error creating order");
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
  res.send('Server is running successfully at aipune.skta.in 🚀');
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));

