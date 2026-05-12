import asyncio
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .tdvrptw import *
from .optimization import DEPOT_NAME, DEPOT_LAT, DEPOT_LNG
import json
import pytz
from datetime import datetime
import httpx
from pymongo import MongoClient
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
eat_tz = pytz.timezone('Africa/Nairobi')
FASTAPI_URL = "http://10.68.163.2/android"
API_SECRET_KEY = "viseo2025_UltraSecretKey_9x8k2m4z_PleaseChangeMe"
client = MongoClient('mongodb://127.0.0.1:27017')
db = client['livraison']
deliveries_collection = db['article']
latest_final_output = {}
@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def show_optimization_result(request):
    global latest_final_output
    data, status_code = run_tdvrptw_flexible(request)
    if status_code != 200 or not data.get("solution"):
        return Response(data, status=status_code)
    optimized_solution = data.get("solution")
    villes = data.get("villes")
    initial_data = data.get("initial_data", {}).get("solution", {})

    final_output = {}
    for vehicle_result in optimized_solution:
        vehicle_id = vehicle_result.get("vehicle")
        if not vehicle_id:
            continue

        route_steps = vehicle_result.get("route_steps", [])
        departure_time=vehicle_result.get('departure_time')
        print(departure_time)
        # --- Build the list of visited nodes in order ---
        visited_nodes = [DEPOT_NAME]
        for step in route_steps:
            visited_nodes.append(step.get("to"))

        # --- 1. Build locations_with_coords ---
        locations_with_coords = []

        vehicle_locations = villes.get(vehicle_id, {})
        for node_name in visited_nodes:
            if node_name == DEPOT_NAME:
                locations_with_coords.append(f"{DEPOT_NAME}({DEPOT_LAT},{DEPOT_LNG})")
            else:
                coords = vehicle_locations.get(node_name)
                if coords:
                    locations_with_coords.append(f"{node_name}({coords[0]},{coords[1]})")
        travel_info = []
        for step in route_steps:
            travel_info.append([f"{step.get('distance_km')}km", step.get('arrival')])
        sorted_orders = []
        vehicle_orders = initial_data.get(vehicle_id, [])
        orders_by_location = {}
        for order in vehicle_orders:
            location = order.get("lieu_livraison")
            if location:
                if location not in orders_by_location:
                    orders_by_location[location] = []
                orders_by_location[location].append(order)
        
        # Iterate through visited nodes, skipping the start depot
        for node_name in visited_nodes[1:]:
            if node_name in orders_by_location:
                sorted_orders.extend(orders_by_location[node_name])

        final_output[vehicle_id] = [
            locations_with_coords,
            travel_info,
            sorted_orders,
            [departure_time]
        ]
    print(final_output)
    latest_final_output = final_output.copy()
    return Response(final_output, status=200)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_fast_api_result(request):
    final_output = request.data
    if not final_output:
        return Response({"error": "Aucune donnée de planning n'a été fournie dans la requête."}, status=400)

    try:
        r = httpx.post(
            FASTAPI_URL,
            json=final_output,
            headers={"X-API-Key": API_SECRET_KEY},
            timeout=15
        )
        if r.status_code == 200:
            return Response({
                "success": True,
                "message": "final_output envoyé aux chauffeurs !",
                "camions": list(final_output.keys()),
                "total": len(final_output)
            })
        else:
            return Response({"error": "FastAPI erreur", "detail": r.text}, status=500)
    except Exception as e:
        return Response({"error": "FastAPI injoignable", "detail": str(e)}, status=500)
    


@csrf_exempt
def mark_delivered(request):
    if request.method != "POST":
        return JsonResponse({"success": False, "message": "Méthode non autorisée"}, status=405)

    try:
        data = json.loads(request.body)
        delivery_id = data.get("id")
        
        if not delivery_id:
            return JsonResponse({"success": False, "message": "ID manquant"}, status=400)

        # Validation ObjectId
        try:
            obj_id = ObjectId(delivery_id)
        except Exception:
            return JsonResponse({"success": False, "message": "ID invalide"}, status=400)

        livre = data.get("livre", True)

        # Mise à jour MongoDB
        result = deliveries_collection.update_one(
            {"_id": obj_id},
            {"$set": {"state": "done", "livre": livre,"dat e_livraison": datetime.now(eat_tz)}},
        )

        if result.matched_count == 0:
            return JsonResponse({"success": False, "message": "Article non trouvé"}, status=404)

        logger.info(f"Livraison {delivery_id} marquée comme livrée par le chauffeur")

        return JsonResponse({
            "success": True,
            "message": "Livraison marquée comme livrée"
        })

    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "JSON invalide"}, status=400)
    except Exception as e:
        logger.error(f"Erreur mark_delivered: {e}")
        return JsonResponse({"success": False, "message": "Erreur serveur"}, status=500)