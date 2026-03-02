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
from controller.data_controller import holdings_info, universe_info

urlpatterns = [
    path("admin/", admin.site.urls),
    path('', app_view.index, name='index'),
    path("show_holdings/", holdings_info, name = 'holdings_info'),
    path("show_universe/", universe_info, name = 'universe_info'),

]
