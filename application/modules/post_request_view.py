from django.shortcuts import render
from django.http import HttpResponse
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def retrieve_marks(request):
    if request.method == "POST":
        # Process the POST data
        srn = request.POST.get("SRN")
        # Perform necessary operations (e.g., save to database)
        marks = {'DSA': 99, 'Compiler Design':88, 'Algorithms':98, 'JAVA':77, 'Python':94 }
        marks = {"SRN": srn, 'Name': 'Rajesh', 'Marks': marks}
        #return marks
        return JsonResponse(marks)
    #else:
        #return JsonResponse({'Result': "Data Not received!"})

@csrf_exempt
def show_marks(request):
    if request.method == "POST":
        # Process the POST data
        srn = request.POST.get("SRN")
        return render(request, "marks_template.html", {'srn':srn})