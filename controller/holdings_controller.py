from django.shortcuts import render
from services.holding_service import get_holding_data, get_holding_analytics_data
from utils.html_utils import db_data_to_html_table


def holdings_info(request):
    holdings_data = get_holding_data()
    html_table_data = db_data_to_html_table(holdings_data)
    return render(request, "generic_template_with_table.html",
                  {'page_title': 'Account Holdings', 'html_table': html_table_data})


def holdings_analytics(request):
    holdings_data = get_holding_analytics_data()
    html_table_data = db_data_to_html_table(holdings_data)
    return render(request, "generic_template_with_table.html",
                  {'page_title': 'Account Holdings', 'html_table': html_table_data})
