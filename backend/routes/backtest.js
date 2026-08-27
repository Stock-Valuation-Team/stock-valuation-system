const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    logger: { ...console, warn: (msg, ...args) => { if (!String(msg).includes('Unsupported environment')) console.warn(msg, ...args); } }
});

router.get('/:ticker', async (req, res) => {
    const { ticker }  = req.params;
    const years              = parseInt(req.query.years)       || 5;
    const initialInvestment  = parseFloat(req.query.investment) || 10000;
    const rfRate             = parseFloat(req.query.rf)        || 4.5;
    const rmRate             = parseFloat(req.query.rm)        || 10.0;
    const dripEnabled        = req.query.drip !== 'false';     // DRIP on by default

    try {
        const endDate   = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        let chartData;
        try {
            chartData = await yf.chart(ticker, {
                period1:  startDate,
                period2:  endDate,
                interval: '1mo',
                events:   'div'
            });
        } catch (e) {
            return res.json(getMockBacktestResponse(ticker, years, initialInvestment, dripEnabled));
        }

        const quotes          = (chartData.quotes || []).filter(q => q.close || q.adjclose);
        const dividendEvents  = chartData.events?.dividends || [];

        if (quotes.length < 12) {
            return res.json(getMockBacktestResponse(ticker, years, initialInvestment, dripEnabled));
        }

        // ── Beta ──────────────────────────────────────────────────────────────
        let beta = 1.0;
        try { const q = await yf.quote(ticker); beta = q.beta || 1.0; } catch (e) {}

        // ── Dividend calendar (date → amount) ─────────────────────────────────
        const divCalendar = {};
        dividendEvents.forEach(d => {
            const dDate   = new Date(d.date < 10000000000 ? d.date * 1000 : d.date);
            const dateKey = dDate.toISOString().split('T')[0].slice(0, 7); // YYYY-MM
            divCalendar[dateKey] = (divCalendar[dateKey] || 0) + d.amount;
        });

        // ── Yearly dividends for DDM signal ──────────────────────────────────
        const yearlyDivs = {};
        dividendEvents.forEach(d => {
            const dDate = new Date(d.date < 10000000000 ? d.date * 1000 : d.date);
            const year  = dDate.getFullYear();
            if (year > 2000 && year < 2100) yearlyDivs[year] = (yearlyDivs[year] || 0) + d.amount;
        });

        // ── Required return (CAPM) ────────────────────────────────────────────
        const R = (rfRate / 100) + beta * ((rmRate / 100) - (rfRate / 100));

        // ── Simulation state ──────────────────────────────────────────────────
        let cash              = initialInvestment;
        let shares            = 0;
        let dripCash          = initialInvestment;
        let dripShares        = 0;
        let benchmarkShares   = 0;
        let benchmarkInit     = false;
        let position          = 'OUT';
        let dripPosition      = 'OUT';

        const trades          = [];
        const equityCurve     = [];
        const divIncomeList   = [];     // cumulative div income
        let   totalDivIncome  = 0;
        let   dripDivIncome   = 0;
        let   peakValue       = initialInvestment;
        let   maxDrawdown     = 0;
        const monthlyReturns  = [];
        let   prevPortValue   = initialInvestment;

        // ── Initial YoC ───────────────────────────────────────────────────────
        let   initCostBasis   = 0;   // price at first BUY
        let   dripCostBasis   = 0;

        for (let i = 0; i < quotes.length; i++) {
            const q     = quotes[i];
            const price = q.close || q.adjclose;
            if (!price || price <= 0) continue;

            const date    = new Date(q.date);
            const dateStr = date.toISOString().split('T')[0];
            const monthKey = dateStr.slice(0, 7);

            // ── Benchmark (buy-and-hold, no DRIP) ────────────────────────────
            if (!benchmarkInit) { benchmarkShares = initialInvestment / price; benchmarkInit = true; }

            // ── Collect dividends for this month ──────────────────────────────
            const divThisMonth = divCalendar[monthKey] || 0;

            if (divThisMonth > 0 && shares > 0) {
                const inc = divThisMonth * shares;
                totalDivIncome += inc;
                cash           += inc;   // non-DRIP adds to cash
            }
            if (divThisMonth > 0 && dripShares > 0) {
                const inc = divThisMonth * dripShares;
                dripDivIncome += inc;
                if (dripEnabled) {
                    // Reinvest: buy more shares at current price
                    dripShares += inc / price;
                } else {
                    dripCash += inc;
                }
            }

            // ── Portfolio values ──────────────────────────────────────────────
            const portfolioValue  = position     === 'IN' ? shares     * price : cash;
            const dripValue       = dripPosition === 'IN' ? dripShares * price : dripCash;
            const benchmarkValue  = benchmarkShares * price;

            // Track drawdown on main strategy
            if (portfolioValue > peakValue) peakValue = portfolioValue;
            const drawdown = ((peakValue - portfolioValue) / peakValue) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;

            if (prevPortValue > 0) monthlyReturns.push((portfolioValue - prevPortValue) / prevPortValue);
            prevPortValue = portfolioValue;

            // ── Yield-on-cost ─────────────────────────────────────────────────
            const annualDiv   = Object.values(yearlyDivs).slice(-1)[0] || 0;
            const yoc         = initCostBasis > 0 && annualDiv > 0 ? (annualDiv / initCostBasis) * 100 : 0;
            const dripYoc     = dripCostBasis > 0 && annualDiv > 0 ? (annualDiv / dripCostBasis) * 100 : 0;

            equityCurve.push({
                date:           dateStr,
                portfolioValue: parseFloat(portfolioValue.toFixed(2)),
                dripValue:      parseFloat(dripValue.toFixed(2)),
                benchmarkValue: parseFloat(benchmarkValue.toFixed(2)),
                divIncome:      parseFloat(totalDivIncome.toFixed(2)),
                dripDivIncome:  parseFloat(dripDivIncome.toFixed(2)),
                yoc:            parseFloat(yoc.toFixed(2)),
                dripYoc:        parseFloat(dripYoc.toFixed(2))
            });

            divIncomeList.push({ date: dateStr, cumIncome: parseFloat(totalDivIncome.toFixed(2)) });

            // ── DDM signal (quarterly) ────────────────────────────────────────
            if (i % 3 === 0 && i > 0) {
                const currentYear    = date.getFullYear();
                const availableYears = Object.keys(yearlyDivs).map(Number).filter(y => y <= currentYear).sort();

                if (availableYears.length >= 2) {
                    const first = yearlyDivs[availableYears[0]];
                    const last  = yearlyDivs[availableYears[availableYears.length - 1]];
                    const n     = availableYears.length - 1;
                    const g     = Math.pow(last / first, 1 / n) - 1;

                    const D1  = last * (1 + g);
                    let intrinsicValue;
                    if (R <= g || R - g < 0.001) { intrinsicValue = price * 1.1; }
                    else { intrinsicValue = D1 / (R - g); }

                    const profitPct = ((intrinsicValue - price) / price) * 100;
                    let signal = 'HOLD';
                    if (profitPct >  10) signal = 'BUY';
                    if (profitPct < -10) signal = 'SELL';

                    // Execute: main strategy
                    if (signal === 'BUY' && position === 'OUT') {
                        shares   = cash / price;
                        cash     = 0;
                        position = 'IN';
                        initCostBasis = price;
                        trades.push({ date: dateStr, signal, price: +price.toFixed(2), intrinsicValue: +intrinsicValue.toFixed(2), shares: +shares.toFixed(4), portfolioValue: +(shares * price).toFixed(2) });
                    } else if (signal === 'SELL' && position === 'IN') {
                        cash     = shares * price;
                        shares   = 0;
                        position = 'OUT';
                        trades.push({ date: dateStr, signal, price: +price.toFixed(2), intrinsicValue: +intrinsicValue.toFixed(2), shares: 0, portfolioValue: +cash.toFixed(2) });
                    } else if (signal !== 'HOLD') {
                        const cur = position === 'IN' ? shares * price : cash;
                        trades.push({ date: dateStr, signal: signal + ' (HELD)', price: +price.toFixed(2), intrinsicValue: +intrinsicValue.toFixed(2), shares: +shares.toFixed(4), portfolioValue: +cur.toFixed(2) });
                    }

                    // Execute: DRIP strategy (mirrors main)
                    if (signal === 'BUY' && dripPosition === 'OUT') {
                        dripShares   = dripCash / price;
                        dripCash     = 0;
                        dripPosition = 'IN';
                        dripCostBasis = price;
                    } else if (signal === 'SELL' && dripPosition === 'IN') {
                        dripCash     = dripShares * price;
                        dripShares   = 0;
                        dripPosition = 'OUT';
                    }
                }
            }
        }

        // ── Final metrics ─────────────────────────────────────────────────────
        const lastPrice          = quotes[quotes.length - 1].close || quotes[quotes.length - 1].adjclose;
        const finalPortValue     = position     === 'IN' ? shares     * lastPrice : cash;
        const finalDripValue     = dripPosition === 'IN' ? dripShares * lastPrice : dripCash;
        const finalBenchmarkValue = benchmarkShares * lastPrice;

        const totalReturn     = ((finalPortValue      - initialInvestment) / initialInvestment) * 100;
        const dripReturn      = ((finalDripValue       - initialInvestment) / initialInvestment) * 100;
        const benchmarkReturn = ((finalBenchmarkValue  - initialInvestment) / initialInvestment) * 100;

        // Win rate
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

        // Sharpe ratio (annualised monthly)
        const avgReturn = monthlyReturns.length ? monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length : 0;
        const stdReturn = monthlyReturns.length > 1
            ? Math.sqrt(monthlyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (monthlyReturns.length - 1))
            : 1;
        const sharpeRatio = stdReturn > 0 ? ((avgReturn - (rfRate / 100 / 12)) / stdReturn) * Math.sqrt(12) : 0;

        // Final YoC
        const annualDiv = Object.values(yearlyDivs).slice(-1)[0] || 0;
        const finalYoc  = initCostBasis > 0 && annualDiv > 0 ? (annualDiv / initCostBasis) * 100 : 0;
        const finalDripYoc = dripCostBasis > 0 && annualDiv > 0 ? (annualDiv / dripCostBasis) * 100 : 0;

        res.json({
            ticker, years, initialInvestment, dripEnabled,
            equityCurve, trades,
            metrics: {
                totalReturn:          +totalReturn.toFixed(2),
                dripReturn:           +dripReturn.toFixed(2),
                benchmarkReturn:      +benchmarkReturn.toFixed(2),
                winRate:              +winRate.toFixed(1),
                maxDrawdown:          +maxDrawdown.toFixed(2),
                sharpeRatio:          +sharpeRatio.toFixed(2),
                totalTrades:          trades.filter(t => t.signal === 'BUY' || t.signal === 'SELL').length,
                finalValue:           +finalPortValue.toFixed(2),
                dripFinalValue:       +finalDripValue.toFixed(2),
                benchmarkFinalValue:  +finalBenchmarkValue.toFixed(2),
                totalDivIncome:       +totalDivIncome.toFixed(2),
                dripDivIncome:        +dripDivIncome.toFixed(2),
                yieldOnCost:          +finalYoc.toFixed(2),
                dripYieldOnCost:      +finalDripYoc.toFixed(2)
            },
            isMock: false
        });

    } catch (err) {
        console.error('Backtest error:', err.message);
        res.json(getMockBacktestResponse(ticker, years, initialInvestment, dripEnabled));
    }
});

