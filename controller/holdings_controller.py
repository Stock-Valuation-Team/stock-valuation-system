from django.shortcuts import render
from services.holding_service import get_holding_data, get_holding_analytics_data, get_portfolio_summary_data
from utils.html_utils import db_data_to_html_table
from pathlib import Path
from datetime import datetime, date
import re


def _normalize_name(value):
    text = str(value or '').lower()
    text = re.sub(r'[^a-z0-9]+', '', text)
    return text


def _extract_action_from_text(content):
    upper = content.upper()
    if 'SELL' in upper or 'REDUCE' in upper or 'UNDERPERFORM' in upper:
        return 'SELL'
    if 'HOLD' in upper or 'NEUTRAL' in upper:
        return 'HOLD'
    if 'BUY' in upper or 'OUTPERFORM' in upper or 'OVERWEIGHT' in upper or 'ADD' in upper:
        return 'BUY'
    return 'HOLD'


def _load_mock_recommendations():
    mock_dir = Path(__file__).resolve().parents[1] / 'mockdata'
    recommendations = {}
    if not mock_dir.exists():
        return recommendations

    for file_path in mock_dir.iterdir():
        if not file_path.is_file():
            continue
        name = file_path.name
        if not name.lower().startswith('analyst_recommendation_'):
            continue
        stock_name = name[len('analyst_recommendation_'):].strip()
        normalized_stock = _normalize_name(stock_name)
        if not normalized_stock:
            continue
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        recommendations[normalized_stock] = _extract_action_from_text(content)

    return recommendations


def _classify_holdings_recommendations(holdings_data):
    mock_recommendations = _load_mock_recommendations()
    groups = {
        'BUY': [],
        'HOLD': [],
        'SELL': [],
    }

    for holding in holdings_data:
        stock = str(holding.get('stock') or '').strip()
        symbol = str(holding.get('symbol') or '').strip()
        action = 'HOLD'

        stock_key = _normalize_name(stock)
        symbol_key = _normalize_name(symbol)

        if stock_key in mock_recommendations:
            action = mock_recommendations[stock_key]
        elif symbol_key in mock_recommendations:
            action = mock_recommendations[symbol_key]

        display_name = stock if stock else symbol
        if display_name:
            groups[action].append(display_name)

    return groups


def _get_recommendation_for_holding(holding, mock_recommendations):
    stock = str(holding.get('stock') or '').strip()
    symbol = str(holding.get('symbol') or '').strip()

    stock_key = _normalize_name(stock)
    symbol_key = _normalize_name(symbol)

    if stock_key in mock_recommendations:
        return mock_recommendations[stock_key]
    if symbol_key in mock_recommendations:
        return mock_recommendations[symbol_key]
    return 'HOLD'


def _format_buy_date(value):
    if isinstance(value, date):
        return value.isoformat()

    raw = str(value or '').strip()
    if not raw:
        return ''

    for date_format in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(raw, date_format).date().isoformat()
        except ValueError:
            continue

    return raw


def _build_holdings_detail_rows(holdings_data):
    analytics_rows = get_holding_analytics_data()
    analytics_map = {}
    for row in analytics_rows:
        symbol = str(row.get('symbol') or '').strip().upper()
        if symbol and symbol != 'TOTAL':
            analytics_map[symbol] = row

    mock_recommendations = _load_mock_recommendations()
    details = []
    for idx, holding in enumerate(holdings_data):
        symbol = str(holding.get('symbol') or '').strip().upper()
        stock = str(holding.get('stock') or '').strip()
        qty = holding.get('qty')
        buy_price = holding.get('buy_price')
        buy_date = holding.get('buy_date')
        exchange = str(holding.get('exchange') or '').strip().upper()
        strategy = str(holding.get('strategy') or '').strip()
        analytics = analytics_map.get(symbol, {})

        current_price = analytics.get('live_price')
        if current_price is None:
            current_price = buy_price

        total_pnl = analytics.get('pnl')
        if total_pnl is None:
            total_pnl = 0

        pnl_pct = analytics.get('pnl_pct')
        if pnl_pct is None:
            pnl_pct_display = '0.0%'
        else:
            pnl_pct_display = f"{pnl_pct}%"

        recommendation = _get_recommendation_for_holding(holding, mock_recommendations)

        details.append({
            'row_id': f'detail_{idx}',
            'symbol': symbol,
            'stock': stock,
            'qty': qty,
            'buy_price': buy_price,
            'buy_date': _format_buy_date(buy_date),
            'exchange': exchange,
            'strategy': strategy,
            'current_price': current_price,
            'total_pnl': total_pnl,
            'pnl_pct': pnl_pct_display,
            'recommendation': recommendation,
        })
    return details


def holdings_info(request):
    holdings_data = get_holding_data()
    html_table_data = db_data_to_html_table(holdings_data)
    portfolio_summary = get_portfolio_summary_data()
    holdings_details_rows = _build_holdings_detail_rows(holdings_data)
    return render(request, "generic_template_with_table.html",
                  {'page_title': 'Account Holdings', 'html_table': html_table_data,
                   'portfolio_summary': portfolio_summary,
                   'show_recommendation_toggle': True,
                   'holdings_details_rows': holdings_details_rows})


def holdings_recommendations(request):
    holdings_data = get_holding_data()
    html_table_data = db_data_to_html_table(holdings_data)
    portfolio_summary = get_portfolio_summary_data()
    recommendations = _classify_holdings_recommendations(holdings_data)
    return render(request, "generic_template_with_table.html",
                  {'page_title': 'Account Holdings', 'html_table': html_table_data,
                   'portfolio_summary': portfolio_summary,
                   'recommendations': recommendations,
                   'show_recommendation_toggle': True})


def holdings_analytics(request):
    holdings_data = get_holding_analytics_data()
    html_table_data = db_data_to_html_table(holdings_data)
    return render(request, "generic_template_with_table.html",
                  {'page_title': 'Account Holdings', 'html_table': html_table_data,
                   'show_recommendation_toggle': False})
