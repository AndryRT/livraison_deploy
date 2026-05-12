import logging
from datetime import datetime
from time import sleep
from typing import Tuple, Optional, List, Dict, Any
from collections import Counter
from fuzzywuzzy import fuzz
import googlemaps
from pymongo import MongoClient, GEOSPHERE
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from rich import print as rprint
import numpy as np

# =========================
# 🔧 CONFIGURATION
# =========================
API_KEY = 'AIzaSyBPp50ByhH43bsf5ayKyQjUg7jbYagwSKY'
MONGO_URI = 'mongodb://127.0.0.1:27017'
DB_NAME = 'livraison'
COLLECTION_NAME = 'ville'
gmaps = googlemaps.Client(key=API_KEY)

def check_ratio(x,y):
    if fuzz.partial_token_sort_ratio(x,y)>80:
        return True
    return False

def get_coordinates_from_address(address: str, max_retries: int = 3) -> Optional[Tuple[float, float]]:
    """Retourne (latitude, longitude) d'une adresse via Nominatim."""
    geolocator = Nominatim(user_agent="livraison_django_app")
    for attempt in range(max_retries):
        try:
            location = geolocator.geocode(address, timeout=10)
            if location:
                return location.latitude, location.longitude
        except (GeocoderTimedOut, GeocoderServiceError):
            if attempt < max_retries - 1:
                sleep(2 ** attempt)
        except Exception as e:
            logging.error(f"Erreur géocodage : {e}")
            break
    return None

def connect_to_mongo():
    """Connexion à MongoDB."""
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    return db[COLLECTION_NAME]

def ensure_geospatial_index(collection):
    """Crée l'index 2dsphere si non existant."""
    if 'location_2dsphere' not in collection.index_information():
        collection.create_index([("location", GEOSPHERE)], name="location_2dsphere")
        rprint("[green]Index géospatial créé.[/green]")
    else:
        rprint("[blue]Index géospatial déjà existant.[/blue]")

def update_missing_locations(collection):
    """Ajoute les champs 'location' manquants."""
    updated = 0
    cursor = collection.find({
        "location": {"$exists": False},
        "latitude": {"$exists": True},
        "longitude": {"$exists": True}
    })
    for doc in cursor:
        collection.update_one(
            {'_id': doc['_id']},
            {'$set': {'location': {"type": "Point", "coordinates": [doc['longitude'], doc['latitude']]}}}
        )
        updated += 1
    if updated:
        rprint(f"[yellow]{updated} documents mis à jour avec 'location'.[/yellow]")

def get_nearest_cities(lat: float, lng: float, limit: int = 4) -> List[Dict]:
    """Retourne les villes les plus proches via $near."""
    collection = connect_to_mongo()
    ensure_geospatial_index(collection)
    update_missing_locations(collection)
    cursor = collection.find({
        "location": {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [lng, lat]}
            }
        }
    }).limit(limit)
    return list(cursor)

def calculate_distances_with_traffic(
    origin_lat: float,
    origin_lng: float,
    destinations_info: List[Dict]
) -> List[Dict[str, Any]]:

    if not destinations_info:
        return []
    destinations = [f"{d['latitude']},{d['longitude']}" for d in destinations_info]
    now = datetime.now()
    try:
        matrix = gmaps.distance_matrix(
            origins=[f"{origin_lat},{origin_lng}"],
            destinations=destinations,
            mode="driving",
            departure_time=now,
            traffic_model="best_guess",
            units="metric",
            language="fr-FR"
        )
    except Exception as e:
        rprint(f"[red]Erreur API Google Maps : {e}[/red]")
        return []

    results = []
    row = matrix['rows'][0]
    for i, element in enumerate(row['elements']):
        if element['status'] != 'OK':
            continue
        ville = destinations_info[i]
        distance_m = element['distance']['value']
        duration_s = element['duration']['value']
        traffic_s = element.get('duration_in_traffic', element['duration'])['value']

        results.append({
            'ville': ville.get('town', ''),
            'RN': ville.get('RN', ''),
            'distance_km': round(distance_m / 1000, 1),
            'duration_min': round(duration_s / 60, 0),
            'traffic_min': round(traffic_s / 60, 0),
            'distance_text': element['distance']['text'],
            'duration_text': element['duration']['text'],
        })
    print(results)
    return sorted(results, key=lambda x: x['distance_km'])

def get_proximity(ville_origine: str) -> Optional[Dict[str, Any]]:
    """Analyse la proximité d'une ville donnée (RN, distance, durée)."""
    coords = get_coordinates_from_address(ville_origine)
    if not coords:
        rprint(f"[red]Impossible de géocoder la ville : {ville_origine}[/red]")
        return None
    lat, lng = coords
    nearest_cities = get_nearest_cities(lat, lng, limit=4)
    for elem in nearest_cities:
        if check_ratio(ville_origine, elem['town']):
            rprint(f"[green]Correspondance exacte trouvée : {elem['town']}[/green]")
            return {
                "town": elem['town'],
                "latitude": elem['latitude'],
                "longitude": elem['longitude'],
                "ville_proche": elem['town'],
                "RN": elem.get('RN', ''),
                "RN_majoritaire": elem.get('RN', ''),
            }
    data = calculate_distances_with_traffic(lat, lng, nearest_cities)
    if not data:
        return None
    rn_majoritaire = Counter([d["RN"] for d in data]).most_common(1)[0][0]
    ville_proche = min(data, key=lambda x: x["distance_km"])
    collection=connect_to_mongo()
    collection.insert_one({
        "town": ville_origine,
        "latitude": lat,
        "longitude": lng,
        "nearby_city": ville_proche["ville"],
        "RN": rn_majoritaire,
        "RN_majoritary": rn_majoritaire,
        "city_distance_km": ville_proche["distance_km"],
        "location": {
            "type": "Point",
            "coordinates": [lng, lat]
        }
    })
    return {
        "town": ville_origine,
        "latitude": lat,
        "longitude": lng,
        "nearby_city": ville_proche["ville"],
        "RN": rn_majoritaire,
        "RN_majoritary": rn_majoritaire,
        "city_distance_km": ville_proche["distance_km"]

    }
