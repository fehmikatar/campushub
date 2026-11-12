from rest_framework import serializers
from .models import Inscription, Progression


class ProgressionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Progression
        fields = ['id', 'inscription', 'pourcentage']
        read_only_fields = ['inscription']

    def validate_pourcentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Le pourcentage doit être entre 0 et 100.")
        return value


class InscriptionSerializer(serializers.ModelSerializer):
    progression = ProgressionSerializer(read_only=True)

    class Meta:
        model = Inscription
        fields = ['id', 'etudiant_id', 'cours_id', 'date_inscription', 'progression']
        read_only_fields = ['etudiant_id', 'date_inscription']
