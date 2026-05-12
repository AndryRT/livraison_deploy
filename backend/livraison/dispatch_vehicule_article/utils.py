# dispatch_vehicule_article/utils.py
import json
import re
import numpy as np
from pymongo import MongoClient
from fuzzywuzzy import fuzz
from processing.services import fetch_odoo_data
from numba import njit, prange
from concurrent.futures import ThreadPoolExecutor
import ast
from typing import List, Dict, Any


def get_vehicle_data_json():
    try:
        client = MongoClient('mongodb://localhost:27017/')
        db = client['livraison']
        collection = db.vehicules_disponibles_frontend
        documents = collection.find({}, {"_id": 0, "vehicules_disponibles": 1})
        all_vehicules = []
        for doc in documents:
            vehicules = doc.get("vehicules_disponibles", [])
            if isinstance(vehicules, list):
                all_vehicules.extend(vehicules)

        client.close()
        return json.dumps(all_vehicules, ensure_ascii=False)

    except Exception as e:
        print(f"Erreur dans get_vehicle_data_json : {e}")
        return json.dumps([])

def _parse_metric(metric):
    if not isinstance(metric, dict):
        return []
    
    return [{
        "poids_kg": metric.get("poids_kg", 0.0),
        "volume_livraison_m3": metric.get("volume_livraison_m3", 0.0)
    }]
def get_full_article_data():
    client = None
    try:
        client = MongoClient('mongodb://localhost:27017/')
        db = client['livraison']
        collection = db['article']

        projection = {
            "_id": 1, "ref_produit": 1, "Name": 1, "quantity": 1,
            "Metrics": 1, "client_name": 1, "number": 1, "lieu": 1
        }
        raw_docs = list(collection.find({}, projection))
        result = []
        for doc in raw_docs:
            if not isinstance(doc, dict):
                continue

            # --- CORRECTION ICI : Gérer Metrics comme dict OU liste ---
            raw_metrics = doc.get("Metrics", {})
            all_metrics = []

            if isinstance(raw_metrics, dict):
                # Cas 1 : Metrics est un dictionnaire → on le parse une fois
                all_metrics = _parse_metric(raw_metrics)
            elif isinstance(raw_metrics, list):
                # Cas 2 : Metrics est une liste → on parse chaque élément
                for item in raw_metrics:
                    all_metrics.extend(_parse_metric(item))
            # sinon → on ignore

            # --- Extraire poids et volume ---
            poids_values = [
                m["poids_kg"] for m in all_metrics
                if isinstance(m.get("poids_kg"), (int, float))
            ]
            volume_values = [
                m["volume_livraison_m3"] for m in all_metrics
                if isinstance(m.get("volume_livraison_m3"), (int, float))
            ]

            poids_median = float(np.median(poids_values)) if poids_values else 0.0
            volume_median = float(np.median(volume_values)) if volume_values else 0.0

            # --- Nettoyer le doc ---
            clean_doc = {k: v for k, v in doc.items() if k != "Metrics"}
            clean_doc["poids_kg"] = round(poids_median, 6)
            clean_doc["volume_livraison_m3"] = round(volume_median, 6)
            result.append(clean_doc)

        return json.dumps(result, ensure_ascii=False, indent=2,default=str)

    except Exception as e:
        print(f"Erreur articles : {e}")
        import traceback
        traceback.print_exc()
        return json.dumps([])
    finally:
        if client:
            client.close()

def parse_volume(dimension_str):
    try:
        dims = [float(x.strip().replace(",", ".").replace("m", "")) for x in dimension_str.split("x")]
        return dims[0] * dims[1] * dims[2] if len(dims) == 3 else 0.0
    except:
        return 0.0

def parse_weight(value):
    v = value.upper().replace("T", "").strip().replace(",", ".")
    if len(v.split(".")) == 1 and len(v) > 1 and v[-1].isdigit():
        if len(v) == 2:
            v = f"{v[0]}.{v[1]}"
    return float(v)

def calculer_volume(dimension: str):
    if not dimension:
        return None
    s = dimension.lower().replace(',', '.').replace('×', 'x').strip()
    s = re.sub(r'(\d+)\s*m\s*(\d{1,2})', lambda m: f"{m.group(1)}.{m.group(2).zfill(2)}", s)
    s = re.sub(r'(\d+)\s*m\b', r'\1', s)
    try:
        L, W, H = map(float, re.split(r'\s*x\s*', s))
        return round(L * W * H, 3)
    except:
        return None

def ajouter_volume(camions):
    for c in camions:
        vol = calculer_volume(c.get("Dimension", ""))
        c["volume_m3"] = vol if vol is not None else 0.0
    return camions

def retrouve_rn(quartier, axes_data):
    meilleur_rn = None
    meilleur_score = 0
    for rn, quartiers in axes_data.items():
        for q in quartiers:
            score = fuzz.ratio(str(quartier).lower(), str(q).lower())
            if score > meilleur_score:
                meilleur_score = score
                meilleur_rn = rn
    return meilleur_rn

