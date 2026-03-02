import psycopg2
from databases.db_connection import get_db_connection



def get_universe():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM universe")
    column_names = [description[0] for description in cursor.description]
    rows = cursor.fetchall()
    result_maps = [dict(zip(column_names, row)) for row in rows]
    conn.close()
    return result_maps

def get_holdings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM holdings")
    column_names = [description[0] for description in cursor.description]
    rows = cursor.fetchall()
    result_maps = [dict(zip(column_names, row)) for row in rows]
    conn.close()
    return result_maps


if __name__ == "__main__":
    universe_result = get_universe()
    print(universe_result)
    holdings_result = get_holdings()
    print(holdings_result)