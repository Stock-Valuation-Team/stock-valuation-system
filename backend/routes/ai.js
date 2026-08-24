const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    logger: { ...console, warn: (msg, ...args) => { if (!String(msg).includes('Unsupported environment')) console.warn(msg, ...args); } }
});
const Groq = require('groq-sdk');

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

        const dividendHistory = Object.keys(yearlyDivs).sort()
            .map(year => ({ year: parseInt(year), amount: yearlyDivs[year] }));

        const beta = quote.beta || 1.0;
        const currentPrice = quote.regularMarketPrice || 100;
        
        let g = 0;
        if (dividendHistory.length >= 2) {
            const first = dividendHistory[0].amount;
            const last = dividendHistory[dividendHistory.length - 1].amount;
            const n = dividendHistory.length - 1;
            if (first > 0 && last > 0 && n > 0) g = (Math.pow(last / first, 1 / n) - 1) * 100;
        } else if (dividendHistory.length === 1) {
            g = 2.0;
        }

        const R_val = (rfRate / 100) + beta * ((rmRate / 100) - (rfRate / 100));
        const R_pct = R_val * 100;
        const D0 = dividendHistory.length > 0 ? dividendHistory[dividendHistory.length - 1].amount : 0;
        const D1 = D0 * (1 + g / 100);
        let P = R_pct <= g ? (currentPrice * 1.1) : D1 / (R_val - (g / 100));
        const valuationGap = ((P - currentPrice) / currentPrice) * 100;
        const currentYield = currentPrice > 0 ? (D0 / currentPrice) * 100 : 0;

        return { ticker, name: quote.longName || quote.shortName || ticker, currentPrice, beta,
                 sector: profile.sector || 'N/A', industry: profile.industry || 'N/A',
                 g, R_pct, intrinsicValue: P, valuationGap, currentYield, dividendHistory };
    } catch (err) {
        return { ticker, name: ticker, currentPrice: 100, beta: 1.0, sector: 'N/A', industry: 'N/A',
                 g: 3.5, R_pct: 10.0, intrinsicValue: 108.0, valuationGap: 8.0, currentYield: 2.5,
                 dividendHistory: [{ year: 2023, amount: 2.4 }, { year: 2024, amount: 2.5 }] };
    }
}

function getPeers(ticker) {
    const peersMap = {
        'AAPL': ['MSFT', 'CSCO', 'IBM'], 'MSFT': ['AAPL', 'CSCO', 'IBM'],
        'CSCO': ['AAPL', 'MSFT', 'IBM'], 'IBM':  ['AAPL', 'MSFT', 'CSCO'],
        'KO':   ['PEP', 'PG', 'MMM'],    'PEP':  ['KO', 'PG', 'MMM'],
        'PG':   ['KO', 'PEP', 'MMM'],    'MMM':  ['KO', 'PEP', 'PG'],
        'JNJ':  ['ABBV', 'PG', 'MMM'],   'ABBV': ['JNJ', 'PG', 'MMM'],
        'CVX':  ['XOM', 'IBM', 'CSCO'],  'XOM':  ['CVX', 'IBM', 'CSCO'],
        'VZ':   ['T', 'CSCO', 'IBM'],    'T':    ['VZ', 'CSCO', 'IBM'],
        'WBA':  ['JNJ', 'PG', 'MMM']
    };
    return peersMap[ticker] || ['KO', 'PEP', 'PG'];
}

