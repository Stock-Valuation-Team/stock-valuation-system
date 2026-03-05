from databases.db_connection import get_db_connection


def save_data(insert_stmt, data):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(insert_stmt, data)
    conn.commit()
    conn.close()
    return True


def clear_table_data(table_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = 'DELETE FROM ' + table_name
    cursor.execute(sql)
    conn.commit()
    conn.close()
