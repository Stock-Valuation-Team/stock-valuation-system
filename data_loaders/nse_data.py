from nsetools import Nse
from databases.db_get_data import get_table_cols
from databases.update_table_data import save_data, clear_table_data
from databases.db_utils import prepare_insert_stmt
from services.universe_service import get_universe_data


def refresh_nifty50_constituents_data():
    table_name = 'nifty50_constituents'
    index_name = "NIFTY 50"
    print('Deleting data from table: ', table_name)
    clear_table_data(table_name)
    print('Loading data in table: ', table_name)
    count = load_nifty50_data(table_name, index_name)
    print('Loaded: ', count, ' records in table: ', table_name)


def load_nifty50_data(table_name, index_name):
    nse = Nse()
    # Get live quotes for all Nifty 50 stocks
    nifty50_quotes = nse.get_stock_quote_in_index(index=index_name)
    nifty50_cols = get_table_cols('nifty50_constituents')
    insert_stmt = prepare_insert_stmt(table_name, nifty50_cols)

    insert_data = []
    for quote in nifty50_quotes:
        print(quote)
        data_row = []
        for col in nifty50_cols:
            data_row.append(quote[col])
        insert_data.append(tuple(data_row))
    save_data(insert_stmt, insert_data)
    return len(insert_data)


def get_live_quotes():
    nse = Nse()
    universe_data = get_universe_data('combined')
    stocks = []
    for row in universe_data:
        stocks.append(row['symbol'])
    quotes = []
    for stock in stocks:
       print(stock)
       quote = nse.get_quote(stock)
       quotes.append(quote)
    print()

if __name__ == "__main__":
    refresh_nifty50_constituents_data()


