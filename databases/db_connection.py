import psycopg2

def get_db_connection():
    # establishing the connection
    conn = psycopg2.connect(
        database="fin_platform",
        user='postgres',
        password='vikram@2005',
        host='localhost',
        port= '5433'
        )
    return conn;