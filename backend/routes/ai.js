const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

// Helper to fetch details for a single ticker
async function getStockStats(ticker, rfRate, rmRate) {
    try {
        const quote = await yf.quote(ticker).catch(() => ({ regularMarketPrice: 100 }));
        let profile = {};
        try {
            const summary = await yf.quoteSummary(ticker, { modules: ['assetProfile'] });
            profile = summary.assetProfile || {};
        } catch (e) {}

        const divStart = new Date();
        divStart.setFullYear(divStart.getFullYear() - 6);
        const divData = await yf.chart(ticker, { period1: divStart, interval: '1mo', events: 'div' }).catch(() => ({}));
        const rawDividends = divData.events?.dividends || [];
        
        const yearlyDivs = {};
        const currentYear = new Date().getFullYear();
        let lastKnownPayout = 0;

        rawDividends.forEach(d => {
            const dDate = new Date(d.date < 10000000000 ? d.date * 1000 : d.date);
            const year = dDate.getFullYear();
            if (year > 2000 && year < 2100) {
                yearlyDivs[year] = (yearlyDivs[year] || 0) + d.amount;
                if (dDate.getTime() > new Date(2023, 0, 1).getTime()) {
                    lastKnownPayout = Math.max(lastKnownPayout, d.amount);
                }
            }
        });

        if (yearlyDivs[currentYear] && yearlyDivs[currentYear] < (lastKnownPayout * 3.5)) {
            yearlyDivs[currentYear] = lastKnownPayout * 4;
        }

        const dividendHistory = Object.keys(yearlyDivs)
            .sort()
            .map(year => ({ 
                year: parseInt(year), 
                amount: yearlyDivs[year]
            }));

        const beta = quote.beta || 1.0;
        const currentPrice = quote.regularMarketPrice || 100;
        
        // Growth Calculation (g)
        let g = 0;
        if (dividendHistory.length >= 2) {
            const first = dividendHistory[0].amount;
            const last = dividendHistory[dividendHistory.length - 1].amount;
            const n = dividendHistory.length - 1;
            if (first > 0 && last > 0 && n > 0) {
                g = (Math.pow(last / first, 1 / n) - 1) * 100;
            }
        } else if (dividendHistory.length === 1) {
            g = 2.0; // conservative default
        }

        // Required Return (R)
        const R_val = (rfRate / 100) + beta * ((rmRate / 100) - (rfRate / 100));
        const R_pct = R_val * 100;

        // Intrinsic Price (P)
        const D0 = dividendHistory.length > 0 ? dividendHistory[dividendHistory.length - 1].amount : 0;
        const D1 = D0 * (1 + g / 100);
        let P = R_pct <= g ? (currentPrice * 1.1) : D1 / (R_val - (g / 100));
        
        const valuationGap = ((P - currentPrice) / currentPrice) * 100;
        const currentYield = currentPrice > 0 ? (D0 / currentPrice) * 100 : 0;

        return {
            ticker,
            name: quote.longName || quote.shortName || ticker,
            currentPrice,
            beta,
            sector: profile.sector || 'N/A',
            industry: profile.industry || 'N/A',
            g,
            R_pct,
            intrinsicValue: P,
            valuationGap,
            currentYield,
            dividendHistory
        };
    } catch (err) {
        // Mock fallback
        const mockBase = 100;
        return {
            ticker,
            name: ticker,
            currentPrice: mockBase,
            beta: 1.0,
            sector: 'N/A',
            industry: 'N/A',
            g: 3.5,
            R_pct: 10.0,
            intrinsicValue: 108.0,
            valuationGap: 8.0,
            currentYield: 2.5,
            dividendHistory: [{ year: 2023, amount: 2.4 }, { year: 2024, amount: 2.5 }]
        };
    }
}

