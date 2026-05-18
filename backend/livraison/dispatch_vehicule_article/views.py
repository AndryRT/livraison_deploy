from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
import httpx
import json
from rich import print
import numpy as np
import time
import asyncio
from .utils import (
    fetch_odoo_data, get_vehicle_data_json, get_full_article_data,
    ajouter_volume, generate_tuples, retrouve_rn,
    genetic_algorithm_numba, parse_weight, parse_volume
)
import logging

logger = logging.getLogger("django.fastapi_bridge")
logger.setLevel(logging.INFO)

async def get_axes_data_from_fastapi() -> dict:
    url = "http://127.0.0.1:8001/last-axes"
    print("En attente des données d'axes depuis FastAPI...")
    logger.info("Début de la récupération des axes – mode bloquant jusqu'à réception")

    while True:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    axes = data.get("data", {})

                    if axes and isinstance(axes, dict) and len(axes) > 0:
                        logger.info(f"Axes reçus avec succès ! {len(axes)} axe(s) chargé(s)")
                        print(f"Données d'axes reçues ! Démarrage du solveur...")
                        return axes
                    else:
                        print("Axes encore vides → nouvelle tentative dans 5 secondes...")
                        logger.info("Réponse vide → attente de nouvelles données")
                else:
                    print(f"FastAPI a répondu {response.status_code} → on réessaie...")
                    logger.warning(f"Code HTTP inattendu: {response.status_code}")

        except httpx.RequestError as e:
            print(f"FastAPI injoignable ({e}) → on réessaie dans 5s...")
            logger.error(f"Connexion échouée vers FastAPI: {e}")
        except Exception as e:
            print(f"Erreur inattendue: {e}")
            logger.error(f"Erreur inattendue: {e}")
        await asyncio.sleep(5)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def apply_metaheuristic_input(request):
    return asyncio.run(_apply_metaheuristic_input_async(request))


async def _apply_metaheuristic_input_async(request):
    df = fetch_odoo_data()
    if df.empty:
        return Response({"status": "error", "message": "Aucune donnée Odoo"})

    article_incompatibility = generate_tuples(df)
    camion_json = json.loads(get_vehicle_data_json())
    lignes_articles = json.loads(get_full_article_data())

    if not lignes_articles:
        return Response({"status": "error", "message": "Aucun article en base"})

    camion_json = ajouter_volume(camion_json)

    n_articles = len(lignes_articles)
    n_camions = len(camion_json)
    pop_size = max(50, n_articles)
    camion_max_weights = np.array([parse_weight(c['Tonnage']) * 1000 for c in camion_json], dtype=np.float64)
    camion_max_volumes = np.array([c.get('volume_m3') or parse_volume(c['Dimension']) for c in camion_json], dtype=np.float64)
    article_quantities = np.array([a['quantity'] for a in lignes_articles], dtype=np.int32)
    article_weights = np.array([a['poids_kg'] for a in lignes_articles], dtype=np.float64)
    article_volumes = np.array([a['volume_livraison_m3'] for a in lignes_articles], dtype=np.float64)
    name_to_id = {a["Name"]: i for i, a in enumerate(lignes_articles)}
    axes_data = await get_axes_data_from_fastapi()
    print("Axes data from FastAPI:", axes_data)
    result = {}
    for rn, lieux_list in axes_data.items():
        lieux_uniques = list({list(d.keys())[0] for d in lieux_list})
        result[rn] = lieux_uniques
    axes_data=result
    if axes_data is None:
        return Response({"status": "error", "message": "Impossible d'obtenir les données de l'API."})

    lieux = [art.get('lieu') for art in lignes_articles]
    villes_proches = [retrouve_rn(l, axes_data) for l in lieux]
    unique_axes = sorted([axis for axis in set(villes_proches) if axis is not None])
    n_axes = len(unique_axes)
    axes_mapping = {axis: i for i, axis in enumerate(unique_axes)}
    article_axes = np.array([axes_mapping.get(axis, -1) for axis in villes_proches], dtype=np.int32)
    incompatibility_pairs = np.array([
        (name_to_id[t[0]], name_to_id[t[1]])
        for t in article_incompatibility if t[0] in name_to_id and t[1] in name_to_id
    ], dtype=np.int64).reshape(-1, 2)

    pop = np.random.randint(0, n_camions, size=(pop_size, n_articles), dtype=np.int64)

    generations = 100
    start_time = time.time()
    best_ind, best_score = genetic_algorithm_numba(
        generations=generations,
        pop=pop,
        camion_max_weights=camion_max_weights,
        camion_max_volumes=camion_max_volumes,
        article_weights=article_weights,
        article_volumes=article_volumes,
        article_quantities=article_quantities,
        article_axes=article_axes,
        incompatibility_pairs=incompatibility_pairs,
        n_axes=n_axes,
    )
    elapsed = time.time() - start_time

    resultats = {}
    for art, cam_idx in zip(lignes_articles, best_ind):
        print(f'*************************************{len(art)}')
        immat = camion_json[cam_idx]["immatriculation"]
        article_data = {
            "id": art.get("_id"),
            "commande_id": art.get("ref_produit"),
            "article": art["Name"],
            "quantite": art["quantity"],
            "poids_unitaire_kg": art["poids_kg"],
            "volume_unitaire_m3": art["volume_livraison_m3"],
            "client": art.get("client_name"),
            "telephone": art.get("number"),
            "lieu_livraison": art["lieu"]
        }
        print(f"***************{len(article_data)}**************")
        resultats.setdefault(immat, []).append(article_data)
    resultats = dict(sorted(resultats.items()))
    print(f"***************{len(resultats)}**************")
    return Response({"solution": resultats, "status": "success"})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_reporting(request):
    from pymongo import MongoClient
    from django.conf import settings
    from datetime import datetime, timedelta

    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    category = request.GET.get('category')

    client = MongoClient(settings.MONGO_URI)
    db = client['livraison']
    collection = db['reporting']

    query = {}
    if start_date or end_date:
        query['Database_date'] = {}
        if start_date:
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                query['Database_date']['$gte'] = start_dt
            except ValueError:
                pass
        if end_date:
            try:
                end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
                query['Database_date']['$lt'] = end_dt
            except ValueError:
                pass

    if category:
        query['category'] = category

    documents = list(collection.find(query))
    for doc in documents:
        doc['_id'] = str(doc['_id'])

    client.close()
    return Response(documents)