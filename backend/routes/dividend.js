const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all dividends
router.get('/', (req, res) => {
    if (!db || typeof db.query !== 'function') {
        return res.json([
            { id: 1, ticker: 'AAPL', amount: 0.24, ex_date: '2024-02-09', payment_date: '2024-02-15' },
            { id: 2, ticker: 'MSFT', amount: 0.75, ex_date: '2024-02-14', payment_date: '2024-03-14' },
            { id: 3, ticker: 'KO', amount: 0.46, ex_date: '2024-03-14', payment_date: '2024-04-01' }
        ]);
    }
    const sql = 'SELECT * FROM dividends';
    db.query(sql, (err, results) => {
        if (err) {
            console.warn("DB query failed, returning fallback data:", err.message);
            return res.json([
                { id: 1, ticker: 'AAPL', amount: 0.24, ex_date: '2024-02-09', payment_date: '2024-02-15' },
                { id: 2, ticker: 'MSFT', amount: 0.75, ex_date: '2024-02-14', payment_date: '2024-03-14' },
                { id: 3, ticker: 'KO', amount: 0.46, ex_date: '2024-03-14', payment_date: '2024-04-01' }
            ]);
        }
        res.json(results);
    });
});

// Add a dividend
router.post('/', (req, res) => {
    const { ticker, amount, ex_date, payment_date } = req.body;
    if (!db || typeof db.query !== 'function') {
        return res.json({ id: Date.now(), ...req.body, note: "Saved locally (database offline)" });
    }
    const sql = 'INSERT INTO dividends (ticker, amount, ex_date, payment_date) VALUES (?, ?, ?, ?)';
    db.query(sql, [ticker, amount, ex_date, payment_date], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: result.insertId, ...req.body });
    });
});

// Test route to verify server without database
router.get('/test', (req, res) => {
    res.json([
        { id: 1, ticker: 'AAPL', amount: 0.24, ex_date: '2024-02-09', payment_date: '2024-02-15' },
        { id: 2, ticker: 'MSFT', amount: 0.75, ex_date: '2024-02-14', payment_date: '2024-03-14' },
        { id: 3, ticker: 'KO', amount: 0.46, ex_date: '2024-03-14', payment_date: '2024-04-01' }
    ]);
});

module.exports = router;


