
import csv
import io
from datetime import datetime, date

from django.shortcuts import render, redirect

from databases.update_table_data import save_data, clear_table_data


def _normalize_col(col_name):
    return str(col_name or '').strip().lower().replace(' ', '').replace('-', '').replace('_', '')


def _extract(row, aliases, default=''):
    for alias in aliases:
        value = row.get(alias)
        if value is not None and str(value).strip() != '':
            return str(value).strip()
    return default


def _parse_buy_date(raw_date):
    raw = str(raw_date or '').strip()
    if raw == '':
        return date.today().isoformat()

    date_formats = ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y']
    for date_fmt in date_formats:
        try:
            return datetime.strptime(raw, date_fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f'Invalid buy_date format: {raw}. Use YYYY-MM-DD.')


def _parse_portfolio_csv(uploaded_file):
    try:
        content = uploaded_file.read().decode('utf-8-sig')
    except Exception as ex:
        raise ValueError(f'Could not read uploaded file: {ex}')

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError('CSV has no headers. Add a header row first.')

    normalized_headers = {_normalize_col(h): h for h in reader.fieldnames}
    normalized_rows = []
    for src_row in reader:
        row = {}
        for key, value in src_row.items():
            row[_normalize_col(key)] = value
        normalized_rows.append(row)

    if not normalized_rows:
        raise ValueError('CSV has no data rows.')

    holdings_rows = []
    for idx, row in enumerate(normalized_rows, start=2):
        symbol = _extract(row, ['symbol', 'ticker'])
        stock = _extract(row, ['stock', 'company', 'companyname', 'name'], default=symbol)
        qty_raw = _extract(row, ['qty', 'quantity'])
        buy_price_raw = _extract(row, ['buyprice', 'price', 'avgprice', 'purchaseprice'])
        buy_date = _parse_buy_date(_extract(row, ['buydate', 'date', 'purchasedate']))
        exchange = _extract(row, ['exchange'], default='NSE').upper()
        strategy = _extract(row, ['strategy'], default='Uploaded')

        if symbol == '':
            # Skip blank lines
            if all(str(v or '').strip() == '' for v in row.values()):
                continue
            raise ValueError(f'Missing symbol at CSV line {idx}.')
        if qty_raw == '':
            raise ValueError(f'Missing qty at CSV line {idx} for symbol {symbol}.')
        if buy_price_raw == '':
            raise ValueError(f'Missing buy_price at CSV line {idx} for symbol {symbol}.')

        try:
            qty = int(float(qty_raw))
        except ValueError:
            raise ValueError(f'Invalid qty at CSV line {idx}: {qty_raw}')

        try:
            buy_price = int(round(float(buy_price_raw)))
        except ValueError:
            raise ValueError(f'Invalid buy_price at CSV line {idx}: {buy_price_raw}')

        if exchange not in ('NSE', 'BSE'):
            exchange = 'NSE'

        holdings_rows.append((
            symbol.upper(),
            stock,
            qty,
            buy_date,
            buy_price,
            exchange,
            strategy,
        ))

    if not holdings_rows:
        raise ValueError('No valid portfolio rows found in CSV.')

    return holdings_rows


def index(request):
    context = {
        'upload_error': None,
        'upload_message': None,
    }

    if request.method == 'POST':
        upload_file = request.FILES.get('portfolio_file')
        if upload_file is None:
            context['upload_error'] = 'Please choose a portfolio CSV file.'
        else:
            try:
                holdings_rows = _parse_portfolio_csv(upload_file)
                clear_table_data('holdings')
                insert_stmt = (
                    'INSERT INTO holdings '
                    '(symbol, stock, qty, buy_date, buy_price, exchange, strategy) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s)'
                )
                save_data(insert_stmt, holdings_rows)
                return redirect('/show_holdings/')
            except Exception as ex:
                context['upload_error'] = str(ex)

    return render(request, "index.html", context)


def upload_portfolio(request):
    context = {
        'upload_error': None,
        'upload_message': None,
    }

    if request.method == 'POST':
        upload_file = request.FILES.get('portfolio_file')
        if upload_file is None:
            context['upload_error'] = 'Please choose a portfolio CSV file.'
        else:
            try:
                holdings_rows = _parse_portfolio_csv(upload_file)
                clear_table_data('holdings')
                insert_stmt = (
                    'INSERT INTO holdings '
                    '(symbol, stock, qty, buy_date, buy_price, exchange, strategy) '
                    'VALUES (%s, %s, %s, %s, %s, %s, %s)'
                )
                save_data(insert_stmt, holdings_rows)
                return redirect('/show_holdings/')
            except Exception as ex:
                context['upload_error'] = str(ex)

    return render(request, "upload_portfolio.html", context)