def generate_tuples(df, name_col='Name', incompatible_col='Incompatible_Articles'):
    df = df.fillna('')
    tuples = []
    for _, row in df.iterrows():
        incompat = row[incompatible_col]
        if isinstance(incompat, str) and incompat.strip():
            incompat = [x.strip() for x in incompat.split(',') if x.strip()]
        elif isinstance(incompat, list):
            incompat = [x for x in incompat if isinstance(x, str) and x.strip()]
        else:
            continue
        tuples.extend([(row[name_col], item) for item in incompat])
    return tuples

@njit
def fitness(ind,
            camion_max_weights,
            camion_max_volumes,
            article_weights,
            article_volumes,
            article_quantities,
            article_axes,
            incompatibility_pairs,
            n_axes):
    n_camions = len(camion_max_weights)
    n_articles = len(article_weights)
    print(f"{n_articles}***************************************")
    total_w = np.zeros(n_camions, dtype=np.float64)
    total_v = np.zeros(n_camions, dtype=np.float64)
    axes_count = np.zeros((n_camions, n_axes), dtype=np.bool_)
    presence = np.zeros((n_camions, n_articles), dtype=np.bool_)

    for i in range(n_articles):
        c = ind[i]
        q = article_quantities[i]
        total_w[c] += article_weights[i] * q
        total_v[c] += article_volumes[i] * q
        rn = article_axes[i]
        if rn >= 0:
            axes_count[c, rn] = True
        presence[c, i] = True

    penalty = 0.0
    for c in range(n_camions):
        if total_w[c] > camion_max_weights[c]:
            penalty += 2.0 * (total_w[c] - camion_max_weights[c])
        if total_v[c] > camion_max_volumes[c]:
            penalty += 100.0 * (total_v[c] - camion_max_volumes[c])
        if total_w[c] == 0:
            penalty -= 500.0
        if np.sum(axes_count[c]) > 1:
            penalty += np.sum(axes_count[c]) * 8000.0
        for k in range(len(incompatibility_pairs)):
            i1, i2 = incompatibility_pairs[k]
            if presence[c, i1] and presence[c, i2]:
                penalty += 10000.0
    return penalty

@njit(parallel=True)
def evaluate_population(pop,
                        camion_max_weights,
                        camion_max_volumes,
                        article_weights,
                        article_volumes,
                        article_quantities,
                        article_axes,
                        incompatibility_pairs,
                        n_axes):
    n = len(pop)
    scores = np.empty(n, dtype=np.float64)
    for i in prange(n):
        scores[i] = fitness(pop[i],
                              camion_max_weights,
                              camion_max_volumes,
                              article_weights,
                              article_volumes,
                              article_quantities,
                              article_axes,
                              incompatibility_pairs,
                              n_axes)
    return scores

@njit
def tournament_selection(pop, scores, k=3):
    n = len(pop)
    best = -1
    best_score = 1e18
    for _ in range(k):
        i = np.random.randint(0, n)
        if scores[i] < best_score:
            best_score = scores[i]
            best = i
    return pop[best]

@njit
def crossover(p1, p2):
    n = len(p1)
    pt = np.random.randint(1, n - 1)
    child = np.empty(n, dtype=np.int64)
    child[:pt] = p1[:pt]
    child[pt:] = p2[pt:]
    return child

@njit
def mutate(ind, n_camions, rate=0.05):
    out = np.copy(ind)
    for i in range(len(ind)):
        if np.random.rand() < rate:
            out[i] = np.random.randint(0, n_camions)
    return out

@njit(parallel=True)
def genetic_algorithm_numba(generations,
                            pop,
                            camion_max_weights,
                            camion_max_volumes,
                            article_weights,
                            article_volumes,
                            article_quantities,
                            article_axes,
                            incompatibility_pairs,
                            n_axes):
    pop_size = len(pop)
    best_ind = np.copy(pop[0])
    best_score = 1e18

    for g in range(generations):
        scores = evaluate_population(pop,
                                     camion_max_weights,
                                     camion_max_volumes,
                                     article_weights,
                                     article_volumes,
                                     article_quantities,
                                     article_axes,
                                     incompatibility_pairs,
                                     n_axes)
        idx = np.argmin(scores)
        if scores[idx] < best_score:
            best_score = scores[idx]
            best_ind = np.copy(pop[idx])

        new_pop = np.empty_like(pop)
        elite = max(1, pop_size // 10)
        sorted_idx = np.argsort(scores)
        for i in range(elite):
            new_pop[i] = pop[sorted_idx[i]]

        for i in prange(elite, pop_size):
            p1 = tournament_selection(pop, scores)
            p2 = tournament_selection(pop, scores)
            child = crossover(p1, p2)
            child = mutate(child, len(camion_max_weights))
            new_pop[i] = child
        pop = new_pop
        print(pop)
    return best_ind, best_score