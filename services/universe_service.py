from databases.db_get_data import get_holdings
from databases.db_get_data import get_universe


def get_universe_data(universe_name):
    if universe_name == 'Nifty 100':
        data_source = "SELECT * FROM universe_nifty100"
    elif universe_name == 'Nifty 50':
        data_source = "SELECT * FROM universe_nifty50"
    elif universe_name == 'custom':
        data_source = "SELECT * FROM universe_custom"
    elif universe_name == 'combined':
        data_source = "SELECT * FROM universe_custom \
                        UNION SELECT * FROM universe_nifty100 \
                        UNION SELECT * FROM universe_nifty50"
    else:
        return []

    universe_data = get_universe(data_source)
    return universe_data

def get_universe_data_field(universe_name, filed_name):
    universe_data = get_universe_data(universe_name)
    fields = []
    for row in universe_data:
        fields.append(row[filed_name])
    return fields

if __name__ == '__main__':
    universe_data = get_universe_data_field('nifty100', 'ticker')
    print()
