from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Inscription, Progression
from .serializers import InscriptionSerializer, ProgressionSerializer


class InscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = InscriptionSerializer

    def get_queryset(self):
        queryset = Inscription.objects.all().select_related('progression')
        etudiant_id = self.request.query_params.get('etudiantId')
        cours_id = self.request.query_params.get('coursId')
        if etudiant_id:
            queryset = queryset.filter(etudiant_id=etudiant_id)
        if cours_id:
            queryset = queryset.filter(cours_id=cours_id)
        return queryset

    def perform_create(self, serializer):
        inscription = serializer.save()
        Progression.objects.create(inscription=inscription)

    @action(detail=True, methods=['get', 'put'], url_path='progress')
    def progress(self, request, pk=None):
        inscription = self.get_object()
        progression, _ = Progression.objects.get_or_create(inscription=inscription)

        if request.method == 'GET':
            return Response(ProgressionSerializer(progression).data)

        serializer = ProgressionSerializer(progression, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
