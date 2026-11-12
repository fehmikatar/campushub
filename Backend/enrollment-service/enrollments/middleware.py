import io

from django.core.handlers.wsgi import LimitedStream


class ChunkedBodyMiddleware:
    """La Gateway envoie les corps en Transfer-Encoding: chunked, sans Content-Length.
    Django ne lit alors rien : on lit le corps complet et on renseigne Content-Length."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        chunked = 'chunked' in request.META.get('HTTP_TRANSFER_ENCODING', '').lower()
        if chunked and not request.META.get('CONTENT_LENGTH'):
            body = request.META['wsgi.input'].read()
            request.META['CONTENT_LENGTH'] = str(len(body))
            request._stream = LimitedStream(io.BytesIO(body), len(body))
        return self.get_response(request)