const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

router.get('/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const years = parseInt(req.query.years) || 5;
    const initialInvestment = parseFloat(req.query.investment) || 10000;
    const rfRate = parseFloat(req.query.rf) || 4.5;
    const rmRate = parseFloat(req.query.rm) || 10.0;

    try {
        // Fetch historical price data (monthly) for the backtest window
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        let chartData;
        try {
            chartData = await yf.chart(ticker, {
                period1: startDate,
                period2: endDate,
                interval: '1mo',
                events: 'div'
            });
        } catch (e) {
            return res.json(getMockBacktestResponse(ticker, years, initialInvestment));
        }

        const quotes = (chartData.quotes || []).filter(q => q.close || q.adjclose);
        const dividendEvents = chartData.events?.dividends || [];

        if (quotes.length < 12) {
            return res.json(getMockBacktestResponse(ticker, years, initialInvestment));
        }

        // Get beta for CAPM
        let beta = 1.0;
        try {
            const quote = await yf.quote(ticker);
            beta = quote.beta || 1.0;
        } catch (e) {}

        // Build yearly dividend accumulation
        const yearlyDivs = {};
        dividendEvents.forEach(d => {
            const dDate = new Date(d.date < 10000000000 ? d.date * 1000 : d.date);
            const year = dDate.getFullYear();
            if (year > 2000 && year < 2100) {
                yearlyDivs[year] = (yearlyDivs[year] || 0) + d.amount;
            }
        });

        // Run backtest simulation
        const R = (rfRate / 100) + beta * ((rmRate / 100) - (rfRate / 100));
        const trades = [];
        const equityCurve = [];

        let cash = initialInvestment;
        let shares = 0;
        let position = 'OUT'; // OUT or IN
        let benchmarkShares = 0;
        let benchmarkInitialized = false;
        let peakValue = initialInvestment;
        let maxDrawdown = 0;
        const monthlyReturns = [];
        let prevPortfolioValue = initialInvestment;

        // Process each quarter (every 3 months) to generate signals
        for (let i = 0; i < quotes.length; i++) {
            const q = quotes[i];
            const price = q.close || q.adjclose;
            const date = new Date(q.date);
            const dateStr = date.toISOString().split('T')[0];

            if (!price || price <= 0) continue;

            // Initialize benchmark (buy-and-hold)
            if (!benchmarkInitialized) {
                benchmarkShares = initialInvestment / price;
                benchmarkInitialized = true;
            }

            // Current portfolio value
            const portfolioValue = position === 'IN' ? shares * price : cash;
            const benchmarkValue = benchmarkShares * price;

            // Track drawdown
            if (portfolioValue > peakValue) peakValue = portfolioValue;
            const drawdown = ((peakValue - portfolioValue) / peakValue) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;

            // Track monthly returns
            if (prevPortfolioValue > 0) {
                monthlyReturns.push((portfolioValue - prevPortfolioValue) / prevPortfolioValue);
            }
            prevPortfolioValue = portfolioValue;

            // Push equity curve point
            equityCurve.push({
                date: dateStr,
                portfolioValue: parseFloat(portfolioValue.toFixed(2)),
                benchmarkValue: parseFloat(benchmarkValue.toFixed(2))
            });

            // Generate DDM signal every 3 months (quarterly)
            if (i % 3 === 0 && i > 0) {
                // Collect dividend history up to this point
                const currentYear = date.getFullYear();
                const availableYears = Object.keys(yearlyDivs)
                    .map(Number)
                    .filter(y => y <= currentYear)
                    .sort();

                if (availableYears.length >= 2) {
                    const first = yearlyDivs[availableYears[0]];
                    const last = yearlyDivs[availableYears[availableYears.length - 1]];
                    const n = availableYears.length - 1;
                    const g = Math.pow(last / first, 1 / n) - 1;

                    const D0 = last;
                    const D1 = D0 * (1 + g);

                    let intrinsicValue;
                    if (R <= g || R - g < 0.001) {
                        intrinsicValue = price * 1.1; // Fallback
                    } else {
                        intrinsicValue = D1 / (R - g);
                    }

                    // Generate signal (same thresholds as main app)
                    const profitPct = ((intrinsicValue - price) / price) * 100;
                    let signal = 'HOLD';
                    if (profitPct > 10) signal = 'BUY';
                    if (profitPct < -10) signal = 'SELL';

                    // Execute trade
                    if (signal === 'BUY' && position === 'OUT') {
                        shares = cash / price;
                        cash = 0;
                        position = 'IN';
                        trades.push({
                            date: dateStr,
                            signal,
                            price: parseFloat(price.toFixed(2)),
                            intrinsicValue: parseFloat(intrinsicValue.toFixed(2)),
                            shares: parseFloat(shares.toFixed(4)),
                            portfolioValue: parseFloat((shares * price).toFixed(2))
                        });
                    } else if (signal === 'SELL' && position === 'IN') {
                        cash = shares * price;
                        shares = 0;
                        position = 'OUT';
                        trades.push({
                            date: dateStr,
                            signal,
                            price: parseFloat(price.toFixed(2)),
                            intrinsicValue: parseFloat(intrinsicValue.toFixed(2)),
                            shares: 0,
                            portfolioValue: parseFloat(cash.toFixed(2))
                        });
                    } else if (signal !== 'HOLD') {
                        // Log signal even if not acted on (already in position)
                        const curVal = position === 'IN' ? shares * price : cash;
                        trades.push({
                            date: dateStr,
                            signal: signal + ' (HELD)',
                            price: parseFloat(price.toFixed(2)),
                            intrinsicValue: parseFloat(intrinsicValue.toFixed(2)),
                            shares: parseFloat(shares.toFixed(4)),
                            portfolioValue: parseFloat(curVal.toFixed(2))
                        });
                    }
                }
            }
        }

        // Final portfolio value
        const lastPrice = quotes[quotes.length - 1].close || quotes[quotes.length - 1].adjclose;
        const finalPortfolioValue = position === 'IN' ? shares * lastPrice : cash;
        const finalBenchmarkValue = benchmarkShares * lastPrice;

        const totalReturn = ((finalPortfolioValue - initialInvestment) / initialInvestment) * 100;
        const benchmarkReturn = ((finalBenchmarkValue - initialInvestment) / initialInvestment) * 100;

        // Win rate: count profitable trades (buy-sell pairs)
        let wins = 0, totalPairs = 0;
        for (let i = 0; i < trades.length - 1; i++) {
            if (trades[i].signal === 'BUY') {
                for (let j = i + 1; j < trades.length; j++) {
                    if (trades[j].signal === 'SELL') {
                        totalPairs++;
                        if (trades[j].portfolioValue > trades[i].portfolioValue) wins++;
                        break;
                    }
                }
            }
        }
        const winRate = totalPairs > 0 ? (wins / totalPairs) * 100 : 0;

        // Sharpe ratio (annualized, assuming monthly returns)
        const avgReturn = monthlyReturns.length > 0
            ? monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length
            : 0;
        const stdReturn = monthlyReturns.length > 1
            ? Math.sqrt(monthlyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (monthlyReturns.length - 1))
            : 1;
        const sharpeRatio = stdReturn > 0
            ? ((avgReturn - (rfRate / 100 / 12)) / stdReturn) * Math.sqrt(12)
            : 0;

        res.json({
            ticker,
            years,
            initialInvestment,
            equityCurve,
            trades,
            metrics: {
                totalReturn: parseFloat(totalReturn.toFixed(2)),
                benchmarkReturn: parseFloat(benchmarkReturn.toFixed(2)),
                winRate: parseFloat(winRate.toFixed(1)),
                maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
                sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
                totalTrades: trades.filter(t => t.signal === 'BUY' || t.signal === 'SELL').length,
                finalValue: parseFloat(finalPortfolioValue.toFixed(2)),
                benchmarkFinalValue: parseFloat(finalBenchmarkValue.toFixed(2))
            },
            isMock: false
        });

    } catch (err) {
        console.error('Backtest error:', err.message);
        res.json(getMockBacktestResponse(ticker, years, initialInvestment));
    }
});

