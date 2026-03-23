import yfinance as yf
from databases.db_connection import get_db_connection
from services.universe_service import get_universe_data
import datetime

def setup_news_table():
    """Creates the stock_news table in the database if it doesn't exist."""
    print("Setting up stock_news table...")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS public.stock_news
    (
        id SERIAL PRIMARY KEY,
        ticker text NOT NULL,
        title text,
        publisher text,
        publish_date timestamp,
        link text
    );
    """
    cursor.execute(create_table_sql)
    
    # Also clear old news so we don't just keep appending duplicates forever
    cursor.execute("TRUNCATE TABLE public.stock_news;")
    
    conn.commit()
    cursor.close()
    conn.close()


def refresh_stock_news():
    """
    Fetches the combined universe, grabs the latest news headlines via yfinance,
    and stores them in the stock_news table for later AI analysis.
    """
    setup_news_table()
    
    universe_data = get_universe_data('combined')
    conn = get_db_connection()
    cursor = conn.cursor()
    
    insert_sql = """
        INSERT INTO public.stock_news (ticker, title, publisher, publish_date, link)
        VALUES (%s, %s, %s, %s, %s)
    """
    
    total_news_inserted = 0
    print(f"Fetching news for {len(universe_data)} stocks...")
    
    for row in universe_data:
        symbol = row['symbol']
        yf_ticker = symbol + '.NS'
        
        try:
            ticker_obj = yf.Ticker(yf_ticker)
            news_items = ticker_obj.news
            
            if not news_items:
                continue
                
            inserted_count = 0
            for item in news_items:
                # Sometimes the structure varies slightly, safe extraction
                try: # handle both new and old yfinance news dict structures
                    if 'content' in item:
                        content = item['content']
                        title = content.get('title', '')
                        publisher = content.get('provider', {}).get('displayName', '')
                        pub_date_str = content.get('pubDate', '')
                        link = content.get('canonicalUrl', {}).get('url', '')
                    else:
                        title = item.get('title', '')
                        publisher = item.get('publisher', '')
                        pub_date_str = item.get('providerPublishTime', '') # UNIX timestamp fallback
                        link = item.get('link', '')
                        
                        # Convert unix timestamp if needed
                        if isinstance(pub_date_str, (int, float)):
                            pub_date_str = datetime.datetime.fromtimestamp(pub_date_str).strftime('%Y-%m-%d %H:%M:%S')

                    if not title:
                        continue
                        
                    cursor.execute(insert_sql, (symbol, title, publisher, pub_date_str, link))
                    inserted_count += 1
                    total_news_inserted += 1
                except Exception as parse_error:
                    pass # Skip badly formatted news items
            
            print(f"  Saved {inserted_count} headlines for {symbol}")
            
        except Exception as e:
            print(f"  Error fetching news for {symbol}: {e}")
            
    conn.commit()
    cursor.close()
    conn.close()
    
    print(f"Done! Successfully loaded {total_news_inserted} total news articles.")


if __name__ == '__main__':
    refresh_stock_news()
