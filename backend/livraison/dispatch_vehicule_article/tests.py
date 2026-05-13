from django.test import TestCase
from unittest.mock import patch, MagicMock
import numpy as np
import json
from .utils import (
    parse_weight, parse_volume, calculer_volume, ajouter_volume,
    retrouve_rn, generate_tuples, fitness, evaluate_population,
    tournament_selection, crossover, mutate, get_vehicle_data_json,
    get_full_article_data
)
import pandas as pd


class ParseWeightTest(TestCase):
    def test_parse_tonnes(self):
        self.assertEqual(parse_weight("5T"), 5.0)

    def test_parse_tonnes_with_decimal(self):
        self.assertEqual(parse_weight("3.5T"), 3.5)

    def test_parse_tonnes_comma(self):
        self.assertEqual(parse_weight("2,5T"), 2.5)

    def test_parse_kg_without_unit(self):
        result = parse_weight("1500")
        self.assertAlmostEqual(result, 1500.0)


class ParseVolumeTest(TestCase):
    def test_standard_dimensions(self):
        volume = parse_volume("4.2 x 2.0 x 2.0")
        self.assertAlmostEqual(volume, 16.8)

    def test_dimensions_with_commas(self):
        volume = parse_volume("4,2 x 2,0 x 2,0")
        self.assertAlmostEqual(volume, 16.8)

    def test_dimensions_with_m_suffix(self):
        volume = parse_volume("4m x 2m x 2m")
        self.assertAlmostEqual(volume, 16.0)

    def test_invalid_dimensions(self):
        volume = parse_volume("invalid")
        self.assertEqual(volume, 0.0)

    def test_empty_string(self):
        volume = parse_volume("")
        self.assertEqual(volume, 0.0)


class CalculerVolumeTest(TestCase):
    def test_valid_dimensions(self):
        vol = calculer_volume("4.2 x 2.0 x 2.0")
        self.assertAlmostEqual(vol, 16.8)

    def test_unicode_multiplication_sign(self):
        vol = calculer_volume("4.2×2.0×2.0")
        self.assertAlmostEqual(vol, 16.8)

    def test_none_input(self):
        vol = calculer_volume(None)
        self.assertIsNone(vol)

    def test_m_with_digits(self):
        vol = calculer_volume("4m20 x 2m x 2m")
        self.assertIsNotNone(vol)


class AjouterVolumeTest(TestCase):
    def test_adds_volume_to_camions(self):
        camions = [
            {"Immatriculation": "ABC", "Dimension": "4.2 x 2.0 x 2.0"},
            {"Immatriculation": "XYZ", "Dimension": "3.0 x 1.5 x 1.5"},
        ]
        result = ajouter_volume(camions)
        self.assertAlmostEqual(result[0]["volume_m3"], 16.8)
        self.assertAlmostEqual(result[1]["volume_m3"], 6.75)

    def test_missing_dimension_default(self):
        camions = [{"Immatriculation": "ABC"}]
        result = ajouter_volume(camions)
        self.assertEqual(result[0]["volume_m3"], 0.0)


class RetrouveRNTest(TestCase):
    def setUp(self):
        self.axes_data = {
            "RN1": ["Antananarivo", "Ambohimanarina"],
            "RN2": ["Toamasina", "Brickaville"],
            "RN4": ["Mahajanga", "Maevatanana"],
        }

    def test_exact_match(self):
        result = retrouve_rn("Antananarivo", self.axes_data)
        self.assertEqual(result, "RN1")

    def test_fuzzy_match(self):
        result = retrouve_rn("Tananarive", self.axes_data)
        self.assertIn(result, ["RN1", "RN2", "RN4"])

    def test_no_match_empty_axes(self):
        result = retrouve_rn("Antananarivo", {})
        self.assertIsNone(result)

class GenerateTuplesTest(TestCase):
    def test_generates_tuples_from_string(self):
        df = pd.DataFrame({
            "Name": ["ArticleA", "ArticleB"],
            "Incompatible_Articles": ["ArticleB", "ArticleA"],
        })
        tuples = generate_tuples(df)
        self.assertIn(("ArticleA", "ArticleB"), tuples)
        self.assertIn(("ArticleB", "ArticleA"), tuples)

    def test_empty_incompatible_column(self):
        df = pd.DataFrame({
            "Name": ["ArticleA"],
            "Incompatible_Articles": [""],
        })
        tuples = generate_tuples(df)
        self.assertEqual(len(tuples), 0)

    def test_list_incompatible_column(self):
        df = pd.DataFrame({
            "Name": ["ArticleA"],
            "Incompatible_Articles": [["ArticleB", "ArticleC"]],
        })
        tuples = generate_tuples(df)
        self.assertEqual(len(tuples), 2)

    def test_nan_incompatible(self):
        df = pd.DataFrame({
            "Name": ["ArticleA"],
            "Incompatible_Articles": [None],
        })
        df = df.fillna('')
        tuples = generate_tuples(df.fillna(''))
        self.assertEqual(len(tuples), 0)