// GET /api/ai/recommend/:ticker
router.get('/recommend/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const rfRate = parseFloat(req.query.rf) || 4.5;
    const rmRate = parseFloat(req.query.rm) || 10.0;

    try {
        const targetStats = await getStockStats(ticker, rfRate, rmRate);
        const peersStats = await Promise.all(getPeers(ticker).map(t => getStockStats(t, rfRate, rmRate)));

        const calculateScore = (stats) => {
            let valScore = 0;
            if (stats.valuationGap > 20) valScore = 45;
            else if (stats.valuationGap > -20) valScore = 22.5 + (stats.valuationGap / 20) * 22.5;
            let growthScore = stats.g >= 8 ? 20 : stats.g > 0 ? (stats.g / 8) * 20 : 0;
            let yieldScore = 0;
            if (stats.currentYield >= 3 && stats.currentYield <= 6) yieldScore = 20;
            else if (stats.currentYield > 6) yieldScore = Math.max(10, 20 - (stats.currentYield - 6) * 2.5);
            else if (stats.currentYield > 0) yieldScore = (stats.currentYield / 3) * 20;
            let betaScore = stats.beta <= 0.8 ? 15 : stats.beta > 1.5 ? 2 : 15 - ((stats.beta - 0.8) / 0.7) * 13;
            return Math.min(100, Math.max(15, Math.round(valScore + growthScore + yieldScore + betaScore)));
        };

        const targetScore = calculateScore(targetStats);

        const calculateDsi = (stats) => {
            let penalties = 0;
            if (stats.beta > 0.9) penalties += (stats.beta - 0.9) * 15;
            if (stats.currentYield > 6.5) penalties += (stats.currentYield - 6.5) * 12;
            if (stats.g < 4) penalties += (4 - stats.g) * 6;
            return Math.min(100, Math.max(10, Math.round(100 - penalties)));
        };

        const dsi = calculateDsi(targetStats);
        let cutRisk = 'Low', cutRiskColor = 'text-emerald-400';
        if (dsi < 50)      { cutRisk = 'High';   cutRiskColor = 'text-rose-400'; }
        else if (dsi < 75) { cutRisk = 'Medium'; cutRiskColor = 'text-amber-400'; }

        let action = 'HOLD', actionColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';
        if (targetScore >= 78)      { action = 'STRONG BUY';  actionColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'; }
        else if (targetScore >= 63) { action = 'BUY';         actionColor = 'text-teal-400 border-teal-500/30 bg-teal-500/5'; }
        else if (targetScore < 45)  { action = 'UNDERPERFORM'; actionColor = 'text-rose-400 border-rose-500/30 bg-rose-500/5'; }

        const insights = [];
        if (targetStats.valuationGap > 10)       insights.push({ type: 'valuation', title: 'Significant Margin of Safety', text: `DDM intrinsic value $${targetStats.intrinsicValue.toFixed(2)} is +${targetStats.valuationGap.toFixed(1)}% above market price. This offers solid fundamental protection.`, impact: 'positive' });
        else if (targetStats.valuationGap < -10) insights.push({ type: 'valuation', title: 'Premium Market Valuation', text: `Trading at $${targetStats.currentPrice.toFixed(2)}, which is ${Math.abs(targetStats.valuationGap).toFixed(1)}% above DDM intrinsic value $${targetStats.intrinsicValue.toFixed(2)}. Limited near-term upside under DDM.`, impact: 'negative' });
        else                                     insights.push({ type: 'valuation', title: 'Fairly Valued', text: `Price ($${targetStats.currentPrice.toFixed(2)}) aligns closely with DDM value $${targetStats.intrinsicValue.toFixed(2)} (${targetStats.valuationGap >= 0 ? '+' : ''}${targetStats.valuationGap.toFixed(1)}%).`, impact: 'neutral' });

        if (targetStats.g >= 6)      insights.push({ type: 'growth', title: 'Strong Dividend Growth Rate', text: `${targetStats.g.toFixed(1)}% CAGR indicates robust growth. Consistent dividend appreciation supports compound wealth building.`, impact: 'positive' });
        else if (targetStats.g < 3)  insights.push({ type: 'growth', title: 'Conservative Growth Profile', text: `${targetStats.g.toFixed(1)}% CAGR — relatively low. Stock behaves more like a pure income play.`, impact: 'neutral' });
        else                         insights.push({ type: 'growth', title: 'Stable Growth Trajectory', text: `${targetStats.g.toFixed(1)}% CAGR provides a steady hedge against inflation.`, impact: 'positive' });

        if (targetStats.beta < 0.8)      insights.push({ type: 'risk', title: 'Excellent Defensive Characteristics', text: `Beta ${targetStats.beta.toFixed(2)} — highly defensive. Excellent portfolio anchor during market downturns.`, impact: 'positive' });
        else if (targetStats.beta > 1.3) insights.push({ type: 'risk', title: 'Elevated Volatility Warning', text: `Beta ${targetStats.beta.toFixed(2)} — higher volatility than market average. DDM value may swing with changing rates.`, impact: 'negative' });
        else                             insights.push({ type: 'risk', title: 'Balanced Risk Profile', text: `Beta ${targetStats.beta.toFixed(2)} — tracks general market. Moderate risk-adjusted volatility expected.`, impact: 'neutral' });

        const peers = peersStats.map(p => ({
            ticker: p.ticker, name: p.name, price: p.currentPrice,
            yield: p.currentYield, growth: p.g, beta: p.beta, aiScore: calculateScore(p)
        }));

        res.json({ ticker, name: targetStats.name, aiScore: targetScore,
                   currentPrice: targetStats.currentPrice, intrinsicValue: targetStats.intrinsicValue,
                   dsi, cutRisk, cutRiskColor, action, actionColor, insights, peers, timestamp: new Date() });

    } catch (err) {
        console.error('AI Route Error:', err.message);
        res.status(500).json({ error: 'Failed to generate AI insights' });
    }
});

