import yfinance as yf

# 1. Create a Ticker object
msft = yf.Ticker("MSFT")

# 2. Get stock info (company name, sector, price, etc.)
info = msft.info
print(info['shortName'])

# 3. Get historical market data (e.g., last 1 month)
hist = msft.history(period="1mo")
print(hist)

# 4. Download multiple tickers
data = yf.download("AAPL MSFT GOOG", start="2025-01-01", end="2025-03-01")
print(data)