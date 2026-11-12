import uuid

from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import Inscription, Progression
from .permissions import IsAuthenticatedJWT
from .serializers import InscriptionSerializer, ProgressionSerializer


class InscriptionViewSet(mixins.CreateModelMixin,
                         mixins.ListModelMixin,
                         mixins.RetrieveModelMixin,
                         mixins.DestroyModelMixin,
                         viewsets.GenericViewSet):
    serializer_class = InscriptionSerializer
    permission_classes = [IsAuthenticatedJWT]

    def get_queryset(self):
        qs = Inscription.objects.all().select_related('progression').order_by('id')
        user = self.request.user
        params = self.request.query_params
        if user.role == 'ETUDIANT':
            qs = qs.filter(etudiant_id=user.id)       # un étudiant ne voit que les siennes
        elif params.get('etudiantId'):
            try:
                etudiant_id = uuid.UUID(params['etudiantId'])
            except ValueError:
                raise ValidationError({'etudiantId': 'UUID invalide.'})
            qs = qs.filter(etudiant_id=etudiant_id)
        if params.get('coursId'):
            qs = qs.filter(cours_id=params['coursId'])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role != 'ETUDIANT':
            raise PermissionDenied("Seul un étudiant peut s'inscrire à un cours.")
        cours_id = serializer.validated_data['cours_id']
        if Inscription.objects.filter(etudiant_id=user.id, cours_id=cours_id).exists():
            raise ValidationError({'detail': 'Déjà inscrit à ce cours.'})
        inscription = serializer.save(etudiant_id=user.id)    # l'id vient du token
        Progression.objects.create(inscription=inscription)

    def perform_destroy(self, instance):
        if self.request.user.role == 'ENSEIGNANT':
            raise PermissionDenied("Action réservée à l'étudiant concerné ou à un administrateur.")
        instance.delete()

    @action(detail=True, methods=['get', 'put'], url_path='progress')
    def progress(self, request, pk=None):
        inscription = self.get_object()
        progression, _ = Progression.objects.get_or_create(inscription=inscription)
        if request.method == 'GET':
            return Response(ProgressionSerializer(progression).data)
        if request.user.role != 'ETUDIANT':
            raise PermissionDenied("Seul l'étudiant peut mettre à jour sa progression.")
        serializer = ProgressionSerializer(progression, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
