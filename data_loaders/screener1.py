from nsetools import Nse
nse = Nse()
stocks = ['M&M']
data = [nse.get_quote(stock) for stock in stocks]

print()