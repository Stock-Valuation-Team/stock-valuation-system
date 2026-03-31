from databases.db_get_data import get_holdings
import yfinance as yf


def _to_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_candidate_tickers(holding):
    symbol = str(holding.get('symbol') or '').strip().upper()
    if not symbol:
        return []

    exchange = str(holding.get('exchange') or '').strip().upper()
    if exchange == 'BSE':
        return [f'{symbol}.BO', f'{symbol}.NS']
    return [f'{symbol}.NS', f'{symbol}.BO']


def _fetch_live_prices(holdings_data):
    ticker_to_symbol = {}
    for holding in holdings_data:
        symbol = str(holding.get('symbol') or '').strip().upper()
        if not symbol:
            continue
        for ticker in _build_candidate_tickers(holding):
            ticker_to_symbol[ticker] = symbol

    if not ticker_to_symbol:
        return {}

    prices = {}
    tickers = list(ticker_to_symbol.keys())
    try:
        quote_data = yf.download(
            tickers=' '.join(tickers),
            period='1d',
            interval='1m',
            group_by='ticker',
            auto_adjust=False,
            progress=False,
            threads=True,
        )
    except Exception:
        quote_data = None

    if quote_data is not None and not quote_data.empty:
        for ticker in tickers:
            close_price = None
            try:
                if ticker in quote_data.columns.get_level_values(0):
                    close_series = quote_data[ticker].get('Close')
                else:
                    close_series = quote_data.get('Close')
                if close_series is not None and not close_series.empty:
                    close_price = _to_float(close_series.dropna().iloc[-1], default=None)
            except Exception:
                close_price = None

            if close_price is None:
                continue
            symbol = ticker_to_symbol[ticker]
            if symbol not in prices:
                prices[symbol] = close_price

    missing_symbols = {
        str(h.get('symbol') or '').strip().upper()
        for h in holdings_data
        if str(h.get('symbol') or '').strip().upper() and str(h.get('symbol') or '').strip().upper() not in prices
    }

    for holding in holdings_data:
        symbol = str(holding.get('symbol') or '').strip().upper()
        if symbol not in missing_symbols:
            continue
        for ticker in _build_candidate_tickers(holding):
            try:
                ticker_data = yf.Ticker(ticker)
                hist = ticker_data.history(period='1d')
                if hist is None or hist.empty:
                    continue
                close_price = _to_float(hist['Close'].dropna().iloc[-1], default=None)
                if close_price is not None:
                    prices[symbol] = close_price
                    break
            except Exception:
                continue

    return prices

def get_holding_data():
    holdings_data = get_holdings()
    return holdings_data


def _get_sector_for_symbol(symbol, exchange):
    base_symbol = str(symbol or '').strip().upper()
    if not base_symbol:
        return '-'

    exch = str(exchange or '').strip().upper()
    candidate_tickers = [f'{base_symbol}.BO', f'{base_symbol}.NS'] if exch == 'BSE' else [f'{base_symbol}.NS', f'{base_symbol}.BO']

    for ticker in candidate_tickers:
        try:
            ticker_data = yf.Ticker(ticker)
            info = ticker_data.info or {}
            sector = info.get('sector')
            if sector:
                return sector
        except Exception:
            continue
    return '-'


def get_holding_details_data():
    holdings_data = get_holdings()
    sector_cache = {}
    details_rows = []

    for holding in holdings_data:
        symbol = holding.get('symbol')
        exchange = holding.get('exchange')
        cache_key = f"{str(symbol or '').strip().upper()}|{str(exchange or '').strip().upper()}"

        if cache_key not in sector_cache:
            sector_cache[cache_key] = _get_sector_for_symbol(symbol, exchange)

        details_rows.append({
            'stock': holding.get('stock', '-'),
            'qty': holding.get('qty', 0),
            'sector': sector_cache[cache_key],
        })

    return details_rows


def get_holding_analytics_data():
    holdings_data = get_holdings()
    live_prices = _fetch_live_prices(holdings_data)

    analytics_rows = []
    total_invested = 0.0
    total_current = 0.0

    for holding in holdings_data:
        qty = _to_float(holding.get('qty'))
        buy_price = _to_float(holding.get('buy_price'))
        symbol = str(holding.get('symbol') or '').strip().upper()

        invested_value = round(qty * buy_price, 2)
        live_price = live_prices.get(symbol)

        current_value = None
        pnl = None
        pnl_pct = None
        if live_price is not None:
            current_value = round(qty * live_price, 2)
            pnl = round(current_value - invested_value, 2)
            if invested_value:
                pnl_pct = round((pnl / invested_value) * 100, 2)

        analytics_row = dict(holding)
        analytics_row['live_price'] = round(live_price, 2) if live_price is not None else None
        analytics_row['invested_value'] = invested_value
        analytics_row['current_value'] = current_value
        analytics_row['pnl'] = pnl
        analytics_row['pnl_pct'] = pnl_pct
        analytics_rows.append(analytics_row)

        total_invested += invested_value
        if current_value is not None:
            total_current += current_value

    total_row = {
        'symbol': 'TOTAL',
        'stock': 'Portfolio Summary',
        'qty': '',
        'buy_date': '',
        'buy_price': '',
        'exchange': '',
        'strategy': '',
        'live_price': '',
        'invested_value': round(total_invested, 2),
        'current_value': round(total_current, 2),
        'pnl': round(total_current - total_invested, 2),
        'pnl_pct': round(((total_current - total_invested) / total_invested) * 100, 2) if total_invested else None,
    }
    analytics_rows.append(total_row)

    return analytics_rows


