from databases.db_get_data import get_holdings
from databases.db_get_data import get_universe

def get_holding_data():
    holdings_data = get_holdings()
    return holdings_data

def get_universe_data():
    universe_data = get_universe()
    return universe_data

if __name__ == "__main__":
    get_holding_data()
    holdings_result = get_holdings()
    print(holdings_result)