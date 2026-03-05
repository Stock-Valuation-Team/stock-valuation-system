
import yfinance as yf


#This Code is Contributed by PL VISHNUPPRIYAN


#stock = stock_info.get_live_price("HDB")

meta = yf.Ticker("HDB")
data = meta.history(period="1y")
print(data.to_string())
data['Close'].plot(title="Meta Stock Price (Last 1 Year)")

print()