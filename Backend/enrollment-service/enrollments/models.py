from django.db import models


class Inscription(models.Model):
    etudiant_id = models.BigIntegerField()   # référence au User Service
    cours_id = models.BigIntegerField()      # référence au Course Service
    date_inscription = models.DateField(auto_now_add=True)

    class Meta:
        unique_together = ('etudiant_id', 'cours_id')

    def __str__(self):
        return f"Etudiant {self.etudiant_id} -> Cours {self.cours_id}"


class Progression(models.Model):
    inscription = models.OneToOneField(
        Inscription, on_delete=models.CASCADE, related_name='progression'
    )
    pourcentage = models.FloatField(default=0)

    def __str__(self):
        return f"{self.inscription} : {self.pourcentage}%"
