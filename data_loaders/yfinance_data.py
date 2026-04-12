from services.universe_service import get_universe_data
from databases.update_table_data import save_data, clear_table_data
import yfinance as yf


def load_live_quotes_from_yfinance(universe, period, table_name):
    yfinance_live_quotes = get_live_quotes_from_yfinance(universe, period)
    load_live_quotes_yfinance(yfinance_live_quotes, table_name)


def get_live_quotes_from_yfinance(universe, period):
    universe_data = get_universe_data(universe)
    quotes = []
    for univ_data in universe_data:
        symbol = univ_data['symbol']
        stock = univ_data['stock']
        ticker = univ_data['ticker']
        yf_ticker = symbol + '.NS'  # NSE ticker format for yfinance
        try:
            meta = yf.Ticker(yf_ticker)
            data = meta.history(period=period)
            if data.empty:
                print(f'  No data for {symbol}, skipping...')
                continue
            for row in data.itertuples():
                row_ins = (symbol, stock, ticker, row.Index, row.Open, row.High,
                           row.Low, row.Close, row.Volume, row.Dividends)
                quotes.append(row_ins)
            print(f'  Loaded {len(data)} rows for {symbol}')
        except Exception as e:
            print(f'  Error fetching {symbol}: {e}, skipping...')
    return quotes


def load_live_quotes_yfinance(yfinance_live_quotes, table_name):
    insert_query = 'INSERT INTO ' + table_name +\
                   '(symbol, stock, ticker, price_date, open, high, low, close, volume, dividends)' \
                   ' VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);'
    clear_table_data(table_name)
    print('Loading data in table: ', table_name)

    save_data(insert_query, yfinance_live_quotes)
    print('loaded data in table: ', table_name, ' count: ', len(yfinance_live_quotes))

if __name__ == "__main__":
    dta = load_live_quotes_from_yfinance('1d', 'live_prices_yfinance')
    dta = load_live_quotes_from_yfinance('1y', 'hist_prices_yfinance')
