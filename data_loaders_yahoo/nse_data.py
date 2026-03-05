from nsetools import Nse
from databases.db_get_data import get_nifty50_table_cols
from databases.update_table_data import save_data, clear_table_data


def refresh_nifty50_data():
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
    nifty50_cols = get_nifty50_table_cols()
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


def prepare_insert_stmt(table_name, table_col_names):
    cols_to_insert = []
    for col in table_col_names:
        if any(c.isupper() for c in col):
            cols_to_insert.append('"' + col + '"')
        else:
            cols_to_insert.append(col)
    cols_str = ", ".join(cols_to_insert)

    ins_val = '%s'
    for col in table_col_names[1:]:
        ins_val = ins_val + ',%s'
    insert_stmt = 'INSERT INTO ' + table_name + ' (' + cols_str + ') VALUES (' + ins_val + ')'
    return insert_stmt


if __name__ == "__main__":
    refresh_nifty50_data()


