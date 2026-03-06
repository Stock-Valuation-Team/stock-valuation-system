import yfinance as yf

# Fetch Nifty 50 index data
nifty50 = yf.Ticker("^NSEI")

# Get historical data (e.g., last 1 month)
hist = nifty50.history(period="1mo")
print(hist)

# Get current ticker information
info = nifty50.info
print(info)