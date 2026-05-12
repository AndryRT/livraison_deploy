# optimization.py
import httpx
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Dict, Tuple, List, Optional
import googlemaps
from pymongo import MongoClient

# ==================== CONFIG ====================
DEPOT_LAT = -18.8842626
DEPOT_LNG = 47.5087729
DEPOT_COORD = (DEPOT_LAT, DEPOT_LNG)
DEPOT_NAME = "Gallaxy village viseo"
API_KEY = "AIzaSyBPp50ByhH43bsf5ayKyQjUg7jbYagwSKY"  # Change si besoin
gmaps = googlemaps.Client(key=API_KEY)

# ==================== MONGODB CACHE (SANS CREATE_INDEX) ====================
client = MongoClient("mongodb://localhost:27017/")
db = client["vrp_cache"]
collection = db["trajets"]

# ON NE CRÉE PLUS RIEN AUTOMATIQUEMENT → plus jamais d'erreur d'index
# Si tu veux l'index unique, tu le crées UNE FOIS manuellement dans MongoDB :
# db.trajets.createIndex({"origin":1,"destination":1,"date":1,"hour":1},{unique:true})

def get_cached_trajet(origin, destination, date_str, hour):
    key = {
        "origin": f"{origin[0]:.6f},{origin[1]:.6f}",
        "destination": f"{destination[0]:.6f},{destination[1]:.6f}",
        "date": date_str,
        "hour": hour
    }
    result = collection.find_one(key)
    if result and "distance_km" in result:
        return (result["distance_km"], result["duration_min"])
    return None

def save_trajet(origin, destination, date_str, hour, km, mins):
    doc = {
        "origin": f"{origin[0]:.6f},{origin[1]:.6f}",
        "destination": f"{destination[0]:.6f},{destination[1]:.6f}",
        "date": date_str,
        "hour": hour,
        "distance_km": round(float(km), 2),
        "duration_min": round(float(mins), 1),
        "cached_at": datetime.utcnow()
    }
    collection.update_one(
        {
            "origin": doc["origin"],
            "destination": doc["destination"],
            "date": doc["date"],
            "hour": doc["hour"]
        },
        {"$set": doc},
        upsert=True
    )

def get_trajets_from_mongo(tasks, now):
    """
    Récupère les trajets depuis le cache MongoDB.
    Retourne des valeurs par défaut si les données ne sont pas dans le cache.
    """
    results = []
    date_str = now.strftime("%Y-%m-%d")
    hour = now.hour

    for _, _, origin, destination, _ in tasks:
        # On essaie de récupérer depuis le cache
        cached_result = get_cached_trajet(origin, destination, date_str, hour)

        if cached_result:
            results.append(cached_result)
        else:
            # Si ce n'est pas dans le cache, on met une valeur par défaut élevée
            # pour que l'optimiseur l'évite si possible.
            # Dans un cas réel, on pourrait vouloir appeler l'API ici (ce qui était fait avant)
            # ou avoir une autre stratégie de fallback.
            results.append((999.0, 999.0)) # (distance_km, duration_min)

    return results

# ==================== GET_TRAJET 100% ROBUSTE (Madagascar-proof) ====================
def get_trajet(origin, destination, now: datetime):
    date_str = now.strftime("%Y-%m-%d")
    hour = now.hour

    cached = get_cached_trajet(origin, destination, date_str, hour)
    if cached and not np.isnan(cached[0]):
        return cached

    print(f"[Google Maps {hour:02d}h] {origin} → {destination}")

    try:
        result = gmaps.directions(
            origin=origin,
            destination=destination,
            mode="driving",
            departure_time=now,
            traffic_model="best_guess",
            language="fr"
        )

        if not result or not result[0]["legs"]:
            raise ValueError("Aucun itinéraire")

        leg = result[0]["legs"][0]

        # Distance : gère "66,6 km" et "66.6 km"
        dist_text = leg["distance"]["text"].replace(",", ".").replace(" km", "").strip()
        km = float(''.join(c for c in dist_text if c.isdigit() or c == '.'))

        # Durée avec trafic
        duration_obj = leg.get("duration_in_traffic") or leg["duration"]
        dur_text = duration_obj["text"].lower()

        mins = 0.0
        parts = dur_text.split()
        i = 0
        while i < len(parts):
            if parts[i].isdigit():
                num = int(parts[i])
                if i + 1 < len(parts):
                    unit = parts[i + 1]
                    if unit.startswith("h"):
                        mins += num * 60
                    elif "min" in unit:
                        mins += num
                else:
                    mins += num
                i += 2
            else:
                i += 1
        if km > 10 and mins < 20:
            print(f"    [CORRECTION] {km} km en {mins:.0f} min → impossible à Tana → corrigé")
            mins = max(mins, (km / 35) * 60 + 15)

        result = (round(km, 2), round(mins, 1))
        save_trajet(origin, destination, date_str, hour, *result)
        return result

    except Exception as e:
        print(f"    [ERREUR Google] {origin} → {destination} | {e}")
        return (999.0, 999.0)

