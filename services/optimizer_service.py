import pandas as pd
from databases.db_connection import get_db_connection
from services.holding_service import get_holding_data
from pypfopt.expected_returns import mean_historical_return
from pypfopt.risk_models import CovarianceShrinkage
from pypfopt.efficient_frontier import EfficientFrontier
from pypfopt.discrete_allocation import DiscreteAllocation, get_latest_prices
from pypfopt import objective_functions


def get_price_dataframe():
    """
    Fetches historical close prices from hist_prices_yfinance table
    for all available universe stocks, and pivots into a DataFrame 
    suitable for PyPortfolioOpt.
    """
    conn = get_db_connection()
    query = """
        SELECT ticker, price_date, close
        FROM hist_prices_yfinance
        ORDER BY price_date
    """
    df = pd.read_sql(query, conn, parse_dates=['price_date'])
    conn.close()

    if df.empty:
        return None

    # Pivot: rows = dates, columns = tickers, values = close price
    price_df = df.pivot_table(index='price_date', columns='ticker', values='close')

    # Drop columns (tickers) that have too many NaN values (>30% missing)
    threshold = len(price_df) * 0.7
    price_df = price_df.dropna(axis=1, thresh=int(threshold))

    # Forward-fill remaining NaN values
    price_df = price_df.ffill().bfill()

    return price_df


def get_optimized_portfolio(strategy='traditional', total_value=100000):
    """
    Runs portfolio optimization using PyPortfolioOpt for the universe.
    """
    price_df = get_price_dataframe()

    if price_df is None or price_df.shape[1] < 2:
        raise ValueError("Not enough historical data available in the database. Optimization requires at least 2 valid stocks with price history.")

    # Compute expected returns and covariance matrix
    mu = mean_historical_return(price_df)
    S = CovarianceShrinkage(price_df).ledoit_wolf()

    # Run optimization
    ef = EfficientFrontier(mu, S)
    # Add L2 regularization to encourage diversification
    ef.add_objective(objective_functions.L2_reg, gamma=0.1)

    if strategy == 'min_volatility':
        ef.min_volatility()
        strategy_name = 'Minimum Volatility'
    else:
        # 'traditional' maps to Maximum Sharpe Ratio
        ef.max_sharpe()
        strategy_name = 'Traditional (Max Sharpe)'

    cleaned_weights = ef.clean_weights()
    performance = ef.portfolio_performance(verbose=False)

    # Filter out zero-weight stocks
    non_zero_weights = {k: v for k, v in cleaned_weights.items() if v > 0}

    # Discrete allocation — how many shares to actually buy
    latest_prices = get_latest_prices(price_df)
    da = DiscreteAllocation(cleaned_weights, latest_prices, total_portfolio_value=total_value)
    allocation, leftover = da.lp_portfolio()

    # --- Rebalancing suggestions ---
    # Compare optimal allocation to current holdings to suggest Buy/Sell
    current_holdings = get_holding_data() or []
    holding_qtys = {h['symbol']: h['qty'] for h in current_holdings}
    
    rebalance_actions = []
    
    # 1. Stocks user currently holds
    for stock, current_qty in holding_qtys.items():
        if stock in allocation:
            optimal_qty = allocation[stock]
            diff = optimal_qty - current_qty
            if diff > 0:
                rebalance_actions.append({'stock': stock, 'action': 'BUY', 'qty': diff})
            elif diff < 0:
                rebalance_actions.append({'stock': stock, 'action': 'SELL', 'qty': abs(diff)})
            else:
                rebalance_actions.append({'stock': stock, 'action': 'HOLD', 'qty': current_qty})
            # Remove from allocation so we don't process it again in step 2
            allocation.pop(stock)
        else:
            # Not in optimal portfolio -> Sell all
            rebalance_actions.append({'stock': stock, 'action': 'SELL (Offload)', 'qty': current_qty})
            
    # 2. Stocks user doesn't hold but should buy
    for stock, optimal_qty in allocation.items():
        rebalance_actions.append({'stock': stock, 'action': 'BUY (New)', 'qty': optimal_qty})
        
    # Sort actions: BUY New -> BUY -> HOLD -> SELL -> SELL Offload
    action_priority = {'BUY (New)': 0, 'BUY': 1, 'HOLD': 2, 'SELL': 3, 'SELL (Offload)': 4}
    rebalance_actions.sort(key=lambda x: action_priority[x['action']])

    return {
        'weights': non_zero_weights,
        'performance': {
            'expected_return': round(performance[0] * 100, 2),
            'annual_volatility': round(performance[1] * 100, 2),
            'sharpe_ratio': round(performance[2], 2),
        },
        'rebalance_actions': rebalance_actions,
        'leftover': round(leftover, 2),
        'strategy_name': strategy_name,
        'total_value': total_value,
        'num_stocks_analyzed': price_df.shape[1],
    }


if __name__ == '__main__':
    try:
        result = get_optimized_portfolio('traditional', 100000)
        if result:
            print(f"\nStrategy: {result['strategy_name']}")
            print(f"Stocks analyzed: {result['num_stocks_analyzed']}")
            print(f"\nExpected Return: {result['performance']['expected_return']}%")
            print(f"Annual Volatility: {result['performance']['annual_volatility']}%")
            print(f"Sharpe Ratio: {result['performance']['sharpe_ratio']}")
            print(f"\nOptimal Weights:")
            for stock, weight in sorted(result['weights'].items(), key=lambda x: -x[1]):
                print(f"  {stock}: {weight:.2%}")
            print(f"\nDiscrete Allocation (₹{result['total_value']:,}):")
            for stock, shares in result['allocation'].items():
                print(f"  {stock}: {shares} shares")
            print(f"Leftover: ₹{result['leftover']:,}")
    except Exception as e:
        print(f"Error: {e}")
