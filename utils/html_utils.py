
def db_data_to_html_table(db_data):
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
            html_content = html_content + '<tr>'
            for header in headers:
                stock_name = str(dict[header])
                print(dict[header])
                if header != 'symbol':
                    html_content = html_content + '<th>' + stock_name + '</th>'
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
