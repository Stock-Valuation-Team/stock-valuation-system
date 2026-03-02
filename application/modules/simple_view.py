from django.http import HttpResponse
from django.http import JsonResponse

# http://127.0.0.1:8000/about_info/
def about_info(request):
    text = """<!DOCTYPE html>
                <html>
                  <body>
                   <h2>Welcome to PES University</h2>
                   <p>People's Education Society University (PESU), is a private university in Bengaluru, India. 
                   </br>Established in 1988, it is focused on the following educational areas: </br>&nbsp;Engineering, </br>&nbsp;Management,
                    </br>&nbsp;Law, </br>&nbsp;Economics, </br>&nbsp;Commerce, </br>&nbsp;Architecture, </br>&nbsp;Design, 
                    </br>&nbsp;Psychology, </br>&nbsp;Arts, </br>&nbsp;Medicine and Life Sciences. </p>
                  </body>
                </html>"""
    return HttpResponse(text)


# URL: http://127.0.0.1:8000/get_stock_info/
def get_stock_info(request):
    price_details = {'High': 384, 'Low': 350, 'Open:': 363, 'Close': 360}
    price_attributes = {'Mkt cap': '2.97LCr', 'P/E ratio': 25.00, '52-wk high:': 555.45, 'Dividend': '0.91%',
                        'Price Info': price_details}
    data = {'Cusip': 165984, "Stock Name": 'PES University', 'Exchange': 'NSE', 'Sector': 'Education',
            'Price Attributes': price_attributes}
    return JsonResponse(data)
