from django.http import HttpResponse
from django.http import JsonResponse

# http://127.0.0.1:8000/about_info/
def holdings_info(request):
    text = """<!DOCTYPE html>
                 <html>
                     <body>
                     <table>
                      <tr>
                        <th>Company</th>
                        <th>Contact</th>
                        <th>Country</th>
                      </tr>
                      <tr>
                        <td>Alfreds Futterkiste</td>
                        <td>Maria Anders</td>
                        <td>Germany</td>
                      </tr>
                      <tr>
                        <td>Centro comercial Moctezuma</td>
                        <td>Francisco Chang</td>
                        <td>Mexico</td>
                      </tr>
                    </table>
                  </body>
                </html>"""
    return HttpResponse(text)