import psycopg2

# establishing the connection
conn = psycopg2.connect(
    database="fin_platform",
    user='postgres',
    password='vishnu',
    host='localhost',
    port= '5432'
)

# Creating a cursor object using the cursor()
# method
cursor = conn.cursor()

sql = '''CREATE TABLE IF NOT EXISTS public.holdings
(
    symbol text COLLATE pg_catalog."default",
    stock text COLLATE pg_catalog."default",
    qty integer,
    buy_date date,
    buy_price integer,
    exchange text COLLATE pg_catalog."default",
    strategy text COLLATE pg_catalog."default"
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.holdings
    OWNER to postgres;'''
cursor.execute(sql)

# Inserting values into the table
insert_stmt = "INSERT INTO public.holdings(\
symbol, stock, qty, buy_date, buy_price, exchange, strategy)\
VALUES (%s, %s, %s, %s, %s, %s, %s)"
data = [('HDFCBANK', 'HDFC Bank Ltd', 10,"2026-03-01", 882, "BSE","Nift50"),
        ('SUZLON', 'Suzlon Energy Ltd', 50, "2026-03-01", 20, "BSE","Nift50"),
        ('TMPV', 'Tata Motors Passenger Vhcls Ltd', 100, "2026-03-01", 41, "BSE","Nift50"),
        ]

cursor.executemany(insert_stmt, data)

# Display whole table
cursor.execute("SELECT * FROM holdings")
print(cursor.fetchall())

# Commit your changes in the database
conn.commit()

#Closing the connection
conn.close()