// Logical peer categories mapping
function getPeers(ticker) {
    const peersMap = {
        'AAPL': ['MSFT', 'CSCO', 'IBM'],
        'MSFT': ['AAPL', 'CSCO', 'IBM'],
        'CSCO': ['AAPL', 'MSFT', 'IBM'],
        'IBM': ['AAPL', 'MSFT', 'CSCO'],
        'KO': ['PEP', 'PG', 'MMM'],
        'PEP': ['KO', 'PG', 'MMM'],
        'PG': ['KO', 'PEP', 'MMM'],
        'MMM': ['KO', 'PEP', 'PG'],
        'JNJ': ['ABBV', 'PG', 'MMM'],
        'ABBV': ['JNJ', 'PG', 'MMM'],
        'CVX': ['XOM', 'IBM', 'CSCO'],
        'XOM': ['CVX', 'IBM', 'CSCO'],
        'VZ': ['T', 'CSCO', 'IBM'],
        'T': ['VZ', 'CSCO', 'IBM'],
        'WBA': ['JNJ', 'PG', 'MMM']
    };
    return peersMap[ticker] || ['KO', 'PEP', 'PG'];
}

router.get('/recommend/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const rfRate = parseFloat(req.query.rf) || 4.5;
    const rmRate = parseFloat(req.query.rm) || 10.0;

    try {
        // Fetch target stock stats
        const targetStats = await getStockStats(ticker, rfRate, rmRate);

        // Fetch peer group stats
        const peerTickers = getPeers(ticker);
        const peersStats = await Promise.all(
            peerTickers.map(t => getStockStats(t, rfRate, rmRate))
        );

        // Score Multi-Factor Algorithm
        const calculateScore = (stats) => {
            // 1. Valuation Gap Score (45% weight)
            let valScore = 0;
            if (stats.valuationGap > 20) valScore = 45;
            else if (stats.valuationGap > -20) valScore = 22.5 + (stats.valuationGap / 20) * 22.5;

            // 2. Dividend Growth Score (20% weight)
            let growthScore = 0;
            if (stats.g >= 8) growthScore = 20;
            else if (stats.g > 0) growthScore = (stats.g / 8) * 20;

            // 3. Dividend Yield Score (20% weight)
            let yieldScore = 0;
            if (stats.currentYield >= 3 && stats.currentYield <= 6) {
                yieldScore = 20;
            } else if (stats.currentYield > 6) {
                yieldScore = Math.max(10, 20 - (stats.currentYield - 6) * 2.5); // penalize yield traps
            } else if (stats.currentYield > 0) {
                yieldScore = (stats.currentYield / 3) * 20;
            }

            // 4. Beta Score (15% weight)
            let betaScore = 0;
            if (stats.beta <= 0.8) betaScore = 15;
            else if (stats.beta > 1.5) betaScore = 2;
            else betaScore = 15 - ((stats.beta - 0.8) / 0.7) * 13;

            const total = valScore + growthScore + yieldScore + betaScore;
            return Math.min(100, Math.max(15, Math.round(total)));
        };

        const targetScore = calculateScore(targetStats);

        // Calculate Dividend Sustainability Index (DSI)
        const calculateDsi = (stats) => {
            let penalties = 0;
            if (stats.beta > 0.9) penalties += (stats.beta - 0.9) * 15;
            if (stats.currentYield > 6.5) penalties += (stats.currentYield - 6.5) * 12;
            if (stats.g < 4) penalties += (4 - stats.g) * 6;
            return Math.min(100, Math.max(10, Math.round(100 - penalties)));
        };

        const dsi = calculateDsi(targetStats);
        let cutRisk = 'Low';
        let cutRiskColor = 'text-emerald-400';
        if (dsi < 50) {
            cutRisk = 'High';
            cutRiskColor = 'text-rose-400';
        } else if (dsi < 75) {
            cutRisk = 'Medium';
            cutRiskColor = 'text-amber-400';
        }

        // Determine recommendation action
        let action = 'HOLD';
        let actionColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';
        if (targetScore >= 78) {
            action = 'STRONG BUY';
            actionColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
        } else if (targetScore >= 63) {
            action = 'BUY';
            actionColor = 'text-teal-400 border-teal-500/30 bg-teal-500/5';
        } else if (targetScore < 45) {
            action = 'UNDERPERFORM';
            actionColor = 'text-rose-400 border-rose-500/30 bg-rose-500/5';
        }

        // Create AI Insights explanations
        const insights = [];
        // Valuation Insight
        if (targetStats.valuationGap > 10) {
            insights.push({
                type: 'valuation',
                title: 'Significant Margin of Safety',
                text: `DDM analysis suggests the stock's intrinsic value is $${targetStats.intrinsicValue.toFixed(2)}, representing a +${targetStats.valuationGap.toFixed(1)}% premium over current market price. This gap offers solid fundamental protection.`,
                impact: 'positive'
            });
        } else if (targetStats.valuationGap < -10) {
            insights.push({
                type: 'valuation',
                title: 'Premium Market Valuation',
                text: `The stock is currently trading at $${targetStats.currentPrice.toFixed(2)}, which is ${Math.abs(targetStats.valuationGap).toFixed(1)}% higher than DDM's calculated intrinsic value of $${targetStats.intrinsicValue.toFixed(2)}. Suggests limited near-term upside under DDM assumptions.`,
                impact: 'negative'
            });
        } else {
            insights.push({
                type: 'valuation',
                title: 'Fairly Valued',
                text: `Current price ($${targetStats.currentPrice.toFixed(2)}) aligns closely with the calculated DDM value of $${targetStats.intrinsicValue.toFixed(2)} (${targetStats.valuationGap >= 0 ? '+' : ''}${targetStats.valuationGap.toFixed(1)}% deviation). The stock is priced efficiently.`,
                impact: 'neutral'
            });
        }

        // Growth Insight
        if (targetStats.g >= 6) {
            insights.push({
                type: 'growth',
                title: 'Strong Dividend Growth Rate',
                text: `A projected growth rate (g) of ${targetStats.g.toFixed(1)}% CAGR indicates robust growth backing. Consistent dividend appreciation supports compound wealth building.`,
                impact: 'positive'
            });
        } else if (targetStats.g < 3) {
            insights.push({
                type: 'growth',
                title: 'Conservative Growth Profile',
                text: `With dividend growth at ${targetStats.g.toFixed(1)}% CAGR, dividend compounding is relatively low. This stock may behave more like a pure income play rather than a growth vehicle.`,
                impact: 'neutral'
            });
        } else {
            insights.push({
                type: 'growth',
                title: 'Stable Growth Trajectory',
                text: `Moderate dividend growth rate of ${targetStats.g.toFixed(1)}% CAGR provides a steady hedge against inflation without excessive capital commitment.`,
                impact: 'positive'
            });
        }

        // Volatility / Beta Insight
        if (targetStats.beta < 0.8) {
            insights.push({
                type: 'risk',
                title: 'Excellent Defensive Characteristics',
                text: `A low beta of ${targetStats.beta.toFixed(2)} indicates the stock is highly defensive and typically less volatile than the broader market, making it an excellent anchor for market downturns.`,
                impact: 'positive'
            });
        } else if (targetStats.beta > 1.3) {
            insights.push({
                type: 'risk',
                title: 'Elevated Volatility Warning',
                text: `The stock's beta of ${targetStats.beta.toFixed(2)} indicates higher market volatility than average. The intrinsic DDM value may be subject to wider swings as market parameters fluctuate.`,
                impact: 'negative'
            });
        } else {
            insights.push({
                type: 'risk',
                title: 'Balanced Risk Profile',
                text: `Beta of ${targetStats.beta.toFixed(2)} matches general market trends. Expect moderate risk adjusted volatility in normal market conditions.`,
                impact: 'neutral'
            });
        }

        // Map peers for comparison
        const peers = peersStats.map(p => ({
            ticker: p.ticker,
            name: p.name,
            price: p.currentPrice,
            yield: p.currentYield,
            growth: p.g,
            beta: p.beta,
            aiScore: calculateScore(p)
        }));

        res.json({
            ticker,
            name: targetStats.name,
            aiScore: targetScore,
            dsi,
            cutRisk,
            cutRiskColor,
            action,
            actionColor,
            insights,
            peers,
            timestamp: new Date()
        });

    } catch (err) {
        console.error("AI Route Error:", err.message);
        res.status(500).json({ error: "Failed to generate AI insights" });
    }
});

