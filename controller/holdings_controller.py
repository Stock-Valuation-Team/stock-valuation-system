from django.shortcuts import render
from services.holding_service import get_holding_data, get_holding_analytics_data, get_portfolio_summary_data
from utils.html_utils import db_data_to_html_table
from pathlib import Path
from datetime import datetime, date
import re
from ai_interfaces.preplexity_api import get_holdings_recommendations


def _normalize_name(value):
    text = str(value or '').lower()
    text = re.sub(r'[^a-z0-9]+', '', text)
    return text


def _load_recommendation_reports():
    mock_dir = Path(__file__).resolve().parents[1] / 'mockdata'
    reports = {}
    if not mock_dir.exists():
        return reports

    for file_path in mock_dir.iterdir():
        if not file_path.is_file():
            continue
        if not file_path.name.lower().startswith('analyst_recommendation_'):
            continue

        stem = file_path.stem
        report_name = stem[len('analyst_recommendation_'):] if stem.lower().startswith('analyst_recommendation_') else stem
        key = _normalize_name(report_name)
        if not key:
            continue
        try:
            reports[key] = file_path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue

    return reports


def _clean_markdown_cell(cell):
    text = str(cell or '').strip()
    text = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'\1', text)
    text = text.replace('**', '')
    return text.strip()


def _clean_table_value_by_header(header, value):
    header_text = str(header or '').strip().lower()
    value_text = str(value or '').strip()

    if header_text == 'implied upside/downside':
        match = re.search(r'([+-]?\d+(?:\.\d+)?%)', value_text)
        if match:
            return match.group(1)

    return value_text


def _extract_first_markdown_table(content):
    lines = [line.rstrip() for line in str(content or '').splitlines()]
    if not lines:
        return {'headers': [], 'rows': []}

    start_idx = -1
    for idx in range(len(lines) - 1):
        header_line = lines[idx]
        separator_line = lines[idx + 1].strip()
        if '|' not in header_line:
            continue
        if re.match(r'^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$', separator_line):
            start_idx = idx
            break

    if start_idx == -1:
        return {'headers': [], 'rows': []}

    table_lines = [lines[start_idx], lines[start_idx + 1]]
    for idx in range(start_idx + 2, len(lines)):
        line = lines[idx]
        if '|' not in line:
            break
        if not line.strip():
            break
        table_lines.append(line)

    def parse_row(line):
        parts = [part.strip() for part in line.strip().split('|')]
        if parts and parts[0] == '':
            parts = parts[1:]
        if parts and parts[-1] == '':
            parts = parts[:-1]
        return [_clean_markdown_cell(cell) for cell in parts]

    headers = parse_row(table_lines[0])
    data_rows = [parse_row(row_line) for row_line in table_lines[2:]]
    normalized_rows = []
    for row in data_rows:
        if len(row) < len(headers):
            row = row + [''] * (len(headers) - len(row))
        elif len(row) > len(headers):
            row = row[:len(headers)]
        row = [_clean_table_value_by_header(headers[idx], row[idx]) for idx in range(len(headers))]
        normalized_rows.append(row)

    return {'headers': headers, 'rows': normalized_rows}


def _classify_holdings_recommendations(holdings_data):
    mock_recommendations = get_holdings_recommendations(holdings_data)
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

    mock_recommendations = get_holdings_recommendations(holdings_data)
    recommendation_reports = _load_recommendation_reports()
    details = []
    for idx, holding in enumerate(holdings_data):
        symbol = str(holding.get('symbol') or '').strip().upper()
        stock = str(holding.get('stock') or '').strip()
        symbol_key = _normalize_name(symbol)
        stock_key = _normalize_name(stock)
        qty = holding.get('qty')
        buy_price = holding.get('buy_price')
        buy_date = holding.get('buy_date')
        analytics = analytics_map.get(symbol, {})

        recommendation = _get_recommendation_for_holding(holding, mock_recommendations)
        report_text = recommendation_reports.get(stock_key) or recommendation_reports.get(symbol_key) or ''
        recommendation_table = _extract_first_markdown_table(report_text)

        details.append({
            'row_id': f'detail_{idx}',
            'symbol': symbol,
            'stock': stock,
            'qty': qty,
            'buy_price': buy_price,
            'buy_date': _format_buy_date(buy_date),
            'live_price': analytics.get('live_price') if analytics else None,
            'invested_value': analytics.get('invested_value') if analytics else 0,
            'current_value': analytics.get('current_value') if analytics else 0,
            'pnl': analytics.get('pnl') if analytics else 0,
            'pnl_pct': analytics.get('pnl_pct') if analytics else 0,
            'recommendation': recommendation,
            'recommendation_table': recommendation_table,
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
