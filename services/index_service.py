from databases.db_get_data import get_nifty100_data, get_nifty50_data
from databases.db_get_data import get_universe

def get_nifty100_constituent_data():
    nifty100_data = get_nifty100_data()
    return nifty100_data

def get_nifty50_constituent_data():
    nifty50_data = get_nifty50_data()
    return nifty50_data

if __name__ == "__main__":
    result = get_nifty100_constituent_data()
    print(result)