function getMockBacktestResponse(ticker, years, investment, drip) {
    const equityCurve = [];
    const trades      = [];
    const startDate   = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    let pv = investment, dripV = investment, bv = investment, divInc = 0, dripInc = 0;

    for (let m = 0; m < years * 12; m++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);
        const mr  = 0.005  + (Math.random() - 0.45) * 0.04;
        const bmr = 0.006  + (Math.random() - 0.45) * 0.03;
        const divM = 0.00065 * pv;   // ~0.8% annual div yield
        pv    *= (1 + mr);
        bv    *= (1 + bmr);
        divInc += divM;
        dripInc += divM;
        dripV  *= (1 + mr);
        dripV  += drip ? divM : 0;

        equityCurve.push({
            date:           d.toISOString().split('T')[0],
            portfolioValue: +pv.toFixed(2),
            dripValue:      +dripV.toFixed(2),
            benchmarkValue: +bv.toFixed(2),
            divIncome:      +divInc.toFixed(2),
            dripDivIncome:  +dripInc.toFixed(2),
            yoc:            +(2.8 + m * 0.01).toFixed(2),
            dripYoc:        +(3.1 + m * 0.015).toFixed(2)
        });
        if (m % 6 === 3) {
            trades.push({
                date:           d.toISOString().split('T')[0],
                signal:         m % 12 === 3 ? 'BUY' : 'SELL',
                price:          +(50 + Math.random() * 20).toFixed(2),
                intrinsicValue: +(55 + Math.random() * 25).toFixed(2),
                shares:         +(investment / 60).toFixed(4),
                portfolioValue: +pv.toFixed(2)
            });
        }
    }

    const tr  = ((pv  - investment) / investment) * 100;
    const dr  = ((dripV - investment) / investment) * 100;
    const br  = ((bv  - investment) / investment) * 100;

    return {
        ticker, years, initialInvestment: investment, dripEnabled: drip,
        equityCurve, trades,
        metrics: {
            totalReturn: +tr.toFixed(2), dripReturn: +dr.toFixed(2), benchmarkReturn: +br.toFixed(2),
            winRate: 62.5, maxDrawdown: 8.4, sharpeRatio: 1.15,
            totalTrades: trades.length,
            finalValue: +pv.toFixed(2), dripFinalValue: +dripV.toFixed(2),
            benchmarkFinalValue: +bv.toFixed(2),
            totalDivIncome: +divInc.toFixed(2), dripDivIncome: +dripInc.toFixed(2),
            yieldOnCost: 3.4, dripYieldOnCost: 4.1
        },
        isMock: true
    };
}

module.exports = router;
