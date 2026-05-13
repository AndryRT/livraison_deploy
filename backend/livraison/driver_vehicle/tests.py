from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status
from django.contrib.auth.models import User
from unittest.mock import patch, MagicMock
from .views import vehicules_view, ajouter_vehicule, modifier_vehicule, get_vehicle_active, get_data_react, get_all_history
from .serializers import VehiculeSerializer


class VehiculeSerializerTest(TestCase):
    def test_serializer_valid_data(self):
        data = {
            "Vehicule": "Camion A",
            "Type": "Camion",
            "Immatriculation": "1234ABC",
            "Tonnage": "5T",
            "Dimension": "4.2x2.0x2.0",
            "Nom": "Jean",
            "Contact": "0123456789",
            "Poste": "Chauffeur",
            "Mat": 1,
            "active": True,
        }
        serializer = VehiculeSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_missing_required_field(self):
        data = {"Vehicule": "Camion A"}
        serializer = VehiculeSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("Immatriculation", serializer.errors)

    def test_serializer_default_active(self):
        data = {"Immatriculation": "5678DEF"}
        serializer = VehiculeSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertTrue(serializer.validated_data.get("active", True))

    def test_serializer_empty_optional_fields(self):
        data = {"Immatriculation": "9999ZZZ"}
        serializer = VehiculeSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data.get("Mat"), 0)


@patch("driver_vehicle.views.lire_json")
@patch("driver_vehicle.views.ecrire_json")
class VehiculeViewsTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_vehicules_view_get(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Immatriculation": "1234ABC", "Vehicule": "Camion A", "Mat": 1}
        ]
        request = self.factory.get("/api/vehicules/")
        force_authenticate(request, user=self.user)
        response = vehicules_view(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_vehicules_view_post_duplicate_immat(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Immatriculation": "1234ABC", "Vehicule": "Camion A", "Mat": 1}
        ]
        request = self.factory.post("/api/vehicules/", {"Immatriculation": "1234ABC"}, format="json")
        force_authenticate(request, user=self.user)
        response = vehicules_view(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("existe déjà", str(response.data.get("error", "")))

    def test_vehicules_view_post_ok(self, mock_ecrire, mock_lire):
        mock_lire.return_value = []
        request = self.factory.post("/api/vehicules/", {"Immatriculation": "NEW001"}, format="json")
        force_authenticate(request, user=self.user)
        response = vehicules_view(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_modifier_vehicule_not_found(self, mock_ecrire, mock_lire):
        mock_lire.return_value = []
        request = self.factory.get("/api/vehicules/999/")
        force_authenticate(request, user=self.user)
        response = modifier_vehicule(request, pk=999)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_modifier_vehicule_get(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Mat": 1, "Immatriculation": "ABC123", "Vehicule": "Camion X"}
        ]
        request = self.factory.get("/api/vehicules/1/")
        force_authenticate(request, user=self.user)
        response = modifier_vehicule(request, pk=1)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["Immatriculation"], "ABC123")

    def test_modifier_vehicule_put(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Mat": 1, "Immatriculation": "ABC123", "Vehicule": "Camion X"}
        ]
        request = self.factory.put("/api/vehicules/1/", {"Vehicule": "Camion Y"}, format="json")
        force_authenticate(request, user=self.user)
        response = modifier_vehicule(request, pk=1)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["Vehicule"], "Camion Y")

    def test_modifier_vehicule_delete(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Mat": 1, "Immatriculation": "ABC123", "Vehicule": "Camion X"}
        ]
        request = self.factory.delete("/api/vehicules/1/")
        force_authenticate(request, user=self.user)
        response = modifier_vehicule(request, pk=1)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_modifier_vehicule_delete_all_by_immat(self, mock_ecrire, mock_lire):
        mock_lire.return_value = [
            {"Mat": 1, "Immatriculation": "ABC123"},
            {"Mat": 2, "Immatriculation": "ABC123"},
            {"Mat": 3, "Immatriculation": "XYZ999"},
        ]
        request = self.factory.delete("/api/vehicules/1/")
        force_authenticate(request, user=self.user)
        response = modifier_vehicule(request, pk=1)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        args, _ = mock_ecrire.call_args
        remaining = args[0]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["Mat"], 3)

    def test_ajouter_vehicule(self, mock_ecrire, mock_lire):
        mock_lire.return_value = []
        request = self.factory.post("/api/vehicules/ajouter/", {"Immatriculation": "NEW002"}, format="json")
        force_authenticate(request, user=self.user)
        response = ajouter_vehicule(request)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_ajouter_vehicule_invalid(self, mock_ecrire, mock_lire):
        request = self.factory.post("/api/vehicules/ajouter/", {}, format="json")
        force_authenticate(request, user=self.user)
        response = ajouter_vehicule(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@patch("driver_vehicle.views.MongoClient")
class VehicleActiveTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_get_vehicle_active_success(self, mock_mongo):
        mock_collection = MagicMock()
        mock_collection.find.return_value = [
            {"_id": MagicMock(__str__=lambda s: "abc123"), "Immatriculation": "VH01", "Type": "Camion", "Vehicule": "Véhicule A", "Dimension": "4x2x2", "Tonnage": "5T", "volume": 16},
            {"_id": MagicMock(__str__=lambda s: "def456"), "Immatriculation": "VH02", "Type": "Camionnette", "Vehicule": "Véhicule B", "Dimension": "3x1.5x1.5", "Tonnage": "2T", "volume": 6.75},
        ]
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db

        request = self.factory.get("/api/vehicules/active/")
        force_authenticate(request, user=self.user)
        response = get_vehicle_active(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["vehicles"]), 2)

    def test_get_vehicle_active_empty(self, mock_mongo):
        mock_collection = MagicMock()
        mock_collection.find.return_value = []
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db

        request = self.factory.get("/api/vehicules/active/")
        force_authenticate(request, user=self.user)
        response = get_vehicle_active(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["vehicles"]), 0)

    def test_get_vehicle_active_exception(self, mock_mongo):
        mock_mongo.side_effect = Exception("DB down")
        request = self.factory.get("/api/vehicules/active/")
        force_authenticate(request, user=self.user)
        response = get_vehicle_active(request)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)


@patch("driver_vehicle.views.MongoClient")
class GetDataReactTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_get_data_react_valid(self, mock_mongo):
        mock_collection = MagicMock()
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db

        request = self.factory.post("/api/livraisons/disponible/", {"vehicules_disponibles": ["VH01", "VH02"], "date": "2025-06-01"}, format="json")
        force_authenticate(request, user=self.user)
        response = get_data_react(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_data_react_invalid_list(self, mock_mongo):
        request = self.factory.post("/api/livraisons/disponible/", {"vehicules_disponibles": "NOT_A_LIST"}, format="json")
        force_authenticate(request, user=self.user)
        response = get_data_react(request)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_data_react_empty_list(self, mock_mongo):
        mock_collection = MagicMock()
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db

        request = self.factory.post("/api/livraisons/disponible/", {"vehicules_disponibles": []}, format="json")
        force_authenticate(request, user=self.user)
        response = get_data_react(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


@patch("driver_vehicle.views.get_all_product_history")
class GetAllHistoryTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_get_all_history_returns_data(self, mock_history):
        mock_history.return_value = [{"_id": "1", "Name": "Article A", "state": "done"}]
        request = self.factory.get("/api/history/")
        force_authenticate(request, user=self.user)
        response = get_all_history(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_get_all_history_empty(self, mock_history):
        mock_history.return_value = []
        request = self.factory.get("/api/history/")
        force_authenticate(request, user=self.user)
        response = get_all_history(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
