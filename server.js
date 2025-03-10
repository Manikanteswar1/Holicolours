const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Order Schema
const orderSchema = new mongoose.Schema({
  orderId: { type: Number, unique: true },
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

// Counter Schema for Auto-Incrementing Order ID
const counterSchema = new mongoose.Schema({
  _id: String,
  sequence_value: Number
});

const Counter = mongoose.model('Counter', counterSchema);

// Initialize Counter if Not Exists
async function initializeCounter() {
  const counter = await Counter.findById('orderId');
  if (!counter) {
    await new Counter({ _id: 'orderId', sequence_value: 0 }).save();
  }
}
initializeCounter();

// Function to Get Next Order ID
async function getNextOrderId() {
  const counter = await Counter.findByIdAndUpdate(
    'orderId',
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
}

// Place an Order
app.post('/api/order', async (req, res) => {
  try {
    const { name, quantity, phone, address, orderDate } = req.body;
    if (!name || !phone || !address || !quantity || !orderDate) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const orderId = await getNextOrderId();
    const order = new Order({ orderId, name, quantity, phone, address, orderDate });
    await order.save();

    res.status(201).json({ message: 'Order placed successfully! We will contact you Soon.', orderId });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

// Get All Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ orderId: 1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// Update Order Status (Delivered or Spam)
app.put('/api/orders/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    let updateField;
    if (action === 'deliver') updateField = { delivered: true };
    else if (action === 'spam') updateField = { spam: true };
    else return res.status(400).json({ error: 'Invalid action.' });

    const updatedOrder = await Order.findOneAndUpdate({ orderId: id }, updateField, { new: true });
    if (!updatedOrder) return res.status(404).json({ error: 'Order not found.' });

    res.json({ message: `Order marked as ${action}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// Generate CSV Backup
app.get('/api/orders/backup', async (req, res) => {
  try {
    const orders = await Order.find().sort({ orderId: 1 });

    // Define CSV writer
    const csvWriter = createCsvWriter({
      path: 'orders_backup.csv', // Always write to the same file
      header: [
        { id: 'orderId', title: 'Order ID' },
        { id: 'name', title: 'Name' },
        { id: 'quantity', title: 'Quantity' },
        { id: 'phone', title: 'Phone' },
        { id: 'address', title: 'Address' },
        { id: 'combo', title: 'Combo' },
        { id: 'orderDate', title: 'Order Date' },
        { id: 'delivered', title: 'Delivered' },
        { id: 'spam', title: 'Spam' }
      ]
    });

    // Write orders to CSV (overwrites the file)
    await csvWriter.writeRecords(orders);

    // Send the CSV file as a download
    res.download('orders_backup.csv', 'orders_backup.csv', (err) => {
      if (err) {
        console.error('Error sending CSV file:', err);
        res.status(500).json({ error: 'Failed to download CSV file.' });
      }
    });
  } catch (err) {
    console.error('Error generating CSV backup:', err);
    res.status(500).json({ error: 'Failed to generate CSV backup.' });
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));