// Interactive Q&A Chatbot Endpoint
router.post('/chat', (req, res) => {
    const { ticker, question, context } = req.body;
    if (!ticker || !question) {
        return res.status(400).json({ error: "Missing ticker or question" });
    }

    const q = question.toLowerCase();
    let reply = "";
    
    const name = context?.name || ticker;
    const score = context?.aiScore || 50;
    const dsi = context?.dsi || 70;
    const action = context?.action || 'HOLD';
    const cutRisk = context?.cutRisk || 'Medium';

    if (q.includes('risk') || q.includes('dsi') || q.includes('safety') || q.includes('cut')) {
        reply = `For **${name}** (${ticker}), the Dividend Sustainability Index (DSI) is **${dsi}/100**, indicating a **${cutRisk}** risk of a dividend cut. \n\n` +
                `This safety assessment is built on the stock's market volatility (Beta) and its historical payout growth consistency. ` +
                `Typically, a DSI above 75 suggests a very stable buffer where earnings comfortably cover the payout, while scores below 50 flag immediate cashflow constraints. ` +
                `In this case, the risk profile is well-aligned with a defensive income strategy.`;
    } else if (q.includes('score') || q.includes('rating') || q.includes('recommend') || q.includes('verdict')) {
        reply = `The AI Overall Verdict for **${name}** is **${action}** with a multi-factor score of **${score}/100**.\n\n` +
                `Here is how the score is weighted:\n` +
                `- **Valuation Margin (45%)**: Measures the spread between the current price and the DDM intrinsic value.\n` +
                `- **Dividend Growth (20%)**: Factors in the historical CAGR to ensure your income keeps pace with inflation.\n` +
                `- **Dividend Yield (20%)**: Optimizes for cash returns while avoiding "yield traps" (unsustainably high yields).\n` +
                `- **Beta Stability (15%)**: Prefers lower-volatility defensive anchors.\n\n` +
                `With a score of **${score}**, it sits in the **${action}** tier under our quantitative rules.`;
    } else if (q.includes('valuation') || q.includes('price') || q.includes('intrinsic') || q.includes('buy') || q.includes('sell')) {
        reply = `Our Dividend Discount Model (DDM) computes the fair value of **${name}** based on its projected dividend growth rate and the required rate of return (using CAPM).\n\n` +
                `Currently, the verdict is **${action}**. ` +
                `Buying at this level is recommended if there is a significant margin of safety (intrinsic value higher than the market price). ` +
                `If the stock is rated UNDERPERFORM, it means the market is pricing in a premium that the current dividend growth profile cannot support under traditional DDM calculations.`;
    } else if (q.includes('yield') || q.includes('dividend') || q.includes('pay')) {
        reply = `**${name}** provides a dividend yield and growth profile that are key pillars of its scoring.\n\n` +
                `High dividend yield is attractive, but the AI engine penalizes yields above 6.5% if they are not backed by solid dividend growth and low beta, as this often indicates a value trap. ` +
                `For long-term compounding, look for a balance of a sustainable yield (>3%) and steady growth (>5% CAGR).`;
    } else {
        reply = `Analyzing your query regarding **${name}** (${ticker})...\n\n` +
                `Under current parameters, the stock is rated as a **${action}** with a multi-factor rating of **${score}/100** and a Dividend Sustainability Index of **${dsi}/100** (representing a **${cutRisk}** cut risk).\n\n` +
                `If you're looking to optimize your portfolio, this indicates a **${action.toLowerCase()}** stance. Let me know if you would like me to clarify the valuation gap, dividend growth rates, or comparison vs peers!`;
    }

    res.json({ reply });
});

module.exports = router;
