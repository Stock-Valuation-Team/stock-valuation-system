
from django.shortcuts import render


def index(request):
    # other view code here
    return render(request, "index.html", {})