// POST /api/ai/chat — Groq Llama 3 only (no fallback)
router.post('/chat', async (req, res) => {
    const { ticker, question, context } = req.body;
    if (!ticker || !question) return res.status(400).json({ error: 'Missing ticker or question' });

    const name           = context?.name          || ticker;
    const score          = context?.aiScore        || 50;
    const dsi            = context?.dsi            || 70;
    const action         = context?.action         || 'HOLD';
    const cutRisk        = context?.cutRisk        || 'Medium';
    const currentPrice   = context?.currentPrice   || null;
    const intrinsicValue = context?.intrinsicValue || null;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI service not configured.' });

    try {
        const groq = new Groq({ apiKey });

        const peersInfo    = context?.peers    ? context.peers.map(p => `${p.ticker} — Score: ${p.aiScore}, Yield: ${p.yield?.toFixed(2)}%, Beta: ${p.beta?.toFixed(2)}`).join('\n') : 'Not available';
        const insightsInfo = context?.insights ? context.insights.map(i => `[${i.type.toUpperCase()}] ${i.title}: ${i.text}`).join('\n') : 'Not available';

        const systemPrompt = `You are a smart, friendly AI Stock Analyst assistant embedded in a Dividend Discount Model (DDM) stock analysis platform.

LIVE STOCK DATA:
Stock: ${name} (${ticker})
Current Price: ${currentPrice ? '$' + currentPrice.toFixed(2) : 'N/A'}
DDM Intrinsic Value: ${intrinsicValue ? '$' + intrinsicValue.toFixed(2) : 'N/A'}
AI Recommendation: ${action}
AI Score: ${score}/100
DSI (Dividend Safety Index): ${dsi}/100
Cut Risk: ${cutRisk}

Insights:
${insightsInfo}

Peer Comparison:
${peersInfo}

RULES:
- Answer using the data above. Always use exact numbers.
- Be conversational and concise (3-6 sentences or bullet points).
- Use **bold** for key figures.
- Greetings: respond warmly, introduce yourself, offer to help with ${name}.
- Off-topic: politely redirect to stock analysis.
- Never invent data not in the context.`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: question }
            ],
            max_tokens: 450,
            temperature: 0.75
        });

        const reply = completion.choices[0]?.message?.content || 'No response generated.';
        return res.json({ reply, source: 'groq' });

    } catch (err) {
        console.error('Groq error:', err.message);
        return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' });
    }
});

module.exports = router;
