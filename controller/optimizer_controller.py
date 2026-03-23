from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from services.optimizer_service import get_optimized_portfolio


@csrf_exempt
def optimizer_view(request):
    context = {
        'page_title': 'Portfolio Optimizer',
        'result': None,
        'error': None,
        'strategy': 'traditional',
        'total_value': 100000,
    }

    if request.method == 'POST':
        strategy = request.POST.get('strategy', 'traditional')
        try:
            total_value = float(request.POST.get('total_value', 100000))
        except ValueError:
            total_value = 100000

        context['strategy'] = strategy
        context['total_value'] = int(total_value)

        try:
            result = get_optimized_portfolio(strategy, total_value)
            if result is None:
                context['error'] = 'No historical price data available. Please run the data loader first.'
            else:
                # Prepare weights as sorted list of tuples for the template
                weights_list = sorted(result['weights'].items(), key=lambda x: -x[1])
                result['weights_list'] = [(stock, round(w * 100, 2)) for stock, w in weights_list]
                context['result'] = result
        except ValueError as ve:
            context['error'] = str(ve)
        except ImportError as ie:
            context['error'] = str(ie)
        except Exception as e:
            context['error'] = f'Optimization failed: {str(e)}'

    return render(request, 'optimizer.html', context)
