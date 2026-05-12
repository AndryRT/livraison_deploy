from rest_framework import serializers

class VehiculeSerializer(serializers.Serializer):
    Vehicule = serializers.CharField(required=False, allow_blank=True)
    Type = serializers.CharField(allow_blank=True, required=False)
    Immatriculation = serializers.CharField()
    Tonnage = serializers.CharField(allow_blank=True, required=False)
    Dimension = serializers.CharField(allow_blank=True, required=False)
    Nom = serializers.CharField(required=False, allow_blank=True)
    Contact = serializers.CharField(required=False, allow_blank=True)
    Poste = serializers.CharField(required=False, allow_blank=True)
    Mat = serializers.IntegerField(required=False, default=0)
    active = serializers.BooleanField(default=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