# ==================== LE RESTE (inchangé et propre) ====================
def get_optimization_data(request):
    url = "http://127.0.0.1:8000/api/output/afficher/all-output"
    headers = {'Authorization': request.headers.get('Authorization', '')}
    try:
        with httpx.Client(timeout=120.0, headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"[Erreur API] {e}")
        return {}

def get_position(x, url_routes):
    try:
        import requests
        response = requests.get(url_routes, timeout=30)
        response.raise_for_status()
        routes = response.json().get("data", {})
        lieux_coords = {}
        for route_list in routes.values():
            if isinstance(route_list, list):
                for item in route_list:
                    if isinstance(item, dict) and len(item) == 1:
                        key = list(item.keys())[0].strip()
                        lat = item[list(item.keys())[0]].get("latitude")
                        lng = item[list(item.keys())[0]].get("longitude")
                        if lat and lng:
                            lieux_coords[key] = (float(lat), float(lng))
        return lieux_coords
    except Exception as e:
        print("Erreur coordonnées :", e)
        return {}

def process_optimization_data(request):
    url_routes = "http://127.0.0.1:8001/last-axes"
    data = get_optimization_data(request)
    solution = data.get("solution", {})
    ax_rn = []
    for key, value in solution.items():
        lieux = list({cmd.get("lieu_livraison", "").strip() for cmd in value if cmd.get("lieu_livraison")})
        if lieux:
            ax_rn.append({key: lieux})
    all_coords = get_position(ax_rn, url_routes)
    villes = {}
    for item in ax_rn:
        for vehicule, lieux in item.items():
            villes[vehicule] = {lieu: all_coords.get(lieu) for lieu in lieux if all_coords.get(lieu)}
    return villes, data

def simulate_route(request):
    now = datetime.now()
    print(f"{'='*60}")
    print(f"DÉBUT OPTIMISATION VRP - {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*60}")

    villes, initial_data = process_optimization_data(request)
    if not villes:
        return [{}, {}, (None, None, None, None, None, None), 0, None, None]

    matrice_distance = {}
    matrice_duree = {}
    Dmat_global = {}
    Tmat_global = {}
    S = {}
    h = 0
    selected_vehicles = list(villes.items())[:2]

    for vehicle, clients in selected_vehicles:
        clients = {k: v for k, v in clients.items() if v is not None}
        if not clients:
            continue

        print(f"[INFO] {vehicle} → {len(clients)} clients")
        client_names = list(clients.keys())
        lieux_with_depot = [DEPOT_NAME] + client_names
        coords_list = [DEPOT_COORD] + [clients[name] for name in client_names]
        n_nodes = len(lieux_with_depot)

        Dmat = [[0.0] * n_nodes for _ in range(n_nodes)]
        Tmat = [[0.0] * n_nodes for _ in range(n_nodes)]

        tasks = [(i, j, coords_list[i], coords_list[j], now)
                 for i in range(n_nodes)
                 for j in range(i + 1, n_nodes)]

        with ThreadPoolExecutor(max_workers=15) as executor:
            results = list(executor.map(lambda t: get_trajet(t[2], t[3], t[4]), tasks))
        #
            for (i, j, _, _, _), (dist, dur) in zip(tasks, results):
                if dist < 900:
                    Dmat[i][j] = Dmat[j][i] = dist
                    Tmat[i][j] = Tmat[j][i] = dur
        # results = get_trajets_from_mongo(tasks, now)
        # for (i, j, _, _, _), (dist, dur) in zip(tasks, results):
        #     if dist < 900:
        #         Dmat[i][j] = Dmat[j][i] = dist
        #         Tmat[i][j] = Tmat[j][i] = dur

        matrice_distance[vehicle] = {h: {"lieux": lieux_with_depot, "matrice": Dmat.copy()}}
        matrice_duree[vehicle] = {h: {"lieux": lieux_with_depot, "matrice": Tmat.copy()}}
        Dmat_global[vehicle] = {h: Dmat.copy()}
        Tmat_global[vehicle] = {h: Tmat.copy()}
        S[vehicle] = list(range(1, n_nodes))

    if not S:
        return [{}, {}, (None, None, None, None, None, None), 0, villes, initial_data]

    max_nodes = max(len(matrice_distance[v][h]["lieux"]) for v in S)
    N0 = list(range(max_nodes))
    H_slots = [(now.strftime("%H:%M"), (now + timedelta(hours=8)).strftime("%H:%M"))]
    H = [0]

    print(f"[SUCCÈS] {len(S)} véhicules prêts → envoi à OR-Tools")
    return [
        matrice_duree, matrice_distance,
        (Dmat_global, Tmat_global, N0, S, H_slots, H),
        len(S), villes, initial_data
    ]