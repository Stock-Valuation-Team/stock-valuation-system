import psycopg2

def get_db_connection():
    # establishing the connection
    conn = psycopg2.connect(
        database="fin_platform",
        user='postgres',
        password='vishnu',
        host='localhost',
        port= '5432'
        )
    return conn;