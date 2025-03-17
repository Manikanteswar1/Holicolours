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

// Order Status Schema
const orderStatusSchema = new mongoose.Schema({
  _id: { type: String, default: 'orderStatus' },
  isTakingOrders: { type: Boolean, default: true }
});

const Order = mongoose.model('Order', orderSchema);
const OrderStatus = mongoose.model('OrderStatus', orderStatusSchema);

// Counter Schema
const counterSchema = new mongoose.Schema({
  _id: String,
  sequence_value: Number
});

const Counter = mongoose.model('Counter', counterSchema);

// Initialize Counter and Order Status
async function initializeCounter() {
  const counter = await Counter.findById('orderId');
  if (!counter) await new Counter({ _id: 'orderId', sequence_value: 0 }).save();
}

async function initializeOrderStatus() {
  const status = await OrderStatus.findById('orderStatus');
  if (!status) await new OrderStatus({ _id: 'orderStatus', isTakingOrders: true }).save();
}

initializeCounter();
initializeOrderStatus();

// Get Next Order ID
async function getNextOrderId() {
  const counter = await Counter.findByIdAndUpdate(
    'orderId',
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence_value;
}

// SSE Setup
const clients = new Set();

app.get('/api/order-updates', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res };
  clients.add(client);

  req.on('close', () => {
    clients.delete(client);
    res.end();
  });
});

function notifyClients(event, data) {
  for (const client of clients) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Get Order Status
app.get('/api/order-status', async (req, res) => {
  try {
    const status = await OrderStatus.findById('orderStatus');
    res.json({ isTakingOrders: status.isTakingOrders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order status.' });
  }
});

// Toggle Order Status
app.put('/api/order-status', async (req, res) => {
  try {
    const { isTakingOrders } = req.body;
    const status = await OrderStatus.findByIdAndUpdate(
      'orderStatus',
      { isTakingOrders },
      { new: true, upsert: true }
    );
    res.json({ message: 'Order status updated', isTakingOrders: status.isTakingOrders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// Place an Order
app.post('/api/order', async (req, res) => {
  try {
    const status = await OrderStatus.findById('orderStatus');
    if (!status.isTakingOrders) {
      return res.status(403).json({ error: 'We are currently not taking orders.' });
    }

    const { name, quantity, phone, address, orderDate } = req.body;
    if (!name || !phone || !address || !quantity || !orderDate) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const orderId = await getNextOrderId();
    const order = new Order({ orderId, name, quantity, phone, address, orderDate });
    await order.save();

    // Notify all connected clients of the new order
    notifyClients('newOrder', { orderId });

    res.status(201).json({ message: 'Order placed successfully! We will contact you Soon.', orderId });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

// Get All Orders
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ orderDate: -1 }); // Sort by latest first
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// Update Order Status
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
    const orders = await Order.find().sort({ orderDate: -1 });
    const csvWriter = createCsvWriter({
      path: 'orders_backup.csv',
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

    await csvWriter.writeRecords(orders);
    res.download('orders_backup.csv', 'orders_backup.csv', (err) => {
      if (err) res.status(500).json({ error: 'Failed to download CSV file.' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate CSV backup.' });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));