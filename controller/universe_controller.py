from django.shortcuts import render
from services.holding_service import get_universe_data
from utils.html_utils import db_data_to_html_table

# http://127.0.0.1:8000/show_universe/
def universe_info(request):
    universe_data = get_universe_data()
    html_table_data = db_data_to_html_table(universe_data)
    return render(request, "generic_template_with_table.html", {'page_title': 'Stock Universe','html_table':html_table_data})



def universe_analytics(request):
    return render(request, "yet_to_be_implemented.html", {})