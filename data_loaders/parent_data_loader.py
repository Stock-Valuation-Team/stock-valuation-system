from data_loaders.universe_loader import universe_data_loader_from_file
from data_loaders.yfinance_data import load_live_quotes_from_yfinance
from data_loaders.nse_data import  refresh_index_constituents_data
from data_loaders.news_loader import refresh_stock_news


def refresh_all_data():
    load_universe_data_from_file()
    load_live_quotes_yfinance()
    load_hist_quotes_yfinance()
    load_index_constituents()
    load_index_constituents()
    load_holdings_from_file()

def load_universe_data_from_file():
    #Load all unverse information data
    universe_data_loader_from_file('custom', 'custom_universe.csv', 'universe_custom')
    universe_data_loader_from_file('nifty 100', 'nifty100_universe.csv', 'universe_nifty100')
    universe_data_loader_from_file('nifty 50', 'nifty50_universe.csv', 'universe_nifty50')

def load_live_quotes_yfinance():
    #Load live prices
    load_live_quotes_from_yfinance('Nifty 50', '1d', 'live_prices_yf_nifty50')
    load_live_quotes_from_yfinance('Nifty 100', '1d', 'live_prices_yf_nifty100')
    load_live_quotes_from_yfinance('custom', '1d', 'live_prices_yf_custom')

def load_hist_quotes_yfinance():
    #Load historical prices
    load_live_quotes_from_yfinance('Nifty 50', '1y', 'hist_prices_yf_nifty50')
    load_live_quotes_from_yfinance('Nifty 100', '1y', 'hist_prices_yf_nifty100')
    load_live_quotes_from_yfinance('custom', '1y', 'hist_prices_yf_custom')

def load_index_constituents():
    refresh_index_constituents_data("NIFTY 100", 'nifty100_constituents')
    refresh_index_constituents_data("NIFTY 50", 'nifty50_constituents')

def load_index_constituents():
    refresh_stock_news()

def load_holdings_from_file():
    universe_data_loader_from_file('holdings', 'holdings.csv', 'holdings')



if __name__ == '__main__':
    refresh_all_data()