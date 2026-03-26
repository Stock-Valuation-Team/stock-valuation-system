import pandas as pd
from databases.db_connection import get_db_connection

# Attempt to load HuggingFace Transformers, but fail gracefully if not installed
try:
    from transformers import pipeline
    FINBERT_AVAILABLE = True
except ImportError:
    FINBERT_AVAILABLE = False


def fetch_stock_headlines():
    """
    Fetches all news headlines currently stored in the DB, 
    grouped by ticker.
    """
    conn = get_db_connection()
    query = """
        SELECT ticker, title FROM stock_news
        WHERE title IS NOT NULL
    """
    df = pd.read_sql(query, conn)
    conn.close()
    
    # Dictionary mapping ticker -> list of headlines
    stock_news = {}
    for _, row in df.iterrows():
        ticker = row['ticker']
        if ticker not in stock_news:
            stock_news[ticker] = []
        stock_news[ticker].append(row['title'])
        
    return stock_news


def get_stock_sentiments():
    """
    Runs FinBERT on the headlines for each stock to generate a composite
    sentiment score between -1.0 (very negative) and +1.0 (very positive).
    """
    if not FINBERT_AVAILABLE:
        raise ImportError(
            "The 'transformers' and 'torch' packages are required for AI Signals. "
            "Please run: pip install transformers torch"
        )
        
    print("Loading FinBERT model... (this may take a moment)")
    # ProsusAI/finbert classifies text as positive, negative, or neutral
    analyzer = pipeline("sentiment-analysis", model="ProsusAI/finbert")
    print("Model loaded successfully.")
    
    stock_news = fetch_stock_headlines()
    sentiment_scores = {}
    
    print(f"Scoring sentiments for {len(stock_news)} stocks using AI...")
    for ticker, headlines in stock_news.items():
        if not headlines:
            sentiment_scores[ticker] = 0.0
            continue
            
        # Run inference on all headlines for this stock
        try:
            results = analyzer(headlines)
            
            # Aggregate the score: Positive (+score), Negative (-score), Neutral (0)
            total_score = 0.0
            for res in results:
                label = res['label']
                score = res['score']  # Confidence (usually 0.5 to 1.0)
                
                if label == 'positive':
                    total_score += score
                elif label == 'negative':
                    total_score -= score
                    
            # Average sentiment across all recently fetched articles
            avg_score = total_score / len(headlines)
            sentiment_scores[ticker] = avg_score
            
        except Exception as e:
            print(f"Error scoring {ticker}: {e}")
            sentiment_scores[ticker] = 0.0
            
    print("Scoring complete.")
    return sentiment_scores

if __name__ == '__main__':
    # Simple test
    scores = get_stock_sentiments()
    for t, s in list(scores.items())[:5]:
        print(f"{t}: {s:.2f}")

