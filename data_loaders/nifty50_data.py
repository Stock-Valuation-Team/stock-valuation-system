import yfinance as yf

# Fetch Nifty 100 index data
nifty100 = yf.Ticker("^CNX100")

# Get historical data (e.g., last 1 month)
hist = nifty100.history(period="1mo")
print(hist)

# Get current ticker information
info = nifty100.info
print(info)