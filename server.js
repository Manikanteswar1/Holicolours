const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 5000; // Use environment port for deployment compatibility

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve frontend files from 'public' folder

// Initialize SQLite Database
const db = new sqlite3.Database('./orders.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    // Create the orders table if it doesn’t exist
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        combo TEXT DEFAULT '5-Color Combo',
        orderDate TEXT NOT NULL,
        delivered INTEGER DEFAULT 0,
        spam INTEGER DEFAULT 0
      )
    `, () => {
      // Add delivered and spam columns if they don’t exist (for existing databases)
      db.run(`
        ALTER TABLE orders ADD COLUMN delivered INTEGER DEFAULT 0
      `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Error adding delivered column:', err.message);
        }
      });
      db.run(`
        ALTER TABLE orders ADD COLUMN spam INTEGER DEFAULT 0
      `, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Error adding spam column:', err.message);
        }
      });
    });
  }
});

// API to Save Orders
app.post('/api/order', (req, res) => {
  const { name, quantity, phone, address, orderDate } = req.body;

  if (!name || !phone || !address || !quantity || !orderDate) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const stmt = db.prepare(`
    INSERT INTO orders (name, quantity, phone, address, combo, orderDate)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(name, Number(quantity), phone, address, '5-Color Combo', orderDate, (err) => {
    if (err) {
      console.error('Error saving order:', err.message);
      return res.status(500).json({ error: 'Failed to place order.' });
    }
    res.status(201).json({ message: 'Order placed successfully!' });
  });

  stmt.finalize();
});

// API to Fetch Orders
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders', [], (err, rows) => {
    if (err) {
      console.error('Error fetching orders:', err.message);
      return res.status(500).json({ error: 'Failed to fetch orders.' });
    }
    res.status(200).json(rows);
  });
});

// API to Update Delivery Status
app.put('/api/orders/:id/deliver', (req, res) => {
  const orderId = req.params.id;

  const stmt = db.prepare(`
    UPDATE orders SET delivered = 1 WHERE id = ?
  `);

  stmt.run(orderId, (err) => {
    if (err) {
      console.error('Error updating delivery status:', err.message);
      return res.status(500).json({ error: 'Failed to update delivery status.' });
    }
    res.status(200).json({ message: 'Order marked as delivered!' });
  });

  stmt.finalize();
});

// API to Mark Order as Spam
app.put('/api/orders/:id/spam', (req, res) => {
  const orderId = req.params.id;

  const stmt = db.prepare(`
    UPDATE orders SET spam = 1 WHERE id = ?
  `);

  stmt.run(orderId, (err) => {
    if (err) {
      console.error('Error marking order as spam:', err.message);
      return res.status(500).json({ error: 'Failed to mark order as spam.' });
    }
    res.status(200).json({ message: 'Order marked as spam!' });
  });

  stmt.finalize();
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    console.log('Database connection closed.');
    process.exit(0);
  });
});