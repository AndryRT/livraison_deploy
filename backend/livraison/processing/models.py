from django.db import models

class Department(models.Model):
    """Représente un département au sein de l'organisation."""
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        """Retourne le nom du département."""
        return self.name
