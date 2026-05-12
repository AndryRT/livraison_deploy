# tdvrptw_ortools.py
from .optimization import simulate_route, DEPOT_NAME
from datetime import datetime, timedelta
from rest_framework.response import Response
from concurrent.futures import ThreadPoolExecutor
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from rich import print
import heapq

DEPART_MIN = 9 * 60
DEPART_MAX = 10 * 60
SERVICE_TIME = 30
END_OF_DAY = 20 * 60

# ===================================================================
# 1. Dijkstra pour calculer la distance la plus courte entre deux points
# ===================================================================
def _dijkstra_min_distance(graph, start, n):
    """Retourne la liste des distances les plus courtes depuis start vers tous les nœuds"""
    dist = [float('inf')] * n
    dist[start] = 0.0
    pq = [(0.0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v in range(n):
            if v == u:
                continue
            weight = graph[u][v]
            if weight >= 1e8:  # valeur infinie
                continue
            if dist[u] + weight < dist[v]:
                dist[v] = dist[u] + weight
                heapq.heappush(pq, (dist[v], v))
    return dist

# ===================================================================
# 2. Fonction principale MODIFIÉE (optimise temps + affiche distance courte)
# ===================================================================
def optimize_vehicle_ortools(args):
    vehicule, matrice_distance, Dmat_global, Tmat_global, S, H_slots, h = args

    if vehicule not in matrice_distance:
        return {"vehicle": vehicule, "status": "skipped"}

    lieux = matrice_distance[vehicule][h]["lieux"]
    n = len(lieux)
    if n <= 1:
        return {"vehicle": vehicule, "status": "empty"}

    # ---------------------------------------------------------------
    # TEMPS : dépend de l'heure h → utilisé pour l'optimisation ET les horaires
    # ---------------------------------------------------------------
    time_matrix = [[int(Tmat_global[vehicule][h][i][j]) for j in range(n)] for i in range(n)]

    # ---------------------------------------------------------------
    # DISTANCE LA PLUS COURTE : on prend le min sur toutes les heures
    # puis on applique Dijkstra pour avoir le vrai plus court chemin
    # ---------------------------------------------------------------
    min_dist_graph = [
        [min(Dmat_global[vehicule][hh][i][j] for hh in Dmat_global[vehicule])
         for j in range(n)]
        for i in range(n)
    ]

    # Pré-calcul de toutes les distances les plus courtes
    shortest_dist_matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        shortest_dist_matrix[i] = _dijkstra_min_distance(min_dist_graph, i, n)

    # Pour OR-Tools (entiers ×100) → on garde une version "grande" pour éviter les bugs
    dist_matrix_ortools = [
        [int(shortest_dist_matrix[i][j] * 100) if shortest_dist_matrix[i][j] < 1e8 else 99999999
         for j in range(n)]
        for i in range(n)
    ]

    service_times = [0] + [SERVICE_TIME] * (n - 1)

    manager = pywrapcp.RoutingIndexManager(n, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    # ===================== OPTIMISATION SUR LE TEMPS =====================
    def time_callback(i, j):
        from_node = manager.IndexToNode(i)
        to_node = manager.IndexToNode(j)
        return service_times[from_node] + time_matrix[from_node][to_node]

    time_idx = routing.RegisterTransitCallback(time_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(time_idx)  # ← on minimise le temps

    routing.AddDimension(
        time_idx, slack_max=1440, capacity=1440*60,
        fix_start_cumul_to_zero=False, name='time'
    )
    time_dim = routing.GetDimensionOrDie('time')

    # Contraintes horaires
    time_dim.CumulVar(manager.NodeToIndex(0)).SetRange(DEPART_MIN, DEPART_MAX)
    for i in range(1, n):
        time_dim.CumulVar(manager.NodeToIndex(i)).SetMax(END_OF_DAY)

    # Drop autorisé
    penalty = 100000
    for i in range(1, n):
        routing.AddDisjunction([manager.NodeToIndex(i)], penalty)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.time_limit.seconds = 30

    solution = routing.SolveWithParameters(search_params)
    if not solution:
        return {"vehicle": vehicule, "status": "failed", "message": "Aucune solution même avec les pénalités"}

    # ===================== EXTRACTION DE LA ROUTE =====================
    route_steps = []
    dropped_nodes = []
    total_dist_affichee = 0.0
    index = routing.Start(0)
    prev_node = 0

    # Clients droppés
    for node_idx in range(routing.Size()):
        if routing.IsStart(node_idx) or routing.IsEnd(node_idx):
            continue
        if solution.Value(routing.NextVar(node_idx)) == node_idx:
            dropped_nodes.append(lieux[manager.IndexToNode(node_idx)])

    actual_depart = solution.Value(time_dim.CumulVar(routing.Start(0)))
    slot_start = datetime.strptime("00:00", "%H:%M") + timedelta(minutes=actual_depart)
    current_time = actual_depart

    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != 0:
            # DISTANCE AFFICHÉE = la plus courte (Dijkstra)
            dist_km = shortest_dist_matrix[prev_node][node]

            # TEMPS RÉEL = selon l'heure de passage
            dur = time_matrix[prev_node][node]

            arrival = solution.Value(time_dim.CumulVar(index))
            departure_time_from_prev = current_time

            route_steps.append({
                "from": lieux[prev_node],
                "to": lieux[node],
                "distance_km": round(dist_km, 2),
                "travel_time_min": round(dur, 1), 
                "departure": (slot_start + timedelta(minutes=departure_time_from_prev - actual_depart)).strftime("%H:%M"),
                "arrival": (slot_start + timedelta(minutes=arrival - actual_depart)).strftime("%H:%M"),
                "service": f"{service_times[node]} min"
            })
        
            total_dist_affichee += dist_km
            current_time = arrival + service_times[node]

        prev_node = node
        index = solution.Value(routing.NextVar(index))

    # Retour dépôt
    dist_back = shortest_dist_matrix[prev_node][0]
    dur_back = time_matrix[prev_node][0]
    arrival_back = current_time + dur_back

    route_steps.append({
        "from": lieux[prev_node],
        "to": DEPOT_NAME,
        "distance_km": round(dist_back, 2),
        "travel_time_min": round(dur_back, 1),
        "departure": (slot_start + timedelta(minutes=current_time - actual_depart)).strftime("%H:%M"),
        "arrival": (slot_start + timedelta(minutes=arrival_back - actual_depart)).strftime("%H:%M")
    })

    total_dist_affichee += dist_back

    return {
        "vehicle": vehicule,
        "departure_time": slot_start.strftime("%H:%M"),
        "total_distance_km": round(total_dist_affichee, 2),
        "total_time_min": round(arrival_back - actual_depart, 1),
        "route_steps": route_steps,
        "dropped_customers": dropped_nodes,
        "status": "success"
    }

# ===================================================================
# run_tdvrptw_flexible → inchangé (juste appel de la fonction modifiée)
# ===================================================================
def run_tdvrptw_flexible(request, max_vehicles=None):
    result = simulate_route(request)
    if len(result) < 6:
        return {"error": "Données manquantes"}, 400

    matrice_duree, matrice_distance, (Dmat_global, Tmat_global, N0, S, H_slots, H), _, villes, initial_data = result
    
    if not S:
        return {"solution": [], "status": "no_solution", "villes": villes, "initial_data": initial_data}, 200

    vehicles = [v for v in S if v in matrice_distance]

    args_list = [(v, matrice_distance, Dmat_global, Tmat_global, S, H_slots, 0) for v in vehicles]
    results = []

    with ThreadPoolExecutor() as executor:
        futures = [executor.submit(optimize_vehicle_ortools, a) for a in args_list]
        for f in futures:
            try:
                r = f.result()
                if r["status"] != "skipped":
                    results.append(r)
            except Exception as e:
                print(f"[ERREUR ORTOOLS] {e}")

    if not results:
        return {"solution": [], "status": "no_solution", "villes": villes, "initial_data": initial_data}, 200
    
    print(results)
    return {"solution": results, "status": "success", "villes": villes, "initial_data": initial_data}, 200