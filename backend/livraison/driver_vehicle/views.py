from django.http import JsonResponse, HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.response import Response
from rest_framework import status
from pymongo import MongoClient
import os

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
import pandas as pd
from datetime import datetime
from rich import print
from .serializers import VehiculeSerializer
from .utils import lire_json, ecrire_json,get_all_product_history

@api_view(['GET', 'POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def get_all_history(request):
    documents = get_all_product_history()
    return Response(documents, status=status.HTTP_200_OK)



@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def get_data_react(request):
    vehicules_disponibles = request.data.get('vehicules_disponibles', [])
    date = request.data.get('date', datetime.now().strftime('%Y-%m-%d'))
    if not isinstance(vehicules_disponibles, list):
        return Response({"error": "vehicules_disponibles doit être une liste"}, status=400)
    client = MongoClient(MONGO_URI)
    db = client['livraison']
    collection = db.vehicules_disponibles_frontend
    collection.delete_many({})
    if vehicules_disponibles:
        collection.insert_one({
            "vehicules_disponibles": vehicules_disponibles,
            "date": date,
            "updated_at": datetime.utcnow()
        })
    client.close()
    return Response({
        "message": "Collection vidée et nouvelles données insérées",
        "count": len(vehicules_disponibles)
    }, status=200)
    
    
@api_view(['GET', 'POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def vehicules_view(request):
    """
    Vue pour lister tous les véhicules ou en ajouter un nouveau.
    Méthode GET pour lister, POST pour ajouter.

    Args:
        request: La requête HTTP.

    Returns:
        Response: Une réponse JSON avec la liste des véhicules ou le statut de l'ajout.
    """
    if request.method == 'GET':
        client = MongoClient(MONGO_URI)
        db = client['livraison']
        
        # 1. Fetch unique GPS records with category "LIVRAISON"
        pipeline = [
            {"$match": {"category": "LIVRAISON", "Immatriculation": {"$ne": None}}},
            {"$sort": {"Database_date": -1}},
            {"$group": {
                "_id": "$Immatriculation",
                "Vehicules": {"$first": "$Vehicules"},
                "Marque": {"$first": "$Marque"},
                "type_vehicule": {"$first": "$type"}
            }}
        ]
        liv_gps_vehicles = list(db['reporting'].aggregate(pipeline))
        liv_plates_set = {str(gps_veh['_id']).strip().upper() for gps_veh in liv_gps_vehicles}
        
        # 2. Get existing registered vehicles
        veh_collection = db['vehicules']
        existing_vehicles = list(veh_collection.find())
        existing_plates = {str(v.get('Immatriculation', '')).strip().upper() for v in existing_vehicles if v.get('Immatriculation')}
        
        # Get highest current Mat to safely increment
        max_mat = 0
        for v in existing_vehicles:
            try:
                mat_val = int(v.get('Mat', 0))
                if mat_val > max_mat:
                    max_mat = mat_val
            except (ValueError, TypeError):
                pass
                
        # 3. Seed any GPS delivery vehicles that are not in the vehicle list yet
        seeded_any = False
        for gps_veh in liv_gps_vehicles:
            plate = str(gps_veh['_id']).strip()
            if plate.upper() not in existing_plates:
                max_mat += 1
                new_veh = {
                    "Vehicule": gps_veh.get("Vehicules") or gps_veh.get("Marque") or "Véhicule Livraison",
                    "Type": gps_veh.get("type_vehicule") or "gasoil",
                    "Immatriculation": plate,
                    "Tonnage": "0",
                    "Dimension": "0 x 0 x 0",
                    "active": True,
                    "Mat": max_mat,
                    "Nom": "",
                    "Contact": "",
                    "Poste": "",
                    "history": []
                }
                veh_collection.insert_one(new_veh)
                seeded_any = True
                
        # Reload registered vehicles if we added any new ones
        if seeded_any:
            existing_vehicles = list(veh_collection.find())
            
        client.close()
        
        # 4. Filter the returned list to only show LIVRAISON vehicles
        filtered_data = []
        for v in existing_vehicles:
            v.pop('_id', None) # Remove ObjectId for JSON compatibility
            plate = str(v.get('Immatriculation', '')).strip().upper()
            if plate in liv_plates_set:
                filtered_data.append(v)
                
        if not filtered_data:
            # Fallback to returning all vehicles without filter if no matches exist
            for v in existing_vehicles:
                v.pop('_id', None)
            return Response(existing_vehicles)
            
        return Response(filtered_data)

    elif request.method == 'POST':
        serializer = VehiculeSerializer(data=request.data)
        if serializer.is_valid():
            data = lire_json()
            immatriculation = serializer.validated_data.get('Immatriculation')
            if any(v.get('Immatriculation') == immatriculation for v in data):
                return Response({'error': 'Un véhicule avec cette immatriculation existe déjà.'}, status=status.HTTP_400_BAD_REQUEST)
            
            data.append(serializer.validated_data)
            ecrire_json(data)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def ajouter_vehicule(request):
    """
    Vue pour ajouter un nouveau véhicule.

    Args:
        request: La requête HTTP contenant les données du véhicule.

    Returns:
        Response: Une réponse JSON avec les données du véhicule ajouté ou les erreurs.
    """
    serializer = VehiculeSerializer(data=request.data)
    if serializer.is_valid():
        data = lire_json()
        data.append(serializer.validated_data)
        ecrire_json(data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def modifier_vehicule(request, pk):
    """
    Vue pour récupérer, modifier ou supprimer un véhicule par son identifiant.
    Pour DELETE, supprime tous les enregistrements correspondant à l'immatriculation du véhicule.

    Args:
        request: La requête HTTP.
        pk (int): L'identifiant 'Mat' du véhicule.

    Returns:
        Response: Une réponse JSON.
    """
    data = lire_json()
    vehicule = next((v for v in data if v.get('Mat') == pk), None)
    
    if vehicule is None:
        return Response({'error': 'Véhicule non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = VehiculeSerializer(vehicule)
        return Response(serializer.data)

    elif request.method == 'PUT':
        serializer = VehiculeSerializer(data=request.data, partial=True)
        if serializer.is_valid():
            index = data.index(vehicule)
            data[index].update(serializer.validated_data)
            ecrire_json(data)
            return Response(data[index])
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        immatriculation_a_supprimer = vehicule.get('Immatriculation')
        
        if not immatriculation_a_supprimer:
            # Fallback au cas où l'immatriculation manquerait, ne supprime qu'un seul doc
            data.remove(vehicule)
            ecrire_json(data)
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Filtrer pour ne garder que les véhicules qui n'ont pas cette immatriculation
        donnees_filtrees = [v for v in data if v.get('Immatriculation') != immatriculation_a_supprimer]
        
        ecrire_json(donnees_filtrees)
        return Response(status=status.HTTP_204_NO_CONTENT)
 

@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def get_vehicle_active(request):
    try:
        client = MongoClient(MONGO_URI) 
        db = client['livraison']
        
        liv_plates = db['reporting'].distinct("Immatriculation", {"category": "LIVRAISON"})
        liv_plates_set = {str(p).strip().upper() for p in liv_plates if p}
        
        collection = db['vehicules']
        cursor = collection.find({"active": True})

        vehicles = []
        for doc in cursor:
            plate = str(doc.get("Immatriculation", "")).strip().upper()
            if not liv_plates_set or plate in liv_plates_set:
                vehicles.append({
                    "id": str(doc["_id"]),
                    "immatriculation": doc.get("Immatriculation") or doc.get("Vehicule") or "N/A",
                    "type_vehicule": doc.get("Type", ""),
                    "vehicule": doc.get("Vehicule", ""),
                    "Dimension": doc.get("Dimension", ""),
                    "Tonnage": doc.get("Tonnage", ""),
                    "volume": doc.get("volume", "")
                })

        client.close()
        return Response({"vehicles": vehicles}, status=status.HTTP_200_OK)

    except Exception as e:
        print(f"Erreur récupération véhicules actifs : {e}")
        return Response({
            "error": "Impossible de récupérer les véhicules",
            "detail": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)