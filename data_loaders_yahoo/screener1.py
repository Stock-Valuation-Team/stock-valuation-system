import matplotlib.pyplot as plt
import yfinance as yf
#from yahoo_fin import stock_info
# Import the Required modules
import yfinance as yf

# Inputting the name of the Stock and Storing it in a Variable
STK = "INE040A01034"

# Extract the Share information using the Ticker() Function
Share = yf.Ticker(STK).info

# Extracting the MarketPrice from the data
market_price = Share['regularMarketPrice' ]

# Printing the market price
print(market_price)