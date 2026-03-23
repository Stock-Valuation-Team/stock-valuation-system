from data_loaders.universe_loader import load_universe_data
from data_loaders.yfinance_data import load_live_quotes_from_yfinance
from data_loaders.nse_data import  refresh_nifty100_constituents_data
from data_loaders.news_loader import refresh_stock_news


# delete from universe_custom;
# delete from universe_nifty100;
# delete from nifty100_constituents;
# delete from hist_prices_yfinance;
# delete from live_prices_yfinance;
# delete from nifty100_constituents;
#
#
# select * from hist_prices_yfinance;
# select * from live_prices_yfinance;
# select * from nifty100_constituents;
# select * from live_prices_yfinance;
# select * from nifty100_constituents;
# select * from universe_custom;
# select * from universe_nifty100;

def refresh_all_data():
    #Load all data
    load_universe_data('nifty100', 'custom_universe.csv', 'universe_custom')
    load_universe_data('custom', 'nifty100_universe.csv', 'universe_nifty100')
    load_live_quotes_from_yfinance('1d', 'live_prices_yfinance')
    load_live_quotes_from_yfinance('1y', 'hist_prices_yfinance')
    refresh_nifty100_constituents_data()
    refresh_stock_news()


if __name__ == '__main__':
    refresh_all_data()