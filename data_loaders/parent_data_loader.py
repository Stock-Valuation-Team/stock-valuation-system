from data_loaders.universe_loader import load_universe_data
from data_loaders.yfinance_data import load_live_quotes_from_yfinance
from data_loaders.nse_data import  refresh_nifty50_constituents_data


# delete from universe_custom;
# delete from universe_nifty50;
# delete from nifty50_constituents;
# delete from hist_prices_yfinance;
# delete from live_prices_yfinance;
# delete from nifty50_constituents;
#
#
# select * from hist_prices_yfinance;
# select * from live_prices_yfinance;
# select * from nifty50_constituents;
# select * from live_prices_yfinance;
# select * from nifty50_constituents;
# select * from universe_custom;
# select * from universe_nifty50;

def refresh_all_data():
    #Load all data
    load_universe_data('nifty50', 'custom_universe.csv', 'universe_custom')
    load_universe_data('custom', 'nifty50_universe.csv', 'universe_nifty50')
    load_live_quotes_from_yfinance('1d', 'live_prices_yfinance')
    load_live_quotes_from_yfinance('1y', 'hist_prices_yfinance')
    refresh_nifty50_constituents_data()


if __name__ == '__main__':
    refresh_all_data()