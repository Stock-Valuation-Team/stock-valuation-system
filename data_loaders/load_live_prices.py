from data_loaders.yfinance_data import load_live_quotes_from_yfinance


def refresh_all_data():
    load_live_quotes_yfinance()


def load_live_quotes_yfinance():
    # Load live prices
    load_live_quotes_from_yfinance('Nifty 50', '1d', 'live_prices_yf_nifty50')
    load_live_quotes_from_yfinance('Nifty 100', '1d', 'live_prices_yf_nifty100')
    load_live_quotes_from_yfinance('custom', '1d', 'live_prices_yf_custom')


if __name__ == '__main__':
    refresh_all_data()
