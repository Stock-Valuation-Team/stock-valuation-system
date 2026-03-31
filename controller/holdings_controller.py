from django.shortcuts import render
from services.holding_service import get_holding_analytics_data
from services.holding_service import get_holding_details_data
from services.holding_service import get_stock_company_live_data
from utils.html_utils import db_data_to_html_table


def _to_number(value):
    try:
        if value is None:
            return None
        if isinstance(value, str):
            value = value.replace(',', '').strip()
            if value == '':
                return None
        return float(value)
    except Exception:
        return None


def _format_crore(value):
    num = _to_number(value)
    if num is None:
        return '-'
    return f"{num / 10000000:,.2f} Cr"


def _format_plain_number(value):
    num = _to_number(value)
    if num is None:
        return '-'
    return f"{num:,.2f}"


def _format_percent(value, decimal_input=True):
    num = _to_number(value)
    if num is None:
        return '-'
    pct = num * 100 if decimal_input else num
    return f"{pct:,.2f}%"


def _format_yoy(latest_value, previous_value):
    latest = _to_number(latest_value)
    previous = _to_number(previous_value)
    if latest is None or previous in (None, 0):
        return '-'
    change = ((latest - previous) / abs(previous)) * 100
    arrow = '↑' if change > 0 else ('↓' if change < 0 else '→')
    return f"{arrow} {change:,.2f}%"


