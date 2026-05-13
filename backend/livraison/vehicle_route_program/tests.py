from django.test import TestCase
from unittest.mock import patch, MagicMock
from django.http import HttpRequest
import json


class MarkDeliveredTest(TestCase):
    def setUp(self):
        from django.views.decorators.csrf import csrf_exempt
        from .views import mark_delivered
        self.view = mark_delivered

    def test_get_method_not_allowed(self):
        request = HttpRequest()
        request.method = "GET"
        request._body = b""
        response = self.view(request)
        self.assertEqual(response.status_code, 405)
        data = json.loads(response.content)
        self.assertFalse(data["success"])

    def test_missing_id(self):
        request = HttpRequest()
        request.method = "POST"
        request._body = json.dumps({}).encode()
        request.META["CONTENT_TYPE"] = "application/json"
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertFalse(data["success"])

    def test_invalid_json(self):
        request = HttpRequest()
        request.method = "POST"
        request._body = b"not-json"
        request.META["CONTENT_TYPE"] = "application/json"
        response = self.view(request)
        self.assertEqual(response.status_code, 400)

    @patch("vehicle_route_program.views.deliveries_collection")
    def test_article_not_found(self, mock_collection):
        mock_collection.update_one.return_value = MagicMock(matched_count=0)
        request = HttpRequest()
        request.method = "POST"
        request._body = json.dumps({"id": "507f1f77bcf86cd799439011"}).encode()
        request.META["CONTENT_TYPE"] = "application/json"
        response = self.view(request)
        self.assertEqual(response.status_code, 404)
        data = json.loads(response.content)
        self.assertFalse(data["success"])

    @patch("vehicle_route_program.views.deliveries_collection")
    def test_successful_mark(self, mock_collection):
        mock_collection.update_one.return_value = MagicMock(matched_count=1)
        request = HttpRequest()
        request.method = "POST"
        request._body = json.dumps({"id": "507f1f77bcf86cd799439011", "livre": True}).encode()
        request.META["CONTENT_TYPE"] = "application/json"
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data["success"])

    def test_invalid_object_id(self):
        request = HttpRequest()
        request.method = "POST"
        request._body = json.dumps({"id": "invalid-id"}).encode()
        request.META["CONTENT_TYPE"] = "application/json"
        response = self.view(request)
        self.assertEqual(response.status_code, 400)


@patch("vehicle_route_program.views.httpx")
@patch("vehicle_route_program.views.deliveries_collection")
class SendFastApiResultTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from django.contrib.auth.models import User
        from .views import send_fast_api_result
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.view = send_fast_api_result

    def test_no_data(self, mock_collection, mock_httpx):
        request = self.factory.post("/api/vrp/send/result", {}, format="json")
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=self.user)
        response = self.view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Aucune donnée", str(response.data.get("error", "")))

    def test_successful_send(self, mock_collection, mock_httpx):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_httpx.post.return_value = mock_response

        request = self.factory.post("/api/vrp/send/result", {"camion1": "data"}, format="json")
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=self.user)
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

    def test_fastapi_error(self, mock_collection, mock_httpx):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal error"
        mock_httpx.post.return_value = mock_response

        request = self.factory.post("/api/vrp/send/result", {"camion1": "data"}, format="json")
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=self.user)
        response = self.view(request)
        self.assertEqual(response.status_code, 500)

    def test_fastapi_unreachable(self, mock_collection, mock_httpx):
        mock_httpx.post.side_effect = Exception("Connection refused")

        request = self.factory.post("/api/vrp/send/result", {"camion1": "data"}, format="json")
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=self.user)
        response = self.view(request)
        self.assertEqual(response.status_code, 500)
