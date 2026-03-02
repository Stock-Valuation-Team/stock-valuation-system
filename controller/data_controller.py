from django.http import HttpResponse
from django.http import JsonResponse
from django.shortcuts import render
from services.holding_service import get_holding_data
from services.holding_service import get_universe_data
from utils.html_utils import db_data_to_html_table

# http://127.0.0.1:8000/show_holdings/
def holdings_info(request):
    holdings_data = get_holding_data()
    html_table_data = db_data_to_html_table(holdings_data)
    text = '<!DOCTYPE html><html><body>' + html_table_data +'</body></html>'
    #return render(request, "marks_template.html", {'srn':srn})
    return render(request, "generic_template_with_table.html", {'page_title': 'Account Holdings','html_table':html_table_data})
    #return HttpResponse(text)

# http://127.0.0.1:8000/show_universe/
def universe_info(request):
    universe_data = get_universe_data()
    html_table_data = db_data_to_html_table(universe_data)
    return render(request, "generic_template_with_table.html", {'page_title': 'Stock Universe','html_table':html_table_data})