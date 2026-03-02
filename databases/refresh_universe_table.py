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

sql = '''
DROP TABLE IF EXISTS public.universe;
CREATE TABLE IF NOT EXISTS public.universe
(
    symbol text COLLATE pg_catalog."default",
    stock text COLLATE pg_catalog."default"
)'''
cursor.execute(sql)

# Inserting values into the table
insert_stmt = "INSERT INTO public.universe(\
symbol, stock) VALUES (%s, %s)"
data = [('HDFCBANK', 'HDFC Bank Ltd'),
        ('SUZLON', 'Suzlon Energy Ltd'),
        ('TMPV', 'Tata Motors Passenger Vhcls Ltd'),
        ]
cursor.executemany(insert_stmt, data)

# Display whole table
cursor.execute("SELECT * FROM universe")
print(cursor.fetchall())

# Commit your changes in the database
conn.commit()

#Closing the connection
conn.close()