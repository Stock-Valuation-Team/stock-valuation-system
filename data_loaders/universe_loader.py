from utils.file_utils import get_data_from_csv
from databases.db_get_data import get_table_cols
from databases.update_table_data import save_data, clear_table_data
from databases.db_utils import prepare_insert_stmt


def load_universe_data(universe_name, filename, table_name):
    print('loading data for universe: ', universe_name)
    table_cols = get_table_cols(table_name)
    print('Deleting data from table: ', table_name)
    clear_table_data(table_name)
    print('Loading data in table: ', table_name)
    insert_stmt = prepare_insert_stmt(table_name, table_cols)
    insert_data = prepare_universe_data(filename);
    save_data(insert_stmt, insert_data)
    print('loaded data in table: ', table_name, ' count: ', len(insert_data))


def prepare_universe_data(filename):
    data_from_file = get_data_from_csv(filename)
    insert_data = []
    for row in data_from_file:
        result_tuple = tuple(row)
        insert_data.append(result_tuple)
    return insert_data


if __name__ == '__main__':
    load_universe_data('nifty100', 'custom_universe.csv', 'universe_custom');
    load_universe_data('custom', 'nifty100_universe.csv', 'universe_nifty100');
