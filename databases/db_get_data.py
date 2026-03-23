import psycopg2
from databases.db_connection import get_db_connection


def get_universe(universe_qery):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(universe_qery)
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


def get_nifty100_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM nifty100_constituents")
    column_names = [description[0] for description in cursor.description]
    rows = cursor.fetchall()
    result_maps = [dict(zip(column_names, row)) for row in rows]
    conn.close()
    return result_maps


def get_table_cols(table_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT *  FROM ' + table_name + ' limit 1')
    column_names = [description[0] for description in cursor.description]
    conn.close()
    return column_names


if __name__ == "__main__":
    universe_result = get_universe()
    print(universe_result)
    holdings_result = get_holdings()
    print(holdings_result)