def _extract_period_columns(df, periodicity='annual'):
    period_cols = []
    for col in list(df.columns):
        year = None
        month = None
        if hasattr(col, 'year'):
            year = col.year
            month = getattr(col, 'month', None)
        else:
            col_str = str(col)
            if len(col_str) >= 4 and col_str[:4].isdigit():
                year = int(col_str[:4])

        if not year:
            continue

        if periodicity == 'quarterly' and month:
            quarter = ((month - 1) // 3) + 1
            period_order = year * 10 + quarter
            period_label = f"{year}-Q{quarter}"
        else:
            period_order = year
            period_label = str(year)

        period_cols.append((period_order, period_label, col))

    period_cols.sort(key=lambda x: x[0])
    return period_cols


def _find_row_label(df, candidates):
    index_lookup = {str(idx).strip().lower(): idx for idx in df.index}
    normalized_lookup = {key.replace('_', ' ').replace('-', ' '): val for key, val in index_lookup.items()}

    for candidate in candidates:
        key = candidate.strip().lower()
        if key in index_lookup:
            return index_lookup[key]
        key_norm = key.replace('_', ' ').replace('-', ' ')
        if key_norm in normalized_lookup:
            return normalized_lookup[key_norm]

    for candidate in candidates:
        key = candidate.strip().lower().replace('_', ' ').replace('-', ' ')
        for idx in df.index:
            idx_norm = str(idx).strip().lower().replace('_', ' ').replace('-', ' ')
            if key in idx_norm:
                return idx
    return None


def _build_statement_section(df, metric_specs, title, periodicity='annual'):
    if df is None or df.empty:
        return {
            'title': title,
            'latest_period': '-',
            'periodicity': periodicity,
            'rows': [],
        }

    period_cols = _extract_period_columns(df, periodicity=periodicity)
    if not period_cols:
        return {
            'title': title,
            'latest_period': '-',
            'periodicity': periodicity,
            'rows': [],
        }

    _, latest_period, latest_col = period_cols[-1]
    previous_col = period_cols[-2][2] if len(period_cols) > 1 else None
    rows = []

    for metric_label, candidate_rows, metric_type in metric_specs:
        row_label = _find_row_label(df, candidate_rows)
        latest_value = None
        previous_value = None
        if row_label is not None:
            latest_value = _to_number(df.at[row_label, latest_col])
            if previous_col is not None:
                previous_value = _to_number(df.at[row_label, previous_col])

        if metric_type == 'crore':
            display_value = _format_crore(latest_value)
        elif metric_type == 'percent':
            display_value = _format_percent(latest_value, decimal_input=True)
        elif metric_type == 'ratio':
            display_value = _format_plain_number(latest_value)
        else:
            display_value = _format_plain_number(latest_value)

        rows.append({
            'metric': metric_label,
            'value': display_value,
            'yoy': _format_yoy(latest_value, previous_value),
        })

    return {
        'title': title,
        'latest_period': latest_period,
        'periodicity': periodicity,
        'rows': rows,
    }


def _build_chart_data(df, series_specs, periodicity='annual', max_points=6):
    if df is None or df.empty:
        return {'labels': [], 'datasets': []}

    period_cols = _extract_period_columns(df, periodicity=periodicity)
    if not period_cols:
        return {'labels': [], 'datasets': []}

    if max_points and len(period_cols) > max_points:
        period_cols = period_cols[-max_points:]

    labels = [period_label for _, period_label, _ in period_cols]
    datasets = []

    for series_label, candidate_rows in series_specs:
        row_label = _find_row_label(df, candidate_rows)
        series_values = []
        for _, _, col in period_cols:
            raw_value = _to_number(df.at[row_label, col]) if row_label is not None else None
            if raw_value is None:
                series_values.append(None)
            else:
                series_values.append(round(raw_value / 10000000, 2))
        datasets.append({
            'label': series_label,
            'data': series_values,
        })

    return {
        'labels': labels,
        'datasets': datasets,
    }

# http://127.0.0.1:8000/show_holdings/
def holdings_info(request):
    holdings_data = get_holding_details_data()
    html_table_data = db_data_to_html_table(holdings_data)

    analytics_rows = get_holding_analytics_data()
    summary_row = None
    for row in analytics_rows:
        if str(row.get('symbol', '')).upper() == 'TOTAL':
            summary_row = row
            break

    total_holdings = len(holdings_data)
    companies = len({str(r.get('stock', '')).strip().upper() for r in holdings_data if str(r.get('stock', '')).strip() != ''})

    portfolio_summary = None
    if summary_row is not None:
        pnl = _to_number(summary_row.get('pnl'))
        pnl_pct = _to_number(summary_row.get('pnl_pct'))
        invested_value = _to_number(summary_row.get('invested_value'))
        current_value = _to_number(summary_row.get('current_value'))

        if pnl is not None and pnl > 0:
            status = 'profit'
        elif pnl is not None and pnl < 0:
            status = 'loss'
        else:
            status = 'neutral'

        portfolio_summary = {
            'status': status,
            'total_holdings': total_holdings,
            'companies': companies,
            'total_value': _format_plain_number(current_value),
            'invested_value': _format_plain_number(invested_value),
            'current_value': _format_plain_number(current_value),
            'pnl': _format_plain_number(pnl),
            'pnl_pct': _format_percent(pnl_pct, decimal_input=False),
        }

    return render(request, "holdings_table.html", {
        'page_title': 'Holding Details',
        'html_table': html_table_data,
        'portfolio_summary': portfolio_summary,
    })

# http://127.0.0.1:8000/show_holdings/
def holdings_analytics(request):
    holdings_data = get_holding_analytics_data()
    html_table_data = db_data_to_html_table(holdings_data, symbol_link_prefix='/stock_company_details/')

    actual_rows = [r for r in holdings_data if str(r.get('symbol', '')).upper() != 'TOTAL']
    total_holdings = len(actual_rows)
    companies = len({str(r.get('symbol', '')).upper() for r in actual_rows if str(r.get('symbol', '')).strip() != ''})

    summary_row = None
    for row in holdings_data:
        if str(row.get('symbol', '')).upper() == 'TOTAL':
            summary_row = row
            break

    portfolio_summary = None
    if summary_row is not None:
        pnl = _to_number(summary_row.get('pnl'))
        pnl_pct = _to_number(summary_row.get('pnl_pct'))
        invested_value = _to_number(summary_row.get('invested_value'))
        current_value = _to_number(summary_row.get('current_value'))

        if pnl is not None and pnl > 0:
            status = 'profit'
        elif pnl is not None and pnl < 0:
            status = 'loss'
        else:
            status = 'neutral'

        portfolio_summary = {
            'status': status,
            'total_holdings': total_holdings,
            'companies': companies,
            'total_value': _format_plain_number(current_value),
            'invested_value': _format_plain_number(invested_value),
            'current_value': _format_plain_number(current_value),
            'pnl': _format_plain_number(pnl),
            'pnl_pct': _format_percent(pnl_pct, decimal_input=False),
        }

    return render(request, "holdings_table.html", {
        'page_title': 'Account Holdings Analytics',
        'html_table': html_table_data,
    })


def stock_company_details(request, symbol):
    details = get_stock_company_live_data(symbol)

    income_metrics = [
        ('Revenue', ['Total Revenue', 'Operating Revenue'], 'crore'),
        ('Operating Expense', ['Operating Expense', 'Total Operating Expenses'], 'crore'),
        ('Net Income', ['Net Income', 'Net Income Common Stockholders'], 'crore'),
        ('Net Profit Margin', ['Net Profit Margin', 'Profit Margin'], 'percent'),
        ('Earnings Per Share', ['Diluted EPS', 'Basic EPS'], 'ratio'),
        ('EBITDA', ['EBITDA'], 'crore'),
        ('Effective Tax Rate', ['Tax Rate For Calcs', 'Tax Rate'], 'percent'),
    ]

    cashflow_metrics = [
        ('Net Income', ['Net Income', 'Net Income From Continuing Operations'], 'crore'),
        ('Cash From Operations', ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], 'crore'),
        ('Cash From Investing', ['Investing Cash Flow', 'Cash Flow From Continuing Investing Activities'], 'crore'),
        ('Cash From Financing', ['Financing Cash Flow', 'Cash Flow From Continuing Financing Activities'], 'crore'),
        ('Net Change In Cash', ['Changes In Cash', 'Net Change In Cash'], 'crore'),
        ('Free Cash Flow', ['Free Cash Flow'], 'crore'),
    ]

    balance_metrics = [
        ('Cash And Short-Term Investments', ['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments'], 'crore'),
        ('Total Assets', ['Total Assets'], 'crore'),
        ('Total Liabilities', ['Total Liabilities Net Minority Interest', 'Total Liabilities'], 'crore'),
        ('Total Equity', ['Stockholders Equity', 'Total Equity Gross Minority Interest'], 'crore'),
        ('Shares Outstanding', ['Share Issued', 'Ordinary Shares Number'], 'crore'),
        ('Price To Book', ['Price To Book', 'Book Value'], 'ratio'),
        ('Return On Assets', ['Return On Assets'], 'percent'),
        ('Return On Capital', ['Return On Capital'], 'percent'),
    ]

    income_annual = _build_statement_section(details.get('financials_df'), income_metrics, 'Income Statement', periodicity='annual')
    income_quarterly = _build_statement_section(details.get('quarterly_financials_df'), income_metrics, 'Income Statement', periodicity='quarterly')

    cashflow_annual = _build_statement_section(details.get('cashflow_df'), cashflow_metrics, 'Cash Flow', periodicity='annual')
    cashflow_quarterly = _build_statement_section(details.get('quarterly_cashflow_df'), cashflow_metrics, 'Cash Flow', periodicity='quarterly')

    balance_annual = _build_statement_section(details.get('balance_sheet_df'), balance_metrics, 'Balance Sheet', periodicity='annual')
    balance_quarterly = _build_statement_section(details.get('quarterly_balance_sheet_df'), balance_metrics, 'Balance Sheet', periodicity='quarterly')

    income_chart_specs = [
        ('Revenue', ['Total Revenue', 'Operating Revenue']),
        ('Net Income', ['Net Income', 'Net Income Common Stockholders']),
    ]
    cashflow_chart_specs = [
        ('Cash From Operations', ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities']),
        ('Free Cash Flow', ['Free Cash Flow']),
    ]
    balance_chart_specs = [
        ('Total Assets', ['Total Assets']),
        ('Total Liabilities', ['Total Liabilities Net Minority Interest', 'Total Liabilities']),
    ]

    income_annual_chart = _build_chart_data(details.get('financials_df'), income_chart_specs, periodicity='annual')
    income_quarterly_chart = _build_chart_data(details.get('quarterly_financials_df'), income_chart_specs, periodicity='quarterly')
    cashflow_annual_chart = _build_chart_data(details.get('cashflow_df'), cashflow_chart_specs, periodicity='annual')
    cashflow_quarterly_chart = _build_chart_data(details.get('quarterly_cashflow_df'), cashflow_chart_specs, periodicity='quarterly')
    balance_annual_chart = _build_chart_data(details.get('balance_sheet_df'), balance_chart_specs, periodicity='annual')
    balance_quarterly_chart = _build_chart_data(details.get('quarterly_balance_sheet_df'), balance_chart_specs, periodicity='quarterly')

    ratios = details.get('financial_ratios', {})
    ratios_view = {
        'market_cap': _format_crore(ratios.get('market_cap')),
        'enterprise_value': _format_crore(ratios.get('enterprise_value')),
        'trailing_pe': _format_plain_number(ratios.get('trailing_pe')),
        'forward_pe': _format_plain_number(ratios.get('forward_pe')),
        'price_to_book': _format_plain_number(ratios.get('price_to_book')),
        'debt_to_equity': _format_plain_number(ratios.get('debt_to_equity')),
        'current_ratio': _format_plain_number(ratios.get('current_ratio')),
        'quick_ratio': _format_plain_number(ratios.get('quick_ratio')),
        'return_on_equity': _format_percent(ratios.get('return_on_equity')),
        'return_on_assets': _format_percent(ratios.get('return_on_assets')),
        'gross_margin': _format_percent(ratios.get('gross_margin')),
        'operating_margin': _format_percent(ratios.get('operating_margin')),
        'profit_margin': _format_percent(ratios.get('profit_margin')),
        'dividend_yield': _format_percent(ratios.get('dividend_yield')),
        'payout_ratio': _format_percent(ratios.get('payout_ratio')),
        'beta': _format_plain_number(ratios.get('beta')),
    }

    context = {
        'page_title': f'Live Company Analytics - {symbol}',
        'symbol': symbol,
        'ticker': details.get('ticker', '-'),
        'company_profile': details.get('company_profile', {}),
        'financial_ratios': ratios_view,
        'income_annual': income_annual,
        'income_quarterly': income_quarterly,
        'income_annual_chart': income_annual_chart,
        'income_quarterly_chart': income_quarterly_chart,
        'cashflow_annual': cashflow_annual,
        'cashflow_quarterly': cashflow_quarterly,
        'cashflow_annual_chart': cashflow_annual_chart,
        'cashflow_quarterly_chart': cashflow_quarterly_chart,
        'balance_annual': balance_annual,
        'balance_quarterly': balance_quarterly,
        'balance_annual_chart': balance_annual_chart,
        'balance_quarterly_chart': balance_quarterly_chart,
        'error': details.get('error'),
    }
    return render(request, 'stock_company_analytics.html', context)

