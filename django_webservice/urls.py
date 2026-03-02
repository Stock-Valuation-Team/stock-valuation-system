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
from controller.holdings_controller import holdings_info

urlpatterns = [
    path("admin/", admin.site.urls),
    path("about_info/", simple_view.about_info, name = 'about_info'),
    path("get_stock_info/", simple_view.get_stock_info, name = 'get_stock_info'),
    path('', app_view.index, name='index'),
    path("retrieve_marks/", post_request_view.retrieve_marks, name = 'retrieve_marks'),
    path("show_marks/", post_request_view.show_marks, name = 'show_marks'),
    path("show_holdings/", holdings_info, name = 'holdings_info'),

]
