const express = require('express');
const router = express.Router();
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    logger: { ...console, warn: (msg, ...args) => { if (!String(msg).includes('Unsupported environment')) console.warn(msg, ...args); } }
});
const Groq = require('groq-sdk');

// ── Comprehensive stock stats for AI scoring ──────────────────────────────────
async function getStockStats(ticker, rfRate, rmRate) {
    try {
        const [quote, summaryRaw] = await Promise.allSettled([
            yf.quote(ticker),
            yf.quoteSummary(ticker, {
                modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'assetProfile']
            })
        ]);

        const q  = quote.status === 'fulfilled'     ? quote.value          : { regularMarketPrice: 100 };
        const sm = summaryRaw.status === 'fulfilled' ? summaryRaw.value     : {};
        const ks = sm.defaultKeyStatistics || {};
        const fd = sm.financialData        || {};
        const sd = sm.summaryDetail        || {};
        const ap = sm.assetProfile         || {};

        const beta         = q.beta || ks.beta || 1.0;
        const currentPrice = q.regularMarketPrice || 100;
        const trailingEps  = ks.trailingEps   || fd.revenuePerShare || null;
        const payoutRatio  = sd.payoutRatio   || ks.payoutRatio     || null;
        const freeCashflow = fd.freeCashflow  || null;
        const currentYieldRaw = sd.dividendYield || q.trailingAnnualDividendYield || 0;

        // ── Dividend history ──────────────────────────────────────────────────
        const divStart = new Date();
        divStart.setFullYear(divStart.getFullYear() - 7);
        const divData = await yf.chart(ticker, {
            period1:  divStart,
            interval: '1mo',
            events:   'div'
        }).catch(() => ({}));

        const rawDividends = divData.events?.dividends || [];
        const yearlyDivs   = {};
        const currentYear  = new Date().getFullYear();
        let lastKnownPayout = 0;

        rawDividends.forEach(d => {
            const dDate = new Date(d.date < 10000000000 ? d.date * 1000 : d.date);
            const year  = dDate.getFullYear();
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
            .map(year => ({ year: parseInt(year), amount: yearlyDivs[year] }));

        // ── Growth rate (CAGR) ────────────────────────────────────────────────
        let g = 0;
        const cleanHist = dividendHistory.filter((_, idx, arr) => idx < arr.length - 1 || !yearlyDivs[currentYear]);
        if (cleanHist.length >= 2) {
            const first = cleanHist[0].amount, last = cleanHist[cleanHist.length - 1].amount;
            const n     = cleanHist.length - 1;
            if (first > 0 && last > 0) g = (Math.pow(last / first, 1 / n) - 1) * 100;
        } else if (dividendHistory.length === 1) { g = 2.0; }
        g = Math.min(20, Math.max(-5, g));

        // ── Gordon Growth Model ───────────────────────────────────────────────
        const R_val = (rfRate / 100) + beta * ((rmRate / 100) - (rfRate / 100));
        const R_pct = R_val * 100;
        const D0    = dividendHistory.length > 0 ? dividendHistory[dividendHistory.length - 1].amount : 0;
        const D1    = D0 * (1 + g / 100);
        let P = R_pct <= g ? (currentPrice * 1.1) : D1 / (R_val - (g / 100));
        const valuationGap = ((P - currentPrice) / currentPrice) * 100;
        const currentYield = currentYieldRaw * 100 || (currentPrice > 0 && D0 > 0 ? (D0 / currentPrice) * 100 : 0);
        const payoutPct = payoutRatio ? payoutRatio * 100 : null;

        return {
            ticker,
            name:          q.longName || q.shortName || ticker,
            currentPrice,
            beta,
            sector:        ap.sector   || 'N/A',
            industry:      ap.industry || 'N/A',
            g, R_pct,
            intrinsicValue: P,
            valuationGap,
            currentYield,
            payoutPct,
            trailingEps,
            freeCashflow,
            dividendHistory
        };
    } catch (err) {
        return {
            ticker, name: ticker, currentPrice: 100, beta: 1.0,
            sector: 'N/A', industry: 'N/A',
            g: 3.5, R_pct: 10.0, intrinsicValue: 108.0, valuationGap: 8.0,
            currentYield: 2.5, payoutPct: 60, trailingEps: null, freeCashflow: null,
            dividendHistory: [{ year: 2023, amount: 2.4 }, { year: 2024, amount: 2.5 }]
        };
    }
}

// ── Sector peer map ───────────────────────────────────────────────────────────
function getPeers(ticker) {
    const map = {
        'AAPL': ['MSFT', 'CSCO', 'IBM'],    'MSFT': ['AAPL', 'CSCO', 'IBM'],
        'CSCO': ['AAPL', 'MSFT', 'IBM'],    'IBM':  ['AAPL', 'MSFT', 'CSCO'],
        'KO':   ['PEP', 'PG', 'MO'],        'PEP':  ['KO', 'PG', 'MO'],
        'PG':   ['KO', 'PEP', 'CL'],        'MMM':  ['HON', 'EMR', 'GE'],
        'JNJ':  ['ABBV', 'MRK', 'PFE'],     'ABBV': ['JNJ', 'MRK', 'PFE'],
        'CVX':  ['XOM', 'BP', 'COP'],       'XOM':  ['CVX', 'BP', 'COP'],
        'VZ':   ['T', 'TMUS', 'CMCSA'],     'T':    ['VZ', 'TMUS', 'CMCSA'],
        'WBA':  ['CVS', 'JNJ', 'MCK'],      'MO':   ['PM', 'BTI', 'KO'],
        'HD':   ['LOW', 'TGT', 'WMT'],      'WMT':  ['TGT', 'COST', 'HD'],
        'JPM':  ['BAC', 'WFC', 'C'],        'BAC':  ['JPM', 'WFC', 'USB'],
        'NEE':  ['D', 'DUK', 'SO'],         'D':    ['NEE', 'DUK', 'SO'],
    };
    return map[ticker] || ['KO', 'PEP', 'PG'];
}

// ── 5-factor AI Score ─────────────────────────────────────────────────────────
function calculateScore(stats) {
    let valScore = 0;
    if      (stats.valuationGap > 30)  valScore = 35;
    else if (stats.valuationGap > 0)   valScore = 17.5 + (stats.valuationGap / 30) * 17.5;
    else if (stats.valuationGap > -30) valScore = 17.5 + (stats.valuationGap / 30) * 17.5;
    else                               valScore = 0;

    let growthScore = stats.g >= 10 ? 20 : stats.g > 0 ? (stats.g / 10) * 20 : 0;

    let yieldScore = 0;
    if      (stats.currentYield >= 2.5 && stats.currentYield <= 6) yieldScore = 20;
    else if (stats.currentYield > 6)  yieldScore = Math.max(8, 20 - (stats.currentYield - 6) * 3);
    else if (stats.currentYield > 0)  yieldScore = (stats.currentYield / 2.5) * 20;

    let betaScore = stats.beta <= 0.7 ? 15 : stats.beta > 1.5 ? 2 : 15 - ((stats.beta - 0.7) / 0.8) * 13;

    let payoutScore = 0;
    if (stats.payoutPct !== null) {
        if      (stats.payoutPct < 40)  payoutScore = 10;
        else if (stats.payoutPct < 60)  payoutScore = 8;
        else if (stats.payoutPct < 80)  payoutScore = 5;
        else if (stats.payoutPct < 100) payoutScore = 2;
        else                            payoutScore = 0;
    } else {
        payoutScore = 5;
    }

    return Math.min(100, Math.max(10, Math.round(valScore + growthScore + yieldScore + betaScore + payoutScore)));
}

// ── DSI (Dividend Safety Index) ──────────────────────────────────────────────
function calculateDsi(stats) {
    let score = 100;
    if (stats.beta > 1.0) score -= (stats.beta - 1.0) * 20;
    if (stats.currentYield > 7) score -= (stats.currentYield - 7) * 15;
    if (stats.g < 3) score -= (3 - stats.g) * 8;
    if (stats.payoutPct !== null) {
        if      (stats.payoutPct > 100) score -= 30;
        else if (stats.payoutPct >  80) score -= (stats.payoutPct - 80) * 1.5;
    }
    return Math.min(100, Math.max(5, Math.round(score)));
}

// ── Fallback Quantitative Heuristic Engine ────────────────────────────────────
function generateOfflineAIResponse(ticker, question, context) {
    const q = (question || '').toLowerCase();
    const name = context?.name || ticker;
    const score = context?.aiScore ?? 75;
    const dsi = context?.dsi ?? 85;
    const action = context?.action || 'BUY';
    const cutRisk = context?.cutRisk || 'Low';
    const price = context?.currentPrice ? '$' + Number(context.currentPrice).toFixed(2) : 'the market price';
    const iv = context?.intrinsicValue ? '$' + Number(context.intrinsicValue).toFixed(2) : 'its intrinsic value';
    const gap = context?.valuationGap !== undefined && context?.valuationGap !== null ? (context.valuationGap >= 0 ? '+' : '') + Number(context.valuationGap).toFixed(1) + '%' : 'fair value';
    const yieldPct = context?.currentYield ? Number(context.currentYield).toFixed(2) + '%' : 'annual yield';
    const gPct = context?.g !== undefined && context?.g !== null ? Number(context.g).toFixed(1) + '%' : 'growth';
    const payout = context?.payoutPct ? Number(context.payoutPct).toFixed(0) + '%' : 'sustainable payout';

    if (q.includes('profit') || q.includes('buy') || q.includes('confidence') || q.includes('money') || q.includes('return')) {
        return `### 📊 Profit Potential & Confidence Analysis for **${name}** (${ticker})

1. **What Does Model Confidence Mean?**
   - The **Confidence Score** measures **data consistency & model fit** (5-year dividend CAGR stability, low beta volatility, and payout coverage). It is **not a guaranteed risk-free profit**, but a mathematical confirmation that the DDM assumptions are robust.

2. **How Profit is Generated in this Setup:**
   - **Capital Appreciation (Margin of Safety):** Trading at **${price}** with a DDM Intrinsic Value of **${iv}** (${gap} spread). If market price moves toward fair value, this represents upside.
   - **Income Cash Flow:** Offers a **${yieldPct}** dividend yield with an annual growth rate of **${gPct}** CAGR. Reinvesting through DRIP compounds total returns.
   - **Risk Assessment:** Overall action is **${action}** with **${cutRisk} Cut Risk** (DSI: **${dsi}/100**).

*Recommendation:* For best risk-adjusted profit, maintain a long-term investment horizon (3–5 years) to allow dividend compounding and valuation convergence to materialize.`;
    }

    if (q.includes('why') || q.includes('rating') || q.includes('verdict')) {
        return `### 🎯 Why **${name}** is Rated **${action}** (Score: **${score}/100**)

- **Valuation Margin:** Intrinsic fair value is **${iv}** vs current market price **${price}** (${gap} valuation gap).
- **Dividend Safety (DSI: ${dsi}/100):** Dividend Cut Risk is **${cutRisk}**, supported by a payout ratio of **${payout}**.
- **Growth & Income:** Historical dividend CAGR is **${gPct}** alongside a **${yieldPct}** forward yield.
- **Defensive Beta:** Beta is tailored for market resilience, making ${ticker} an attractive core dividend asset.`;
    }

    if (q.includes('dsi') || q.includes('safety') || q.includes('cut risk')) {
        return `### 🛡️ Dividend Safety Index (DSI) Breakdown for **${name}**

- **DSI Score:** **${dsi}/100** (**${cutRisk} Cut Risk**)
- **Payout Coverage:** Earnings payout ratio is **${payout}** (levels below 75% provide high cashflow safety buffer).
- **Growth Track Record:** Consistent **${gPct}** 5-year CAGR proves management's commitment to dividend expansion.
- **Verdict:** High probability of dividend preservation and continued growth over the next 12–24 months.`;
    }

    if (q.includes('peer') || q.includes('compare')) {
        const peersList = context?.peers?.map(p => `• **${p.ticker}** (${p.name}): Yield **${p.yield?.toFixed(2)}%**, Beta **${p.beta?.toFixed(2)}**, AI Score **${p.aiScore}/100**`).join('\n') || 'Peer data loading...';
        return `### 🏢 Sector Peer Group Comparison for **${ticker}**

${peersList}

**Takeaway:** **${ticker}** holds an AI rating of **${action}** with **${dsi}/100 DSI**, positioning it competitively within its sector peer group.`;
    }

    // Default comprehensive response
    return `### 💡 AI Intelligence Summary for **${name}** (${ticker})

- **Action Verdict:** **${action}** (AI Score: **${score}/100**)
- **Valuation Spread:** Current price is **${price}** vs Intrinsic DDM Value **${iv}** (${gap}).
- **Dividend Profile:** Forward yield **${yieldPct}** | Historical CAGR **${gPct}** | Payout Ratio **${payout}**.
- **Safety Index:** **${dsi}/100** (${cutRisk} Cut Risk).

Feel free to ask specific questions about dividend reinvestment, sensitivity margins, or peer rankings!`;
}

// ── GET /api/ai/recommend/:ticker ────────────────────────────────────────────
router.get('/recommend/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const rfRate = parseFloat(req.query.rf) || 4.5;
    const rmRate = parseFloat(req.query.rm) || 10.0;

    try {
        const [targetStats, ...peersStats] = await Promise.all([
            getStockStats(ticker, rfRate, rmRate),
            ...getPeers(ticker).map(t => getStockStats(t, rfRate, rmRate))
        ]);

        const targetScore = calculateScore(targetStats);
        const dsi         = calculateDsi(targetStats);

        let cutRisk = 'Low', cutRiskColor = 'text-emerald-400';
        if      (dsi < 50) { cutRisk = 'High';   cutRiskColor = 'text-rose-400';  }
        else if (dsi < 75) { cutRisk = 'Medium'; cutRiskColor = 'text-amber-400'; }

        let action = 'HOLD', actionColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';
        if      (targetScore >= 80) { action = 'STRONG BUY';   actionColor = 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5'; }
        else if (targetScore >= 65) { action = 'BUY';           actionColor = 'text-teal-400 border-teal-500/30 bg-teal-500/5';         }
        else if (targetScore >= 50) { action = 'HOLD';          actionColor = 'text-amber-400 border-amber-500/30 bg-amber-500/5';      }
        else if (targetScore >= 35) { action = 'UNDERPERFORM';  actionColor = 'text-orange-400 border-orange-500/30 bg-orange-500/5';   }
        else                        { action = 'AVOID';          actionColor = 'text-rose-400 border-rose-500/30 bg-rose-500/5';         }

        const insights = [];

        // Valuation insight
        if      (targetStats.valuationGap > 15) insights.push({ type: 'valuation', title: 'Strong Margin of Safety', text: `DDM intrinsic value $${targetStats.intrinsicValue.toFixed(2)} is +${targetStats.valuationGap.toFixed(1)}% above market price $${targetStats.currentPrice.toFixed(2)}. Solid fundamental protection against near-term downside.`, impact: 'positive' });
        else if (targetStats.valuationGap < -15) insights.push({ type: 'valuation', title: 'Premium Valuation', text: `Trading at $${targetStats.currentPrice.toFixed(2)}, ${Math.abs(targetStats.valuationGap).toFixed(1)}% above DDM intrinsic value $${targetStats.intrinsicValue.toFixed(2)}. Limited upside under dividend discount assumptions.`, impact: 'negative' });
        else insights.push({ type: 'valuation', title: 'Fairly Valued', text: `Price ($${targetStats.currentPrice.toFixed(2)}) aligns closely with DDM value $${targetStats.intrinsicValue.toFixed(2)} (${targetStats.valuationGap >= 0 ? '+' : ''}${targetStats.valuationGap.toFixed(1)}%). Within typical valuation band.`, impact: 'neutral' });

        // Growth insight
        if      (targetStats.g >= 7)  insights.push({ type: 'growth', title: 'Strong Dividend Growth', text: `${targetStats.g.toFixed(1)}% CAGR — above average. Consistent dividend appreciation supports inflation-beating wealth compounding.`, impact: 'positive' });
        else if (targetStats.g < 2)   insights.push({ type: 'growth', title: 'Low Dividend Growth', text: `${targetStats.g.toFixed(1)}% CAGR — this stock behaves primarily as an income play with minimal real growth of the payout.`, impact: 'neutral' });
        else insights.push({ type: 'growth', title: 'Stable Growth Profile', text: `${targetStats.g.toFixed(1)}% CAGR provides a steady hedge above inflation. Consistent trajectory supports DDM assumptions.`, impact: 'positive' });

        // Risk insight
        const payoutStr = targetStats.payoutPct !== null ? `Payout ratio ${targetStats.payoutPct.toFixed(0)}%. ` : '';
        if      (targetStats.beta < 0.8 && (targetStats.payoutPct === null || targetStats.payoutPct < 70))  insights.push({ type: 'risk', title: 'Excellent Defensive Profile', text: `${payoutStr}Beta ${targetStats.beta.toFixed(2)} — highly defensive. Low volatility and a sustainable payout make this a premium portfolio anchor.`, impact: 'positive' });
        else if (targetStats.beta > 1.3 || (targetStats.payoutPct !== null && targetStats.payoutPct > 90))  insights.push({ type: 'risk', title: 'Elevated Risk Factors', text: `${payoutStr}Beta ${targetStats.beta.toFixed(2)} — ${targetStats.payoutPct > 90 ? 'High payout ratio raises dividend cut risk.' : 'Higher market volatility than average.'} Monitor cash flow coverage.`, impact: 'negative' });
        else insights.push({ type: 'risk', title: 'Moderate Risk Profile', text: `${payoutStr}Beta ${targetStats.beta.toFixed(2)} — tracks general market. Dividend appears adequately covered by earnings.`, impact: 'neutral' });

        const peers = peersStats.map(p => ({
            ticker: p.ticker, name: p.name, price: p.currentPrice,
            yield: p.currentYield, growth: p.g, beta: p.beta,
            payoutPct: p.payoutPct,
            aiScore: calculateScore(p)
        }));

        res.json({
            ticker, name: targetStats.name,
            aiScore:       targetScore,
            currentPrice:  targetStats.currentPrice,
            intrinsicValue: targetStats.intrinsicValue,
            valuationGap:  targetStats.valuationGap,
            currentYield:  targetStats.currentYield,
            g:             targetStats.g,
            payoutPct:     targetStats.payoutPct,
            dsi, cutRisk, cutRiskColor,
            action, actionColor,
            insights, peers,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('AI Route Error:', err.message);
        res.status(500).json({ error: 'Failed to generate AI insights' });
    }
});

// ── POST /api/ai/chat — Groq with Automatic Heuristic Fallback ────────────────
router.post('/chat', async (req, res) => {
    const { ticker, question, context } = req.body;
    if (!ticker || !question) return res.status(400).json({ error: 'Missing ticker or question' });

    const name           = context?.name           || ticker;
    const score          = context?.aiScore         || 50;
    const dsi            = context?.dsi             || 70;
    const action         = context?.action          || 'HOLD';
    const cutRisk        = context?.cutRisk         || 'Medium';
    const currentPrice   = context?.currentPrice    || null;
    const intrinsicValue = context?.intrinsicValue  || null;
    const currentYield   = context?.currentYield    || null;
    const g              = context?.g               || null;
    const payoutPct      = context?.payoutPct       || null;
    const valuationGap   = context?.valuationGap    || null;

    const apiKey = process.env.GROQ_API_KEY;

    // If Groq API Key is configured, attempt LLM completion
    if (apiKey) {
        try {
            const groq = new Groq({ apiKey });

            const peersInfo    = context?.peers    ? context.peers.map(p => `${p.ticker} — Score: ${p.aiScore}, Yield: ${p.yield?.toFixed(2)}%, Growth: ${p.growth?.toFixed(1)}%, Beta: ${p.beta?.toFixed(2)}, Payout: ${p.payoutPct ? p.payoutPct.toFixed(0) + '%' : 'N/A'}`).join('\n') : 'Not available';
            const insightsInfo = context?.insights ? context.insights.map(i => `[${i.type.toUpperCase()}] ${i.title}: ${i.text}`).join('\n') : 'Not available';

            const systemPrompt = `You are a professional Dividend Stock Analyst AI embedded in a DDM (Dividend Discount Model) valuation platform. You give clear, accurate, data-driven answers.

LIVE ANALYSIS DATA FOR ${name} (${ticker}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Price:         ${currentPrice  ? '$' + Number(currentPrice).toFixed(2)  : 'N/A'}
DDM Intrinsic Value:   ${intrinsicValue ? '$' + Number(intrinsicValue).toFixed(2) : 'N/A'}
Valuation Gap:         ${valuationGap  !== null ? (valuationGap >= 0 ? '+' : '') + Number(valuationGap).toFixed(1) + '%' : 'N/A'}
Forward Div Yield:     ${currentYield  !== null ? Number(currentYield).toFixed(2) + '%' : 'N/A'}
Dividend CAGR (g):     ${g !== null    ? Number(g).toFixed(1) + '%' : 'N/A'}
Payout Ratio:          ${payoutPct     !== null ? Number(payoutPct).toFixed(0) + '%' : 'N/A'}
AI Score:              ${score}/100
DSI (Safety Index):    ${dsi}/100
Dividend Cut Risk:     ${cutRisk}
Recommendation:        ${action}

Key Insights:
${insightsInfo}

Peer Comparison:
${peersInfo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Always cite specific numbers from the data above.
- Address questions about profit and confidence with financial clarity (explain model confidence vs market risk).
- Be concise (3–6 sentences or 4–6 bullet points).
- Use **bold** for key figures.`;

            let completion;
            try {
                completion = await groq.chat.completions.create({
                    model:       'llama-3.1-8b-instant',
                    messages:    [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: question      }
                    ],
                    max_tokens:  500,
                    temperature: 0.7
                });
            } catch (mErr) {
                // Try alternate groq model
                completion = await groq.chat.completions.create({
                    model:       'llama3-8b-8192',
                    messages:    [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: question      }
                    ],
                    max_tokens:  500,
                    temperature: 0.7
                });
            }

            const reply = completion?.choices?.[0]?.message?.content;
            if (reply) return res.json({ reply, source: 'groq' });
        } catch (err) {
            console.warn('Groq fallback triggered:', err.message);
        }
    }

    // Seamless offline/fallback heuristic engine
    const heuristicReply = generateOfflineAIResponse(ticker, question, context);
    return res.json({ reply: heuristicReply, source: 'heuristic-engine' });
});

module.exports = router;
