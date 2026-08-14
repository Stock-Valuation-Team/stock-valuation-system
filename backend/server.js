const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const dividendRoute = require('./routes/dividend');
const ddmRoute = require('./routes/ddm');
const backtestRoute = require('./routes/backtest');
const aiRoute = require('./routes/ai');
app.use('/api/dividends', dividendRoute);
app.use('/api/ddm', ddmRoute);
app.use('/api/backtest', backtestRoute);
app.use('/api/ai', aiRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
