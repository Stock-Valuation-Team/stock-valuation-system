const express = require('express');
const router = express.Router();
const yahooFinance = require('yahoo-finance2').default;
const db = require('../db');

// GET dividend data
router.get('/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;

        const result = await yahooFinance.historical(symbol, {
            period1: '2021-01-01',
            period2: new Date().toISOString().split('T')[0],
            events: 'dividends'
        });

        // Format data
        const formatted = result.map(item => ({
            date: item.date.toISOString().split('T')[0],
            dividend: item.dividends
        }));

        // Save to DB
        formatted.forEach(d => {
            db.query(
                "INSERT INTO dividends (symbol, date, dividend) VALUES (?, ?, ?)",
                [symbol, d.date, d.dividend]
            );
        });

        res.json(formatted);

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch dividend data" });
    }
});

module.exports = router;