function getMockBacktestResponse(ticker, years, investment) {
    // Generate realistic mock data for fallback
    const equityCurve = [];
    const trades = [];
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    let portfolioValue = investment;
    let benchmarkValue = investment;

    for (let m = 0; m < years * 12; m++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);
        
        // Simulate growth with some variance
        const monthlyReturn = 0.005 + (Math.random() - 0.45) * 0.04;
        const benchReturn = 0.006 + (Math.random() - 0.45) * 0.03;
        portfolioValue *= (1 + monthlyReturn);
        benchmarkValue *= (1 + benchReturn);

        equityCurve.push({
            date: d.toISOString().split('T')[0],
            portfolioValue: parseFloat(portfolioValue.toFixed(2)),
            benchmarkValue: parseFloat(benchmarkValue.toFixed(2))
        });

        // Mock trade every 6 months
        if (m % 6 === 3) {
            trades.push({
                date: d.toISOString().split('T')[0],
                signal: m % 12 === 3 ? 'BUY' : 'SELL',
                price: parseFloat((50 + Math.random() * 20).toFixed(2)),
                intrinsicValue: parseFloat((55 + Math.random() * 25).toFixed(2)),
                shares: parseFloat((investment / 60).toFixed(4)),
                portfolioValue: parseFloat(portfolioValue.toFixed(2))
            });
        }
    }

    const totalReturn = ((portfolioValue - investment) / investment) * 100;
    const benchmarkReturn = ((benchmarkValue - investment) / investment) * 100;

    return {
        ticker,
        years,
        initialInvestment: investment,
        equityCurve,
        trades,
        metrics: {
            totalReturn: parseFloat(totalReturn.toFixed(2)),
            benchmarkReturn: parseFloat(benchmarkReturn.toFixed(2)),
            winRate: 62.5,
            maxDrawdown: 8.4,
            sharpeRatio: 1.15,
            totalTrades: trades.length,
            finalValue: parseFloat(portfolioValue.toFixed(2)),
            benchmarkFinalValue: parseFloat(benchmarkValue.toFixed(2))
        },
        isMock: true
    };
}

module.exports = router;
