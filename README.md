# 📈 Dividend Analytics Platform & AI Valuation Terminal

A modern, full-stack financial analytics platform for **Dividend Discount Model (DDM)** intrinsic valuation, dividend safety scoring, multi-year backtesting, and AI-powered stock insights using Groq Llama 3.

---

## ✨ Features

- 🏛️ **DDM Valuation Engine**: Calculates intrinsic stock value using Dividend Discount Models (Gordon Growth) and required rate of return (CAPM).
- 🤖 **AI Stock Analyst (Groq / Llama 3.3)**: Real-time conversational AI answering queries about dividend sustainability, risk-adjusted returns, and company profiles.
- 🛡️ **Dividend Safety Index (DSI)**: Quantitative dividend cut risk analyzer (Low / Medium / High).
- 📊 **Interactive SVG Price Charts**: Clean OHLC & high-precision price charting with hover inspect tooltips.
- 🔁 **Historical Backtesting Engine**: Simulates quarterly DDM trading signals vs buy-and-hold benchmarks with Sharpe ratio, maximum drawdown, and win rates.
- 👥 **Sector Peer Group Benchmarks**: Multi-factor valuation comparison against industry peers.

---

## 🏗️ Project Architecture

The project is structured with clean separation between frontend and backend:

```text
dividend-analytics-platform/
├── backend/
│   ├── routes/
│   │   ├── ai.js           # Groq AI analyst & recommendation endpoints
│   │   ├── backtest.js     # Historical simulation engine
│   │   ├── ddm.js          # DDM calculation & Yahoo Finance live data
│   │   └── dividend.js     # Dividend history endpoints
│   ├── db.js               # Database connection pool (with safe fallbacks)
│   ├── server.js           # Express API server
│   ├── vercel.json         # Vercel serverless deployment config
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main UI application terminal
    │   ├── config.js       # Dynamic API URL configuration
    │   ├── index.css       # Tailwind & custom CSS glassmorphism styles
    │   └── main.jsx        # React root
    ├── vite.config.js      # Vite dev proxy configuration
    ├── vercel.json         # Vercel SPA routing rewrites
    ├── package.json
    └── .env.example
```

---

## 🚀 Local Development Setup

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Add your GROQ_API_KEY inside backend/.env
npm start
```
*Backend runs on `http://localhost:5000`.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 🌐 Deploying Live to Vercel

### Step 1: Deploy Backend to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New... -> Project**.
2. Select your repository `dividend-analytics-platform`.
3. Set **Root Directory** to `backend`.
4. Under **Environment Variables**, add:
   - `GROQ_API_KEY`: *(Your Groq API key from console.groq.com)*
5. Click **Deploy**.
6. Copy your deployed backend URL (e.g., `https://dividend-backend.vercel.app`).

### Step 2: Deploy Frontend to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New... -> Project**.
2. Select the same repository `dividend-analytics-platform`.
3. Set **Root Directory** to `frontend`.
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: *(Paste your deployed backend URL from Step 1, e.g. `https://dividend-backend.vercel.app`)*
5. Click **Deploy**.

🎉 Your fullstack app is now live with zero errors!

---

## 🔑 Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GROQ_API_KEY` | Backend | Groq API Key for Llama 3 AI Analyst |
| `VITE_API_URL` | Frontend | Live backend URL for production API requests |
| `PORT` | Backend | Port number (default: 5000) |

---

## 📄 License
MIT License