def _get_ticker_for_symbol(symbol):
    base_symbol = str(symbol or '').strip().upper()
    if not base_symbol:
        return None

    exchange = None
    for holding in get_holdings():
        if str(holding.get('symbol') or '').strip().upper() == base_symbol:
            exchange = str(holding.get('exchange') or '').strip().upper()
            break

    candidate_tickers = [f'{base_symbol}.BO', f'{base_symbol}.NS'] if exchange == 'BSE' else [f'{base_symbol}.NS', f'{base_symbol}.BO']
    for ticker in candidate_tickers:
        try:
            ticker_data = yf.Ticker(ticker)
            hist = ticker_data.history(period='5d')
            if hist is not None and not hist.empty:
                return ticker
        except Exception:
            continue
    return candidate_tickers[0]


def get_stock_company_live_data(symbol):
    ticker = _get_ticker_for_symbol(symbol)
    if not ticker:
        return {
            'symbol': symbol,
            'ticker': '-',
            'company_profile': {},
            'financial_ratios': {},
            'balance_sheet_df': None,
            'quarterly_balance_sheet_df': None,
            'cashflow_df': None,
            'quarterly_cashflow_df': None,
            'financials_df': None,
            'quarterly_financials_df': None,
            'error': 'Invalid symbol',
        }

    try:
        ticker_data = yf.Ticker(ticker)
        info = ticker_data.info or {}
        balance_sheet_df = ticker_data.balance_sheet
        quarterly_balance_sheet_df = getattr(ticker_data, 'quarterly_balance_sheet', None)
        cashflow_df = ticker_data.cashflow
        quarterly_cashflow_df = getattr(ticker_data, 'quarterly_cashflow', None)
        financials_df = ticker_data.financials
        quarterly_financials_df = getattr(ticker_data, 'quarterly_financials', None)

        company_profile = {
            'symbol': symbol,
            'ticker': ticker,
            'company_name': info.get('longName') or info.get('shortName') or '-',
            'sector': info.get('sector') or '-',
            'industry': info.get('industry') or '-',
            'country': info.get('country') or '-',
            'website': info.get('website') or '-',
            'employees': info.get('fullTimeEmployees') or '-',
            'business_summary': info.get('longBusinessSummary') or '-',
        }

        financial_ratios = {
            'market_cap': info.get('marketCap'),
            'enterprise_value': info.get('enterpriseValue'),
            'trailing_pe': info.get('trailingPE'),
            'forward_pe': info.get('forwardPE'),
            'price_to_book': info.get('priceToBook'),
            'debt_to_equity': info.get('debtToEquity'),
            'current_ratio': info.get('currentRatio'),
            'quick_ratio': info.get('quickRatio'),
            'return_on_equity': info.get('returnOnEquity'),
            'return_on_assets': info.get('returnOnAssets'),
            'gross_margin': info.get('grossMargins'),
            'operating_margin': info.get('operatingMargins'),
            'profit_margin': info.get('profitMargins'),
            'dividend_yield': info.get('dividendYield'),
            'payout_ratio': info.get('payoutRatio'),
            'beta': info.get('beta'),
        }

        return {
            'symbol': symbol,
            'ticker': ticker,
            'company_profile': company_profile,
            'financial_ratios': financial_ratios,
            'balance_sheet_df': balance_sheet_df,
            'quarterly_balance_sheet_df': quarterly_balance_sheet_df,
            'cashflow_df': cashflow_df,
            'quarterly_cashflow_df': quarterly_cashflow_df,
            'financials_df': financials_df,
            'quarterly_financials_df': quarterly_financials_df,
            'error': None,
        }
    except Exception as ex:
        return {
            'symbol': symbol,
            'ticker': ticker,
            'company_profile': {},
            'financial_ratios': {},
            'balance_sheet_df': None,
            'quarterly_balance_sheet_df': None,
            'cashflow_df': None,
            'quarterly_cashflow_df': None,
            'financials_df': None,
            'quarterly_financials_df': None,
            'error': str(ex),
        }

if __name__ == "__main__":
    get_holding_data()
    holdings_result = get_holdings()
    print(holdings_result)