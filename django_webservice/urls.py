"""
URL configuration for django_webservice project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path

from application.modules import simple_view
from application.modules import app_view
from application.modules import post_request_view
from controller.holdings_controller import holdings_info, holdings_analytics, holdings_recommendations
from controller.universe_controller import universe_analytics, universe_info_nifty100, \
    universe_info_nifty50, universe_info_custom, universe_info_combined
from controller.Index_controller import nifty100_info
from controller.optimizer_controller import optimizer_view


urlpatterns = [
    path("admin/", admin.site.urls),
    path('', app_view.index, name='index'),
    path("upload_portfolio/", app_view.upload_portfolio, name='upload_portfolio'),
    path("upload_portfolio/sample_csv/", app_view.download_sample_portfolio, name='download_sample_portfolio'),
    path("show_holdings/", holdings_info, name = 'holdings_info'),
    path("show_holdings_recommendations/", holdings_recommendations, name='holdings_recommendations'),
    path("show_holdings_analytics/", holdings_analytics, name = 'holdings_analytics'),
    path("universe_info_nifty100/", universe_info_nifty100, name='universe_info_nifty100'),
    path("universe_info_nifty50/", universe_info_nifty50, name='universe_info_nifty50'),
    path("universe_info_custom/", universe_info_custom, name='universe_info_custom'),
    path("universe_info_combined/", universe_info_combined, name='universe_info_combined'),

    path("", universe_analytics, name = 'universe_analytics'),
    path("nifty100_data/", nifty100_info, name = 'nifty100_info'),
    path("nifty50_data/", nifty100_info, name = 'nifty50_info'),
    path("optimizer/", optimizer_view, name = 'optimizer'),

]
