
def db_data_to_html_table(db_data, symbol_link_prefix=None):
    print('Converting Db data to HTML table..')

    if not db_data:
        print('db_data_to_html_table: No data received from DB!')
    else:
        print('Received ', len(db_data), ' db rows for processing..')
        # get_headers from dict
        first_row = db_data[0]
        headers = []
        for dict_entry in first_row:
            headers.append(dict_entry)
        print('List of columns retrived: ', headers)
        html_content = '<table>'
        # Add header to table
        html_content = html_content + '<tr>'
        for col in headers:
            #html_content = html_content + '<th><b>' + col.upper().replace("_", " ") + '</th>'
            html_content = html_content + '<th><b>' + col + '</th>'
        #if with_link == True:
        #html_content = html_content + '<th><b>' + 'Link' + '</th>'
        html_content = html_content + '</tr>'

        # Add table contents
        for dict in db_data:
            row_symbol = str(dict.get('symbol', '-'))
            if symbol_link_prefix and row_symbol not in ('-', 'TOTAL'):
                row_url = symbol_link_prefix + row_symbol + '/'
                html_content = html_content + '<tr style="cursor:pointer;" onclick="window.location.href=\'' + row_url + '\'">'
            else:
                html_content = html_content + '<tr>'
            for header in headers:
                value = dict[header]
                stock_name = '-' if value is None else str(value)
                print(value)
                if header != 'symbol':
                    html_content = html_content + '<th>' + stock_name + '</th>'
                else:
                    if stock_name == 'TOTAL' or stock_name == '-':
                        html_content = html_content + '<th>' + stock_name + '</th>'
                    elif symbol_link_prefix:
                        html_content = html_content + '<th>' + '<a href="' + symbol_link_prefix + stock_name + '/">' + stock_name + '</a>' + '</th>'
                    else:
                        html_content = html_content + '<th>' + '<a target="_blank" href="https://www.screener.in/company/' \
                                       + stock_name + '/consolidated/">' + stock_name + '</a>' + '</th>'

            #html_content = html_content + '<th>' + 'https://www.screener.in/company/ONGC/consolidated/' + '</th>'
            html_content = html_content + '</tr>'
        html_content = html_content + '</table>'
        return html_content


if __name__ == "__main__":
    test_data = [{'symbol': 'HDFCBANK', 'stock': 'HDFC Bank Ltd'}, {'symbol': 'SUZLON', 'stock': 'Suzlon Energy Ltd'}, {'symbol': 'TMPV', 'stock': 'Tata Motors Passenger Vhcls Ltd'}]
    html_table = db_data_to_html_table(test_data)
    print(html_table)
