require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI is not defined. Check your .env file.');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit if connection fails
  });

// Define Order Schema
const orderSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  phone: String,
  address: String,
  combo: { type: String, default: '5-Color Combo' },
  orderDate: String,
  delivered: { type: Boolean, default: false },
  spam: { type: Boolean, default: false }
});
const Order = mongoose.model('Order', orderSchema);

// API to Save Orders
app.post('/api/order', async (req, res) => {
  try {
    const { name, quantity, phone, address, orderDate } = req.body;
    if (!name || !phone || !address || !quantity || !orderDate) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const order = new Order({ name, quantity, phone, address, orderDate });
    await order.save();
    res.status(201).json({ message: '✅ Order placed successfully!' });
  } catch (err) {
    console.error('❌ Error saving order:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

// API to Fetch Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find();
    res.status(200).json(orders);
  } catch (err) {
    console.error('❌ Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// API to Update Delivery Status
app.put('/api/orders/:id/deliver', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { delivered: true });
    res.status(200).json({ message: '✅ Order marked as delivered!' });
  } catch (err) {
    console.error('❌ Error updating delivery status:', err);
    res.status(500).json({ error: 'Failed to update delivery status.' });
  }
});

// API to Mark Order as Spam
app.put('/api/orders/:id/spam', async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { spam: true });
    res.status(200).json({ message: '✅ Order marked as spam!' });
  } catch (err) {
    console.error('❌ Error marking order as spam:', err);
    res.status(500).json({ error: 'Failed to mark order as spam.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
