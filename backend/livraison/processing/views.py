from django.http import JsonResponse, HttpResponse
from .services import fetch_odoo_data, create_user_with_department,fetch_odoo_data_init,filter_products_by_date_and_period,generate_articles
from django.core.exceptions import ValidationError
import traceback
import logging
from time import time
import threading
import time
import concurrent.futures
import random
import asyncio
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import pytz
import pandas as pd
import numpy as np
from datetime import datetime
from pymongo import MongoClient
from django.db import transaction, IntegrityError
import logging
import pandas as pd
from bson import ObjectId
import websockets
import json

@api_view(['POST'])
@permission_classes([AllowAny])
@transaction.atomic
def create_user_view(request):
    """
    Crée un nouvel utilisateur et son département associé.

    Args:
        request: La requête HTTP contenant les données de l'utilisateur.

    Returns:
        Response: Une réponse JSON indiquant le succès ou l'échec.
    """
    data = request.data
    username = data.get('username')
    password = data.get('password')
    department_name = data.get('department_name')

    if not all([username, password, department_name]):
        return Response({"status": "error", "message": "Tous les champs sont requis"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user, department = create_user_with_department(username, password, department_name)
        return Response({"status": "success", "message": "Utilisateur créé avec succès"}, status=status.HTTP_201_CREATED)
    except IntegrityError:
        return Response({"status": "error", "message": "Ce nom d'utilisateur existe déjà"}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logging.error(f"Erreur lors de la création de l'utilisateur: {e}\n{traceback.format_exc()}")
        return Response({"status": "error", "message": "Erreur interne du serveur"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def test_auth(request):
    """
    Une vue simple pour tester l'authentification.
    """
    return Response({"status": "success", "message": "Authentification réussie !"}, status=status.HTTP_200_OK)

def data_processing(data):
    """
    Traite les données en remplissant les valeurs manquantes.

    Args:
        data (pd.DataFrame): Le DataFrame à traiter.

    Returns:
        pd.DataFrame: Le DataFrame traité.
    """
    data = data.fillna("")
    return data

@api_view(['GET'])
@permission_classes([AllowAny])
def get_bank_data(request):
    """
    Récupère et traite les données depuis Odoo.

    Args:
        request: La requête HTTP.

    Returns:
        Response: Une réponse JSON avec les données traitées ou un message d'erreur.
    """
    try:
        df = fetch_odoo_data()
        df = data_processing(df)
        data = df.to_dict(orient='records')
        logging.info(f"Nombre d'enregistrements récupérés: {len(data)}")
        return Response({"status": "success", "data": data})
    except ValidationError as e:
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logging.error(f"Erreur serveur: {e}\n{traceback.format_exc()}")
        return Response({"status": "error", "message": "Erreur serveur"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

def message(request):
    """
    Retourne un simple message de bienvenue.

    Args:
        request: La requête HTTP.

    Returns:
        JsonResponse: Un message de bienvenue en JSON.
    """
    return JsonResponse({"message": "Bienvenue,welcome,tongasoa"})


def insert_to_mongodb(records, db_name='livraison', collection_name='articles'):
    """
    Insère les données dans MongoDB dans un thread séparé.
    Args:
        records (list): Liste de dictionnaires à insérer.
        db_name (str): Nom de la base de données MongoDB.
        collection_name (str): Nom de la collection MongoDB.
    """
    start_time = time.time()
    try:
        client = MongoClient('mongodb://mongodb:27017/')
        db = client[db_name]
        collection = db[collection_name]
        if records:
            collection.insert_many(records)
            logging.info(f"{len(records)} documents insérés dans la collection '{collection_name}'")
        client.close()
        logging.info(f"Temps pour insert_to_mongodb : {time.time() - start_time:.2f} secondes")
    except Exception as e:
        logging.error(f"Erreur lors de l'insertion dans MongoDB : {str(e)}\n{traceback.format_exc()}")


async def send_to_fastapi(data):
    uri = "ws://localhost:8001/ws"
    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps(data))
        print(f"Sent {len(data)} records to FastAPI.")
        try:
            message = await websocket.recv()
            print(f"[FastAPI] {message}")
        except websockets.exceptions.ConnectionClosed:
            print("[Django] FastAPI connection closed.")

# Vue API pour frontend
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_product(request):
    start_time = time.time()
    results = generate_articles()

    if isinstance(results, list):
        results = pd.DataFrame(results)

    if results.empty:
        return Response({"message": "Aucune donnée disponible"}, status=status.HTTP_200_OK)

    results = results.replace({np.nan: None})

    # Sanitize si besoin (pour JSON)
    def sanitize_object_ids(obj):
        if isinstance(obj, list):
            return [sanitize_object_ids(item) for item in obj]
        if isinstance(obj, dict):
            return {key: sanitize_object_ids(value) for key, value in obj.items()}
        if isinstance(obj, ObjectId):
            return str(obj)
        return obj

    data = results.to_dict(orient='records')
    sanitized_results = sanitize_object_ids(data)
    
    # Envoyer les données à FastAPI
    try:
        asyncio.run(send_to_fastapi(sanitized_results))
    except Exception as e:
        logging.error(f"Failed to send data to FastAPI: {e}")

    logging.info(f"Temps total : {time.time() - start_time:.2f} secondes")
    return Response(sanitized_results, status=status.HTTP_200_OK)
        
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def afficher(request):
    result = fetch_odoo_data()
    print(result)
    if isinstance(result, Response):
        return result
    if hasattr(result, 'compute'):
        data = result.compute().to_dict(orient='records')
    else:
        data = result.to_dict(orient='records')
    
    def sanitize_object_ids(obj):
        if isinstance(obj, list):
            return [sanitize_object_ids(item) for item in obj]
        if isinstance(obj, dict):
            return {key: sanitize_object_ids(value) for key, value in obj.items()}
        if isinstance(obj, ObjectId):
            return str(obj)
        return obj

    sanitized_results = sanitize_object_ids(data)
    return Response(sanitized_results,status=200)