class FitnessFunctionTest(TestCase):
    def setUp(self):
        self.n_camions = 2
        self.n_articles = 4
        self.n_axes = 2
        self.camion_max_weights = np.array([10000.0, 10000.0])
        self.camion_max_volumes = np.array([50.0, 50.0])
        self.article_weights = np.array([1000.0, 2000.0, 1500.0, 500.0])
        self.article_volumes = np.array([5.0, 10.0, 8.0, 3.0])
        self.article_quantities = np.array([1, 1, 1, 1], dtype=np.int32)
        self.article_axes = np.array([0, 1, 0, 1], dtype=np.int32)
        self.incompatibility_pairs = np.array([(0, 2)], dtype=np.int64).reshape(-1, 2)

    def test_fitness_valid_assignment(self):
        ind = np.array([0, 1, 0, 1], dtype=np.int64)
        score = fitness(
            ind, self.camion_max_weights, self.camion_max_volumes,
            self.article_weights, self.article_volumes, self.article_quantities,
            self.article_axes, self.incompatibility_pairs, self.n_axes
        )
        self.assertIsInstance(score, float)

    def test_fitness_incompatibility_penalty(self):
        ind = np.array([0, 0, 0, 0], dtype=np.int64)
        score = fitness(
            ind, self.camion_max_weights, self.camion_max_volumes,
            self.article_weights, self.article_volumes, self.article_quantities,
            self.article_axes, self.incompatibility_pairs, self.n_axes
        )
        self.assertGreater(score, 0)

    def test_fitness_same_axis_penalty(self):
        ind = np.array([0, 0, 1, 1], dtype=np.int64)
        score = fitness(
            ind, self.camion_max_weights, self.camion_max_volumes,
            self.article_weights, self.article_volumes, self.article_quantities,
            self.article_axes, self.incompatibility_pairs, self.n_axes
        )
        self.assertGreater(score, 0)


class GeneticOperatorsTest(TestCase):
    def test_tournament_selection(self):
        pop = np.array([[0, 1], [1, 0], [1, 1]], dtype=np.int64)
        scores = np.array([100.0, 50.0, 200.0])
        selected = tournament_selection(pop, scores, k=2)
        self.assertIn(selected.tolist(), pop.tolist())

    def test_crossover(self):
        p1 = np.array([0, 1, 0, 1, 0], dtype=np.int64)
        p2 = np.array([1, 0, 1, 0, 1], dtype=np.int64)
        child = crossover(p1, p2)
        self.assertEqual(len(child), 5)
        self.assertTrue(np.all(child[:1] == p1[:1]) or np.all(child[:2] == p1[:2]))

    def test_mutate(self):
        ind = np.zeros(20, dtype=np.int64)
        mutated = mutate(ind, 3, rate=0.5)
        self.assertEqual(len(mutated), 20)


@patch("dispatch_vehicule_article.utils.MongoClient")
class MongoUtilsTest(TestCase):
    def test_get_vehicle_data_json_empty(self, mock_mongo):
        mock_collection = MagicMock()
        mock_collection.find.return_value = []
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db
        result = json.loads(get_vehicle_data_json())
        self.assertEqual(result, [])

    def test_get_vehicle_data_json_with_data(self, mock_mongo):
        mock_find = MagicMock()
        mock_find.find.return_value = [
            {"vehicules_disponibles": [{"Immatriculation": "VH01"}]}
        ]
        mock_db = MagicMock()
        mock_db.vehicules_disponibles_frontend = mock_find
        mock_mongo.return_value.__getitem__.return_value = mock_db
        result = json.loads(get_vehicle_data_json())
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["Immatriculation"], "VH01")

    def test_get_vehicle_data_json_exception(self, mock_mongo):
        mock_mongo.side_effect = Exception("Connection error")
        result = json.loads(get_vehicle_data_json())
        self.assertEqual(result, [])

    def test_get_full_article_data_empty(self, mock_mongo):
        mock_collection = MagicMock()
        mock_collection.find.return_value = []
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db
        result = json.loads(get_full_article_data())
        self.assertEqual(result, [])

    def test_get_full_article_data_with_metrics(self, mock_mongo):
        mock_collection = MagicMock()
        mock_collection.find.return_value = [
            {
                "_id": "1",
                "Name": "Article A",
                "quantity": 10,
                "Metrics": {"poids_kg": 5.0, "volume_livraison_m3": 0.5},
                "client_name": "Client A",
                "number": "0123",
                "lieu": "Antananarivo",
            }
        ]
        mock_db = MagicMock()
        mock_db.__getitem__.return_value = mock_collection
        mock_mongo.return_value.__getitem__.return_value = mock_db
        result = json.loads(get_full_article_data())
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result[0]["poids_kg"], 5.0)
