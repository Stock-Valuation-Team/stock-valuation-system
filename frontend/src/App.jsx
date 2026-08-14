import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';

const TOP_STOCKS = ['AAPL', 'MSFT', 'KO', 'PEP', 'JNJ', 'PG', 'MMM', 'ABBV', 'CVX', 'XOM', 'IBM', 'VZ', 'T', 'WBA', 'CSCO'];
const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y'];

function App() {
  const [selectedTicker, setSelectedTicker] = useState('KO');
  const [activeRange, setActiveRange] = useState('1D');
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null); // Track mouse position for Angel One tooltip

  const [rf, setRf] = useState(4.5);
  const [rm, setRm] = useState(10.0);
  const [committedRf, setCommittedRf] = useState(4.5);
  const [committedRm, setCommittedRm] = useState(10.0);
  const [investment, setInvestment] = useState(10000);
  const [activeTab, setActiveTab] = useState('analysis');
  const [backtestData, setBacktestData] = useState(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const formatChatMessage = (text) => {
    return text.split('\n').map((line, lineIdx) => {
      const isBullet = line.trim().startsWith('-');
      let content = isBullet ? line.trim().substring(1).trim() : line;
      const parts = content.split('**');
      const formattedParts = parts.map((part, partIdx) => {
        if (partIdx % 2 === 1) {
          return <strong key={partIdx} className="text-white font-extrabold">{part}</strong>;
        }
        return part;
      });
      if (isBullet) {
        return (
          <li key={lineIdx} className="ml-4 list-disc text-gray-300 my-1 text-[11px] leading-relaxed">
            {formattedParts}
          </li>
        );
      }
      return (
        <p key={lineIdx} className="text-gray-300 my-1 text-[11px] leading-relaxed min-h-[1em]">
          {formattedParts}
        </p>
      );
    });
  };

  const sendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: question }]);
    setChatLoading(true);
    try {
      const res = await axios.post('http://localhost:5000/api/ai/chat', {
        ticker: selectedTicker,
        question: question,
        context: aiData
      });
      setChatMessages(prev => [...prev, { sender: 'ai', text: res.data.reply }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: '⚠️ Failed to get a response from the AI assistant. Please check your backend connection and try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchAI = async (ticker, currentRf = rf, currentRm = rm) => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await axios.get(`http://localhost:5000/api/ai/recommend/${ticker}?rf=${currentRf}&rm=${currentRm}`);
      setAiData(response.data);
      setChatMessages([
        {
          sender: 'ai',
          text: `Hi! I have analyzed **${response.data.name}** (${response.data.ticker}) and generated an AI recommendation of **${response.data.action}** with an AI score of **${response.data.aiScore}/100** and a Dividend Sustainability Index of **${response.data.dsi}/100** (${response.data.cutRisk} Cut Risk). Do you have any questions or confusion about this rating?`
        }
      ]);
    } catch (err) {
      setAiError('Failed to fetch AI recommendations.');
    } finally {
      setAiLoading(false);
    }
  };

  const fetchAnalysis = async (ticker, range) => {
    setLoading(true);
    setError(null);
    try {
      setCommittedRf(rf);
      setCommittedRm(rm);
      const delay = new Promise(resolve => setTimeout(resolve, 1500));
      const [response] = await Promise.all([
        axios.get(`http://localhost:5000/api/ddm/analyze/${ticker}?range=${range.toLowerCase()}`),
        delay
      ]);
      setAnalysisData(response.data);
      // Sync AI recommendations fetch
      fetchAI(ticker, rf, rm);
    } catch (err) {
      setError('Connection interrupted. Displaying analysis history.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBacktest = async () => {
    setBacktestLoading(true);
    setActiveTab('backtest');
    try {
      const [response] = await Promise.all([
        axios.get(`http://localhost:5000/api/backtest/${selectedTicker}?years=5&investment=${investment}&rf=${rf}&rm=${rm}`),
        new Promise(r => setTimeout(r, 1500))
      ]);
      setBacktestData(response.data);
    } catch (e) { console.error(e); } finally { setBacktestLoading(false); }
  };

  useEffect(() => {
    fetchAnalysis(selectedTicker, activeRange);
  }, [selectedTicker, activeRange]);

  const model = useMemo(() => {
    if (!analysisData) return null;
    const { currentPrice, beta, dividendHistory } = analysisData;
    
    let g = 0;
    if (dividendHistory && dividendHistory.length >= 2) {
      const first = dividendHistory[0].amount;
      const last = dividendHistory[dividendHistory.length - 1].amount;
      const n = dividendHistory.length - 1;
      g = (Math.pow(last / first, 1 / n) - 1) * 100;
    }
    
    const R_val = (committedRf / 100) + beta * ((committedRm / 100) - (committedRf / 100));
    const R_pct = R_val * 100;
    
    const D0 = (dividendHistory && dividendHistory.length > 0) ? dividendHistory[dividendHistory.length - 1].amount : 0;
    const D1 = D0 * (1 + g / 100);
    const P = R_pct <= g ? (currentPrice * 1.1) : D1 / (R_val - (g / 100));
    const profitPct = ((P - currentPrice) / currentPrice) * 100;
    
    // Dynamic Confidence Level: Highly sensitive to the Valuation Spread
    const baseConf = beta < 0.8 ? 82 : (beta < 1.2 ? 74 : 66);
    // Increased sensitivity: Adjustment is 20% of the profit percentage, capped at 25
    const gapAdj = Math.min(25, Math.abs(profitPct) * 0.15);
    
    // Seed-based variance + Spread adjustment
    const dnaVariance = (analysisData.ticker.charCodeAt(0) % 5); 
    const confidence = Math.min(99, baseConf + gapAdj + dnaVariance).toFixed(0);

    let signal = "HOLD", color = "text-yellow-400", bg = "bg-yellow-400/10", glow = "shadow-[0_0_20px_rgba(250,204,21,0.2)]";
    if (profitPct > 10) signal = "BUY", color = "text-emerald-400", bg = "bg-emerald-400/10", glow = "shadow-[0_0_20px_rgba(52,211,153,0.2)]";
    if (profitPct < -10) signal = "SELL", color = "text-rose-400", bg = "bg-rose-400/10", glow = "shadow-[0_0_20px_rgba(244,63,94,0.2)]";
    
    return { P, currentPrice, profitPct, signal, color, bg, glow, confidence, g, R_pct };
  }, [analysisData, committedRf, committedRm]);

  const chartPaths = useMemo(() => {
    const data = analysisData?.priceHistory;
    if (!data || data.length < 2) return { line: "", yLabels: [] };
    const prices = data.map(d => d.price);
    const minP = Math.min(...prices), maxP = Math.max(...prices), rangeP = (maxP - minP) || 1;
    const width = 1000;
    const height = 300;
    const pointsData = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.price - minP) / rangeP) * (height - 60) - 30;
      return { x, y, price: d.price, time: d.time };
    });

    const yLabels = [0, 0.5, 1].map(pct => (minP + pct * rangeP).toFixed(1));
    return { line: `M ${pointsData.map(p => `${p.x},${p.y}`).join(' L ')}`, yLabels, pointsData };
  }, [analysisData]);

  const equityCurvePaths = useMemo(() => {
    const data = backtestData?.equityCurve;
    if (!data || data.length < 2) return null;
    const W = 1000, H = 300, pad = 30;
    const allVals = data.flatMap(d => [d.portfolioValue, d.benchmarkValue]);
    const mn = Math.min(...allVals), mx = Math.max(...allVals), rng = (mx - mn) || 1;
    const pt = (arr, key) => arr.map((d, i) => {
      const x = (i / (arr.length - 1)) * W;
      const y = H - ((d[key] - mn) / rng) * (H - pad * 2) - pad;
      return `${x},${y}`;
    }).join(' L ');
    const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => '$' + (mn + p * rng).toFixed(0));
    return { portfolio: `M ${pt(data, 'portfolioValue')}`, benchmark: `M ${pt(data, 'benchmarkValue')}`, yLabels };
  }, [backtestData]);

  const handleMouseMove = (e) => {
    if (!chartPaths.pointsData || chartPaths.pointsData.length === 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    
    // Find closest point
    const closest = chartPaths.pointsData.reduce((prev, curr) => 
      Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
    );
    setHoverPoint(closest);
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-gray-200 p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* HEADER */}
        <header className="flex justify-between items-center mb-2">
          <span className="text-2xl font-black tracking-tighter text-white">STOCK<span className="text-sky-400">ANALYZER</span></span>
          <div className="flex items-center gap-4">
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase transition-all ${analysisData?.isMock ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' : 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${analysisData?.isMock ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`}></span>
                {analysisData?.dataSource || 'Connecting...'}
             </div>
             {analysisData?.marketTime && (
               <span className="text-[9px] font-bold text-gray-500 uppercase">Quote Time: {new Date(analysisData.marketTime).toLocaleString()}</span>
             )}
          </div>
        </header>

        {/* PAGE TITLE */}
        <div className="flex flex-col gap-1 animate-fade px-2">
           <h1 className="text-3xl font-black text-white tracking-tight uppercase">Dividend Discount Model <span className="text-sky-400">Valuation</span></h1>
           <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Intrinsic Equity Analysis Terminal</p>
        </div>

        {/* INPUTS BAR */}
        <section className="glass-card p-4 grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
           <div className="flex flex-col gap-2">
             <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Asset</label>
             <select value={selectedTicker} onChange={e => setSelectedTicker(e.target.value)} className="bg-transparent border border-white/10 rounded-lg p-2 text-sm outline-none focus:border-sky-500">
               {TOP_STOCKS.map(t => <option key={t} value={t}>{t}</option>)}
             </select>
           </div>
           <div className="flex flex-col gap-2">
             <div className="flex justify-between items-center">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Risk-Free Rate</label>
                <span className="text-[10px] font-black text-sky-400">{rf}%</span>
             </div>
             <input 
              type="range" min="0" max="10" step="0.1" 
              value={rf} onChange={e => setRf(parseFloat(e.target.value))} 
              className="w-full accent-sky-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
             />
           </div>
           <div className="flex flex-col gap-2">
             <div className="flex justify-between items-center">
                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Market Return</label>
                <span className="text-[10px] font-black text-sky-400">{rm}%</span>
             </div>
             <input 
              type="range" min="5" max="20" step="0.1" 
              value={rm} onChange={e => setRm(parseFloat(e.target.value))} 
              className="w-full accent-sky-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
             />
           </div>
           <div className="flex flex-col gap-2">
             <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Investment</label>
             <input type="number" value={investment} onChange={e => setInvestment(e.target.value)} className="bg-transparent border border-white/10 rounded-lg p-2 text-sm" />
           </div>
            <div className="flex gap-2">
              <button onClick={() => fetchAnalysis(selectedTicker, activeRange)} disabled={loading}
                className="bg-sky-500 hover:bg-sky-400 text-black font-black h-[38px] px-4 rounded-lg transition-all active:scale-95 shadow-[0_0_20px_rgba(56,189,248,0.2)] disabled:opacity-50">
                {loading ? 'SCANNING...' : 'ANALYZE'}
              </button>
              <button onClick={fetchBacktest} disabled={backtestLoading}
                className="bg-transparent border border-violet-500/50 text-violet-400 hover:bg-violet-500/10 font-black h-[38px] px-4 rounded-lg transition-all active:scale-95 disabled:opacity-50">
                {backtestLoading ? 'TESTING...' : 'BACKTEST'}
              </button>
            </div>
         </section>

         {/* TAB BAR */}
         <div className="tab-bar">
            <button className={`tab-btn ${activeTab==='analysis'?'active':''}`} onClick={()=>setActiveTab('analysis')}>Analysis</button>
            <button className={`tab-btn ${activeTab==='ai'?'active':''}`} onClick={()=>{
              setActiveTab('ai');
              if (!aiData && !aiLoading) fetchAI(selectedTicker, rf, rm);
            }}>AI Recommendation</button>
            <button className={`tab-btn ${activeTab==='backtest'?'active':''}`} onClick={()=>{
              setActiveTab('backtest');
              if (!backtestData && !backtestLoading) fetchBacktest();
            }}>Backtest</button>
         </div>

        {activeTab === 'analysis' && (<>
        {/* HERO ANALYSIS CARD */}
        <div className="glass-card p-8 bg-gradient-to-br from-sky-500/10 to-transparent border-sky-500/20 flex justify-between items-center relative overflow-hidden group">
           {loading && (
             <div className="absolute inset-0 bg-[#0B0F1A]/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-black text-sky-400 tracking-[0.2em] uppercase">Calculating Intrinsic Value...</span>
             </div>
           )}
           <div className="flex flex-col gap-2">
              <h2 className="text-4xl font-black text-white tracking-tighter">{analysisData?.name || '---'} <span className="text-sky-400 text-2xl ml-2">{analysisData?.ticker}</span></h2>
              <div className="flex items-center gap-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
                 <span>Current: <span className="text-white font-black">${model?.currentPrice.toFixed(2)}</span></span>
                 <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                 <span>Intrinsic: <span className="text-sky-400 font-black">${model?.P.toFixed(2)}</span></span>
                 {!analysisData?.isMock && (
                   <a 
                    href={`https://www.google.com/search?q=${analysisData?.ticker}+stock+price`} 
                    target="_blank" 
                    className="ml-4 text-[9px] text-sky-500 underline hover:text-sky-400"
                   >
                     Verify on Google Finance ↗
                   </a>
                 )}
              </div>
           </div>
           <div className="flex items-center gap-12">
              <div className="text-right">
                 <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Confidence Level</div>
                 <div className="text-4xl font-black text-white">
                    {loading ? '---' : model?.confidence}%
                 </div>
                 <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-1000" style={{ width: loading ? '0%' : `${model?.confidence}%` }}></div>
                 </div>
              </div>
              <button className={`px-10 py-4 rounded-xl text-xl font-black transition-all ${model?.bg} ${model?.color} border border-current ${model?.glow}`}>
                 {model?.signal}
              </button>
           </div>
        </div>

        {/* ANGEL ONE CHART */}
        <section className="glass-card p-0 overflow-hidden flex flex-col min-h-[480px]">
           <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <div className="flex gap-6 text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                 <span>O <span className="text-white ml-1">{analysisData?.ohlc?.open}</span></span>
                 <span>H <span className="text-white ml-1">{analysisData?.ohlc?.high}</span></span>
                 <span>L <span className="text-white ml-1">{analysisData?.ohlc?.low}</span></span>
                 <span>VOL <span className="text-white ml-1">{(analysisData?.ohlc?.vol / 1000000).toFixed(2)}M</span></span>
              </div>
              <div className="flex bg-dark p-1 rounded-lg border border-white/5 gap-1">
                 {RANGES.map(r => (
                   <button key={r} onClick={() => setActiveRange(r)} className={`px-3 py-1 rounded border text-[9px] font-black transition-all ${activeRange === r ? 'border-sky-500 text-sky-400 bg-sky-500/5' : 'border-white/5 text-gray-500'}`}>
                     {r}
                   </button>
                 ))}
              </div>
           </div>
           <div className="flex-1 relative flex p-6">
              <div className="flex-1 relative">
                 <svg 
                    viewBox="0 0 1000 300" 
                    className="w-full h-full overflow-visible cursor-crosshair"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverPoint(null)}
                  >
                    {[0, 0.5, 1].map(i => <line key={i} x1="0" y1={300 - i * 240 - 30} x2="1000" y2={300 - i * 240 - 30} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />)}
                    <path d={chartPaths.line} fill="none" stroke="#43b9b9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-fade" />
                    {hoverPoint && (
                      <g>
                         {/* Vertical Tracking Line */}
                         <line x1={hoverPoint.x} y1="0" x2={hoverPoint.x} y2="300" stroke="rgba(255,255,255,0.15)" strokeDasharray="4" />
                         
                         {/* Horizontal Price Tracking Line */}
                         <line x1="0" y1={hoverPoint.y} x2="1000" y2={hoverPoint.y} stroke="rgba(255,255,255,0.15)" strokeDasharray="4" />

                         {/* Y-Axis Price Label (on the right) */}
                         <g transform={`translate(1005, ${hoverPoint.y - 10})`}>
                            <rect width="55" height="20" rx="3" fill="#43b9b9" />
                            <text x="5" y="14" fill="#0B0F1A" fontSize="10" fontWeight="black">{hoverPoint.price.toFixed(1)}</text>
                         </g>

                         {/* Floating Tooltip Card */}
                         <g transform={`translate(${hoverPoint.x > 800 ? hoverPoint.x - 130 : hoverPoint.x + 10}, ${hoverPoint.y - 60})`}>
                            <rect width="120" height="45" rx="6" fill="#111827" stroke="rgba(255,255,255,0.1)" />
                            <text x="10" y="18" fill="#9ca3af" fontSize="9" fontWeight="bold" className="uppercase tracking-widest">{hoverPoint.time}</text>
                            <text x="10" y="35" fill="white" fontSize="12" fontWeight="black">PRICE : ${hoverPoint.price.toFixed(2)}</text>
                         </g>

                         <circle cx={hoverPoint.x} cy={hoverPoint.y} r="5" fill="#43b9b9" stroke="#0B0F1A" strokeWidth="2" />
                      </g>
                    )}
                 </svg>
              </div>
              <div className="w-12 flex flex-col justify-between py-6 text-[9px] font-bold text-gray-600 text-right">
                 {chartPaths.yLabels?.reverse().map((l, i) => <span key={i}>{l}</span>)}
              </div>
           </div>
           <div className="p-4 border-t border-white/5 flex justify-between px-10 text-[9px] font-bold text-gray-600 uppercase">
              {analysisData?.priceHistory?.filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 5)) === 0).map((d, i) => <span key={i}>{d.time}</span>)}
           </div>
        </section>

        {/* SUB-INFO SECTION */}
        <div className="grid grid-cols-12 gap-8 mb-12">
           {/* YEARLY DIVIDEND HISTORY (Verification) */}
           <div className="col-span-12 lg:col-span-4 glass-card p-6 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Yearly Payouts</h3>
                 <span className="text-[9px] font-bold text-sky-500 uppercase">Last 5 Years</span>
              </div>
              <div className="flex flex-col gap-1">
                 {analysisData?.dividendHistory?.length > 0 ? (
                   [...analysisData.dividendHistory].reverse().map((d, i) => (
                     <div key={i} className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors px-2 -mx-2 rounded">
                        <div className="flex flex-col">
                           <span className="text-[11px] font-bold text-gray-500">YEAR {d.year}</span>
                           {d.isProjected && <span className="text-[8px] font-black text-sky-500 uppercase tracking-tighter">Annualized Rate</span>}
                        </div>
                        <span className="text-[11px] font-black text-emerald-400">TOTAL: ${d.amount.toFixed(2)}</span>
                     </div>
                   ))
                 ) : (
                   <div className="text-[10px] text-gray-600 italic py-4">No historical data available.</div>
                 )}
              </div>
           </div>

           {/* VALUATION REASONING */}
           <div className="col-span-12 lg:col-span-4 glass-card p-6 flex flex-col gap-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Valuation Reasoning</h3>
              <div className="flex flex-col gap-4 text-xs text-gray-400">
                 <div className="flex justify-between">
                    <span>Dividend Growth (g)</span>
                    <span className="text-white font-black">{model?.g.toFixed(2)}%</span>
                 </div>
                 <div className="flex justify-between">
                    <span>Required Return (R)</span>
                    <span className="text-white font-black">{model?.R_pct.toFixed(2)}%</span>
                 </div>
              </div>
           </div>

           {/* COMPANY PROFILE */}
             <div className="col-span-12 lg:col-span-4 glass-card p-6 flex flex-col gap-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Company Profile</h3>
              <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-4">{analysisData?.description}</p>
           </div>
         </div>
         </>)}
         {/* AI TAB */}
         {activeTab === 'ai' && (
           <div className="flex flex-col gap-6 animate-slide-up">
             {aiLoading && (
               <div className="glass-card p-12 flex flex-col items-center gap-3">
                 <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-[10px] font-black text-sky-400 tracking-[0.2em] uppercase">Synthesizing AI Recommendation...</span>
               </div>
             )}
             
             {aiError && !aiData && (
               <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
                 <span className="text-rose-500 text-3xl">⚠️</span>
                 <span className="text-sm font-black text-rose-400 uppercase tracking-widest">{aiError}</span>
                 <button onClick={() => fetchAI(selectedTicker, rf, rm)} className="mt-2 bg-sky-500 hover:bg-sky-400 text-black font-black text-[10px] py-2 px-4 rounded-lg transition-all">RETRY ANALYSIS</button>
               </div>
             )}
             
             {aiData && !aiLoading && (
               <>
                 {/* HERO RECOMMENDATION GRID */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   
                   {/* SCORE CARD */}
                   <div className="glass-card p-6 flex flex-col md:flex-row items-center gap-6 bg-gradient-to-br from-sky-500/5 to-transparent border-sky-500/10">
                     <div className="relative w-32 h-32 flex items-center justify-center">
                       {/* SVG Circular Progress */}
                       <svg className="w-full h-full transform -rotate-90">
                         <circle cx="64" cy="64" r="54" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="8" fill="transparent" />
                         <circle cx="64" cy="64" r="54" stroke="#38bdf8" strokeWidth="8" fill="transparent"
                           strokeDasharray={2 * Math.PI * 54}
                           strokeDashoffset={2 * Math.PI * 54 * (1 - aiData.aiScore / 100)}
                           strokeLinecap="round"
                           className="transition-all duration-1000 ease-out"
                         />
                       </svg>
                       <div className="absolute flex flex-col items-center justify-center">
                         <span className="text-3xl font-black text-white">{aiData.aiScore}</span>
                         <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Score</span>
                       </div>
                     </div>
                     
                     <div className="flex-1 flex flex-col gap-2 text-center md:text-left">
                       <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">AI Overall Verdict</span>
                       <div>
                         <span className={`inline-block px-4 py-1.5 rounded-lg border text-sm font-black tracking-widest uppercase shadow-sm ${aiData.actionColor}`}>
                           {aiData.action}
                         </span>
                       </div>
                       <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                         Calculated rating combining the DDM valuation margin of safety (45%), dividend growth consistency (20%), yield strength (20%), and defensive beta profile (15%).
                       </p>
                     </div>
                   </div>

                   {/* DSI CARD */}
                   <div className="glass-card p-6 flex flex-col justify-between bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-500/10">
                     <div className="flex justify-between items-start">
                       <div className="flex flex-col gap-1">
                         <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">Dividend Safety Index (DSI)</span>
                         <span className="text-3xl font-black text-white">{aiData.dsi}<span className="text-xs text-gray-500">/100</span></span>
                       </div>
                       <div className="flex flex-col items-end gap-1">
                         <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Cut Risk</span>
                         <span className={`text-xs font-black uppercase tracking-wider ${aiData.cutRiskColor}`}>{aiData.cutRisk} Risk</span>
                       </div>
                     </div>
                     
                     <div className="mt-4">
                       <div className="flex justify-between text-[8px] font-bold text-gray-500 mb-1 uppercase tracking-widest">
                         <span>High Risk</span>
                         <span>Safe / Sustainable</span>
                       </div>
                       <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                         <div className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 transition-all duration-1000" style={{ width: `${aiData.dsi}%` }}></div>
                       </div>
                     </div>

                     <p className="text-[10px] text-gray-500 leading-relaxed mt-3">
                       Scored using volatility and payout growth ratios. A DSI above 75 suggests low dividend reduction probability over the next 12-24 months.
                     </p>
                   </div>
                 </div>

                 {/* INSIGHTS SECTION */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {aiData.insights.map((insight, idx) => {
                     const icons = { valuation: '💰', growth: '📈', risk: '🛡️' };
                     const impactColors = {
                       positive: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
                       neutral: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
                       negative: 'text-rose-400 border-rose-500/20 bg-rose-500/5'
                     };
                     return (
                       <div key={idx} className="glass-card p-5 flex flex-col gap-3">
                         <div className="flex justify-between items-center">
                           <span className="text-xl">{icons[insight.type] || '⚡'}</span>
                           <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${impactColors[insight.impact]}`}>
                             {insight.impact}
                           </span>
                         </div>
                         <div className="flex flex-col gap-1">
                           <h4 className="text-xs font-black text-white uppercase tracking-wider">{insight.title}</h4>
                           <p className="text-[11px] text-gray-400 leading-relaxed">{insight.text}</p>
                         </div>
                       </div>
                     );
                   })}
                 </div>

                 {/* PEER RANKING TABLE */}
                 <section className="glass-card p-0 overflow-hidden">
                   <div className="p-6 border-b border-white/5 flex flex-col gap-1">
                     <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Sector Peer Group Comparison</h3>
                     <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Multi-factor valuation and profile alignment vs logical competitors</span>
                   </div>
                   <div className="overflow-x-auto">
                     <table className="backtest-table">
                       <thead>
                         <tr>
                           <th>Ticker</th>
                           <th>Name</th>
                           <th>Price</th>
                           <th>Div Yield</th>
                           <th>Growth Rate</th>
                           <th>Beta</th>
                           <th>AI Recommendation Score</th>
                         </tr>
                       </thead>
                       <tbody>
                         {/* Target Stock Row */}
                         <tr className="bg-sky-500/5 border-l-2 border-sky-500">
                           <td className="text-sky-400 font-black">{selectedTicker}</td>
                           <td className="text-white font-black">{aiData.name}</td>
                           <td>${analysisData?.currentPrice?.toFixed(2) || '---'}</td>
                           <td className="text-emerald-400 font-black">{(analysisData?.dividendHistory?.length > 0 ? (analysisData.dividendHistory[analysisData.dividendHistory.length - 1].amount / analysisData.currentPrice * 100) : 0).toFixed(2)}%</td>
                           <td>{model?.g?.toFixed(2)}%</td>
                           <td>{analysisData?.beta?.toFixed(2)}</td>
                           <td>
                             <div className="flex items-center gap-2">
                               <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                 <div className="h-full bg-sky-500" style={{ width: `${aiData.aiScore}%` }}></div>
                               </div>
                               <span className="text-sky-400 font-black">{aiData.aiScore}</span>
                             </div>
                           </td>
                         </tr>
                         
                         {/* Peer Stocks Rows */}
                         {aiData.peers.map((peer, i) => (
                           <tr key={i} className="hover:bg-white/[0.01]">
                             <td className="text-gray-400 font-bold">{peer.ticker}</td>
                             <td>{peer.name}</td>
                             <td>${peer.price.toFixed(2)}</td>
                             <td className="text-emerald-500/80">{peer.yield.toFixed(2)}%</td>
                             <td>{peer.growth.toFixed(2)}%</td>
                             <td>{peer.beta.toFixed(2)}</td>
                             <td>
                               <div className="flex items-center gap-2">
                                 <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                   <div className="h-full bg-primary/60" style={{ width: `${peer.aiScore}%` }}></div>
                                 </div>
                                 <span className="text-gray-400 font-bold">{peer.aiScore}</span>
                               </div>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 </section>
               </>
             )}
           </div>
         )}
 
         {/* BACKTEST TAB */}
         {activeTab === 'backtest' && (
            <div className="flex flex-col gap-6 animate-slide-up">
              {backtestLoading && (
                <div className="glass-card p-12 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-black text-violet-400 tracking-[0.2em] uppercase">Running Historical Backtest...</span>
                </div>
              )}
            {backtestData && !backtestLoading && (<>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {l:'Strategy Return',v:`${backtestData.metrics.totalReturn>=0?'+':''}${backtestData.metrics.totalReturn}%`,s:`vs Benchmark: ${backtestData.metrics.benchmarkReturn}%`,c:backtestData.metrics.totalReturn>=0?'#34d399':'#f87171'},
                  {l:'Win Rate',v:`${backtestData.metrics.winRate}%`,s:`${backtestData.metrics.totalTrades} trades`,c:'#fff'},
                  {l:'Max Drawdown',v:`-${backtestData.metrics.maxDrawdown}%`,s:'Peak to trough',c:'#f87171'},
                  {l:'Sharpe Ratio',v:backtestData.metrics.sharpeRatio,s:'Risk-adjusted',c:'#fff'}
                ].map((k,i)=>(
                  <div key={i} className="kpi-card">
                    <span className="kpi-label">{k.l}</span>
                    <span className="kpi-value animate-count" style={{color:k.c}}>{k.v}</span>
                    <span className="kpi-sub">{k.s}</span>
                  </div>
                ))}
              </div>
              <section className="glass-card p-0 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Equity Curve</h3>
                  <div className="flex gap-6 text-[9px] font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-2"><span className="legend-dot" style={{background:'#8b5cf6'}}></span><span style={{color:'#a78bfa'}}>DDM Strategy</span></span>
                    <span className="flex items-center gap-2"><span className="legend-dot" style={{background:'#6b7280'}}></span><span style={{color:'#6b7280'}}>Buy &amp; Hold</span></span>
                  </div>
                </div>
                <div className="p-6">{equityCurvePaths && (
                  <svg viewBox="0 0 1000 300" className="w-full" style={{height:'300px'}}>
                    {[0,0.25,0.5,0.75,1].map(i=><line key={i} x1="0" y1={300-i*240-30} x2="1000" y2={300-i*240-30} stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>)}
                    <path d={equityCurvePaths.benchmark} fill="none" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="6"/>
                    <path d={equityCurvePaths.portfolio} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                )}</div>
                <div className="p-4 border-t border-white/5 flex justify-between px-10 text-[9px] font-bold text-gray-600">
                  {backtestData.equityCurve.filter((_,i,a)=>i%Math.max(1,Math.floor(a.length/6))===0).map((d,i)=><span key={i}>{d.date.slice(0,7)}</span>)}
                </div>
              </section>
              <section className="glass-card p-0 overflow-hidden">
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Trade History</h3>
                </div>
                <div style={{maxHeight:'300px',overflowY:'auto'}}>
                  <table className="backtest-table">
                    <thead><tr><th>Date</th><th>Signal</th><th>Price</th><th>Intrinsic</th><th>Shares</th><th>Portfolio</th></tr></thead>
                    <tbody>{backtestData.trades.map((t,i)=>(
                      <tr key={i}>
                        <td>{t.date}</td>
                        <td><span className={t.signal.includes('BUY')?'signal-buy':t.signal.includes('SELL')?'signal-sell':'signal-hold'}>{t.signal}</span></td>
                        <td>${t.price}</td>
                        <td>${t.intrinsicValue}</td>
                        <td>{t.shares}</td>
                        <td style={{color:'white',fontWeight:900}}>${t.portfolioValue.toLocaleString()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <div className="glass-card p-6 flex justify-between items-center" style={{background:'linear-gradient(135deg,rgba(139,92,246,0.1),transparent)',borderColor:'rgba(139,92,246,0.2)'}}>
                <div>
                  <span className="kpi-label">Final Portfolio</span>
                  <div className="text-3xl font-black text-white">${backtestData.metrics.finalValue.toLocaleString()}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <span className="kpi-label">Benchmark Final</span>
                  <div className="text-3xl font-black text-gray-500">${backtestData.metrics.benchmarkFinalValue.toLocaleString()}</div>
                </div>
              </div>
            </>)}
            {!backtestData && !backtestLoading && (
              <div className="glass-card p-12 flex flex-col items-center gap-3" style={{textAlign:'center'}}>
                <span style={{fontSize:'40px'}}>📊</span>
                <span className="text-sm font-black text-gray-400">Click BACKTEST to simulate DDM signals on historical data</span>
                <span className="text-[10px] text-gray-600">Uses 5 years of data with quarterly signal generation</span>
              </div>
            )}
          </div>
        )}

       </div>

       <style>{`
         .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 1.5rem; }
         @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
         .animate-fade { animation: fadeIn 0.8s ease-out forwards; }
       `}</style>
     </div>
  );
}

export default App;
