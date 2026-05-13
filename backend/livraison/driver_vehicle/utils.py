import threading
from pymongo import MongoClient

lock = threading.Lock()

def get_all_product_history():
    try:
        client = MongoClient('mongodb://mongodb:27017/')
        db = client['livraison']
        collection = db['article']
        documents = list(collection.find({"state": "done"}))
        for doc in documents:
            doc['_id'] = str(doc['_id'])
        client.close()
        return documents
    except Exception as e:
        print(f"Erreur lors de la récupération de l'historique des produits : {e}")
        return []

def lire_json():
    """
    Lit les données des véhicules depuis la collection MongoDB de manière thread-safe.

    Returns:
        list: Une liste de dictionnaires contenant les données des véhicules.
    """
    with lock:
        try:
            client = MongoClient('mongodb://mongodb:27017/')
            db = client['livraison']
            collection = db['vehicules']
            documents = list(collection.find())
            client.close()
            
            # Supprimer l'_id de chaque document pour compatibilité avec les vues
            for doc in documents:
                doc.pop('_id', None)
            return documents
        except Exception as e:
            print(f"Erreur lors de la lecture des véhicules : {str(e)}")
            return []

def ecrire_json(data):
    """
    Écrit les données des véhicules dans la collection MongoDB de manière thread-safe.
    Calcule le volume (en m³) pour chaque véhicule à partir de ses dimensions avant insertion.

    Args:
        data (list): Une liste de dictionnaires représentant les véhicules.
    """
    with lock:
        try:
            client = MongoClient('mongodb://mongodb:27017/')
            db = client['livraison']
            collection = db['vehicules']
            
            # Calculer le volume pour chaque véhicule
            for vehicule in data:
                dimension = vehicule.get("Dimension", "")
                if dimension:
                    try:
                        # Supprimer les espaces et diviser par 'x'
                        dimensions = [float(x.strip()) for x in dimension.split('x')]
                        if len(dimensions) == 3:
                            longueur, largeur, hauteur = dimensions
                            volume = longueur * largeur * hauteur
                            vehicule["volume"] = volume
                        else:
                            print(f"Format de dimension invalide pour le véhicule {vehicule.get('Mat', 'inconnu')}: {dimension}")
                            vehicule["volume"] = None
                    except ValueError as e:
                        print(f"Erreur lors du parsing des dimensions pour le véhicule {vehicule.get('Mat', 'inconnu')}: {str(e)}")
                        vehicule["volume"] = None
                else:
                    print(f"Dimension manquante pour le véhicule {vehicule.get('Mat', 'inconnu')}")
                    vehicule["volume"] = None
            
            # Supprimer tous les documents existants
            collection.delete_many({})
            # Insérer les nouveaux documents
            if data:
                collection.insert_many([dict(d) for d in data])
            client.close()
        except Exception as e:
            print(f"Erreur lors de l'écriture des véhicules : {str(e)}")
            client.close()
            
def lire_vehicules_actifs():
    """
    Lit les véhicules actifs (active: true) depuis la collection MongoDB de manière thread-safe.
    Calcule le volume si absent pour chaque véhicule.

    Returns:
        list: Une liste de dictionnaires contenant les véhicules actifs avec leurs champs, incluant _id et volume.
    """
    with lock:
        try:
            client = MongoClient('mongodb://mongodb:27017/')
            db = client['livraison']
            collection = db['vehicules']
            documents = list(collection.find({"active": True}))
            result = []
            for doc in documents:
                doc['_id'] = str(doc['_id'])
                if 'volume' not in doc or doc['volume'] is None:
                    dimension = doc.get("Dimension", "")
                    if dimension:
                        try:
                            dimensions = [float(x.strip()) for x in dimension.split('x')]
                            if len(dimensions) == 3:
                                longueur, largeur, hauteur = dimensions
                                volume = longueur * largeur * hauteur
                                doc['volume'] = volume
                                # Mettre à jour le document dans MongoDB
                                collection.update_one(
                                    {"_id": ObjectId(doc['_id'])},
                                    {"$set": {"volume": volume}}
                                )
                            else:
                                doc['volume'] = None
                        except ValueError as e:
                            print(f"Erreur lors du parsing des dimensions pour le véhicule {doc.get('Mat', 'inconnu')}: {str(e)}")
                            doc['volume'] = None
                    else:
                        doc['volume'] = None
                result.append({
                    "_id": doc['_id'],
                    "Vehicule": doc.get("Vehicule", ""),
                    "Type": doc.get("Type", ""),
                    "Immatriculation": doc.get("Immatriculation", ""),
                    "Tonnage": doc.get("Tonnage", ""),
                    "Dimension": doc.get("Dimension", ""),
                    "active": doc.get("active", False),
                    "volume": doc.get("volume")
                })
            
            client.close()
            return result
        except Exception as e:
            print(f"Erreur lors de la lecture des véhicules actifs : {str(e)}")
            client.close()
            return []