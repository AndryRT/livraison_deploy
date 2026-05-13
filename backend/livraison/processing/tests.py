from django.test import TestCase
from unittest.mock import patch, MagicMock
from .models import Department


class DepartmentModelTest(TestCase):
    def test_create_department(self):
        dept = Department.objects.create(name="Logistique")
        self.assertEqual(dept.name, "Logistique")
        self.assertEqual(str(dept), "Logistique")

    def test_unique_name(self):
        Department.objects.create(name="Logistique")
        with self.assertRaises(Exception):
            Department.objects.create(name="Logistique")

    def test_str_representation(self):
        dept = Department.objects.create(name="Transport")
        self.assertEqual(str(dept), "Transport")
