import psycopg2

def get_db_connection():
    # establishing the connection
    conn = psycopg2.connect(
        database="fin_platform",
        user='postgres',
        password='1234',
        host='localhost',
        port= '5432'
        )
    return conn;