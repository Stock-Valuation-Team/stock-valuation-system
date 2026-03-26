from django.shortcuts import render
from services.index_service import get_nifty100_constituent_data
from utils.html_utils import db_data_to_html_table


def nifty100_info(request):
    universe_data = get_nifty100_constituent_data()
    html_table_data = db_data_to_html_table(universe_data)
    return render(request, "generic_template_with_table.html", {'page_title': 'NIFTY100 Index','html_table':html_table_data})
