from io import StringIO
import requests
import aiohttp
import asyncio
import time
import threading
from collections.abc import Iterable
from collections import defaultdict
from pymongo.collection import Collection
import time
import threading
from typing import List, Dict, Any
import logging
import traceback
import numpy as np
from django.conf import settings
import pandas as pd
from django.core.exceptions import ValidationError
from django.core.cache import cache
from .data import categories, lt
from thefuzz import fuzz
from fuzzywuzzy import process
from collections import defaultdict
import re
from .vertex import *
from joblib import Parallel, delayed
from django.contrib.auth.models import User
from .models import Department
from .vertex import *
from .incompatiblity import apply_incompatibilities_to_df
from django.db import transaction
import json
import ast
from concurrent.futures import ThreadPoolExecutor, as_completed
import pytz
from datetime import datetime
from pymongo import MongoClient
import os

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
from rest_framework.response import Response
import random


def clean_record_for_mongo(record):
    """
    Recursively clean a dictionary or list of non-BSON-encodable types.
    - Converts pandas NaT and numpy NaN to None.
    - Converts numpy numeric types to standard Python types.
    """
    if isinstance(record, dict):
        return {k: clean_record_for_mongo(v) for k, v in record.items()}
    if isinstance(record, list):
        return [clean_record_for_mongo(v) for v in record]
    if pd.isna(record):
        return None
    if isinstance(record, np.integer):
        return int(record)
    if isinstance(record, np.floating):
        return float(record)
    if isinstance(record, np.bool_):
        return bool(record)
    return record


@transaction.atomic
def create_user_with_department(username, password, department_name):
    """
    Crée un utilisateur avec un département spécifié.
    Si le département n'existe pas, il est créé.

    Args:
        username (str): Le nom d'utilisateur.
        password (str): Le mot de passe de l'utilisateur.
        department_name (str): Le nom du département.

    Returns:
        tuple: Un tuple contenant l'utilisateur et le département créés.
    """
    department, created = Department.objects.get_or_create(name=department_name)
    user = User.objects.create_user(username=username, password=password)
    # Ici, vous pouvez lier l'utilisateur au département si votre modèle le permet.
    # Exemple: user.profile.department = department
    return user, department

def generate_and_send_to_fastapi():
    df = generate_articles()
    if df.empty:
        return
    payload = {
        "generation_info": {
            "date": df.iloc[0]['planification_date'],
            "period": df.iloc[0]['period'],
            "heure": datetime.now(eat_tz).strftime("%H:%M:%S"),
            "total": len(df),
            "source": "Odoo + Mongo + Adresses"
        },
        "data": df.to_dict('records'),  # TOUTES LES DONNÉES
        "stats": {
            "quantite_moyenne": round(df['quantity'].mean(), 1),
            "lieux": df['lieu'].unique().tolist()
        },
        "columns": df.columns.tolist(),
        "sample": df.head(5).to_dict('records')
    }

    try:
        requests.post(FASTAPI_PROCESS, json=payload, timeout=10)
        logging.info("Django → FastAPI : TOUT envoyé !")
        threading.Thread(target=ping_fastapi).start()
    except Exception as e:
        logging.error(f"FastAPI HS: {e}")

def ping_fastapi():
    """Étape 3 : Demande toutes les 3s jusqu’à réponse"""

    try:
        resp = requests.get(FASTAPI_READY, timeout=5)
        if resp.status_code == 200 and resp.json().get("ready"):
            data = resp.json()
            save_final_data(data)
            print("DING ! FastAPI a fini !")
    except:
        pass


def save_final_data(response):
    df = pd.DataFrame(response["data"])
    client = MongoClient(MONGO_URI)
    coll = client.livraison.article
    for rec in df.to_dict('records'):
        coll.update_one({"ref_produit": rec["ref_produit"]}, {"$set": rec}, upsert=True)
    client.close()
    logging.info(f"{len(df)} colis finaux sauvés !")

def generate_articles():
    """
    Génère ou récupère des articles depuis MongoDB pour la date et période actuelles.
    """
    
    eat_tz = pytz.timezone('Africa/Nairobi')
    current_time = datetime.now(eat_tz)
    plan_date = current_time.strftime("%Y-%m-%d")
    plan_time = current_time.strftime("%H:%M")
    hour = current_time.hour
    minute = current_time.minute
    period = 'am' if hour < 12 or (hour == 12 and minute == 0) else 'pm'

    # Connexion à MongoDB
    client = MongoClient(MONGO_URI)
    db = client["livraison"]
    articles_collection = db["article"]
    adresses_collection = db["adress"]

    # Vérifier si articles existent pour date/période
    existing_articles = list(articles_collection.find({
        "planification_date": plan_date,
        "period": period
    }, {"_id": 0}))  # Exclut _id pour clean dicts

    if existing_articles:
        logging.info(f"Retour de {len(existing_articles)} articles existants pour {plan_date} {period}")
        client.close()
        return existing_articles

    # Sinon, générer
    result_list = []
    odoo_thread = threading.Thread(target=fetch_odoo_data_init, args=(result_list,))
    odoo_thread.start()
    odoo_thread.join()

    if not result_list:
        logging.warning("Aucun résultat de fetch_odoo_data_init")
        client.close()
        return []

    df = result_list[0] if isinstance(result_list[0], pd.DataFrame) else pd.DataFrame(result_list)
    if df.empty:
        logging.warning("DataFrame vide")
        client.close()
        return []

    df['planification_date'] = plan_date
    df['planification_time'] = plan_time
    df['numero_devis'] = ['V.25.{:04d}'.format(np.random.randint(100, 1001)) for _ in range(len(df))]
    df['period'] = period
    df['state'] = 'draft'
    articles = df.to_dict('records')

    # Récupérer adresses
    adresses = list(adresses_collection.find({}, {
        "_id": 0,
        "client_email": 1,
        "quantity": 1,
        "number": 1,
        "client_name": 1,
        "Adresse_client": 1,
        "Adresse_livraison": 1
    }))

    if not adresses:
        logging.warning("Aucune adresse trouvée")
        client.close()
        return []

    # Associer adresses
    results = []
    for article in articles:
        adresse = random.choice(adresses)
        adresse_str = adresse.get("Adresse_livraison", adresse.get("Adresse_client", "Inconnu"))
        adresse_parts = adresse_str.split(",")
        quantite = int(str(adresse.get("quantity", 0)).replace(',', ''))
        if quantite > 20:
            quantite = random.randint(1, 20)
        lieu = adresse_parts[-2].strip() if len(adresse_parts) >= 2 else "Inconnu"

        result = {
            "ref_produit": article.get("Reference", ""),
            "Name": article.get("Name", ""),
            "Category": article.get("Category", ""),
            "Brand_classification": article.get("Brand_classification", ""),
            "planification_date": plan_date,
            "planification_time": plan_time,
            "period": period,
            "state": "draft",
            "lieu": lieu,
            "adresse_livraison": adresse_str,
            "client_email": adresse.get("client_email", ""),
            "quantity": quantite,
            "number": adresse.get("number", ""),
            "client_name": adresse.get("client_name", ""),
            "Adresse_client": adresse.get("Adresse_client", ""),
            "numero_devis": article.get("numero_devis", ""),
        }
        results.append(result)

    # Insérer synchrone (fiable, assume volume petit)
    if results:
        articles_collection.insert_many([dict(r) for r in results])
        logging.info(f"Insérés {len(results)} articles")

    client.close()
    return pd.DataFrame(results)

    # except Exception as e:
    #     logging.error(f"Erreur dans generate_articles : {str(e)}\n{traceback.format_exc()}")
    #     return []

def check_duplicates(categories_map):
    """
    Vérifie les sous-catégories dupliquées dans le dictionnaire des catégories.

    Args:
        categories_map (dict): Un dictionnaire de catégories.
    """
    subcategory_count = defaultdict(list)
    for main_category, subcategories in categories_map.items():
        for sub in subcategories:
            subcategory_count[sub].append(main_category)
    
    duplicates = {sub: cats for sub, cats in subcategory_count.items() if len(cats) > 1}
    if duplicates:
        # Les doublons trouvés peuvent être loggés si nécessaire
        pass
    else:
        # Aucune duplication trouvée
        pass

def process_row_vertex(index, row, detect_product_category, extract_grand_theme, extract_taille):
    """
    Traite une ligne du DataFrame pour enrichir les colonnes 'Type' et 'Taille'.
    
    Args:
        index: Index de la ligne dans le DataFrame.
        row: Ligne du DataFrame (pandas Series).
        detect_product_category: Fonction pour détecter la catégorie du produit.
        extract_grand_theme: Fonction pour extraire le thème principal.
        extract_taille: Fonction pour extraire la taille.
    
    Returns:
        tuple: (index, type_value, taille_value)
    """
    type_value = None
    taille_value = None
    
    # Traitement pour la colonne 'Type'
    text_to_process = ""
    if not row.get('Type'):
        if not row.get('corespondance'):
            text_to_process = str(row.get('Name'))
        if row.get('corespondance'):
            text_to_process = str(row.get('corespondance')) + " " + str(row.get('Name'))
        if text_to_process:
            try:
                result_vertex = detect_product_category(text_to_process)
                type_value = extract_grand_theme(result_vertex).strip()
            except:
                type_value = ''
    
    # Traitement pour la colonne 'Taille'
    try:
        text_to_process_total = str(row.get('Type', type_value or '')) + "/" + str(row.get('Name'))
        result_vertex = detect_product_category(text_to_process_total)
        taille_value = extract_taille(result_vertex).strip()
    except:
        taille_value = None
    
    return index, type_value, taille_value

def get_vertex(data, max_workers=8):
    result_data = data.copy()
    futures = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:

        for index, row in result_data.iterrows():
            future = executor.submit(
                process_row_vertex, 
                index, 
                row, 
                detect_product_category, 
                extract_grand_theme, 
                extract_taille
            )
            futures.append(future)
        
        # Collecter les résultats
        for future in as_completed(futures):
            try:
                index, type_value, taille_value = future.result()
                if type_value is not None:
                    result_data.at[index, 'Type'] = type_value
                if taille_value is not None:
                    result_data.at[index, 'Taille'] = taille_value
            except Exception as e:
                print(f"Erreur lors du traitement de la ligne {index}: {e}")
    result_data = result_data.replace([np.nan, float('inf'), float('-inf')], None)
    return result_data

def concat_colonne(row, columns, separator=" "):
    """
    Concatène les valeurs des colonnes spécifiées dans 'row' avec un séparateur.
    Ajoute le résultat dans une nouvelle clé 'Compatibilte'.
    
    Args:
        row (dict): Dictionnaire représentant une ligne de données.
        columns (list): Liste des noms de colonnes à concaténer.
        separator (str): Séparateur utilisé entre les valeurs (par défaut : " / ").
    
    Returns:
        dict: Le dictionnaire 'row' avec la nouvelle clé 'Compatibilte'.
    """
    # Filtrer les valeurs valides (non None et non vides après strip)
    valid_values = [str(row.get(col, '')).strip() for col in columns if row.get(col) is not None and str(row.get(col)).strip()]
    row['Compatibilte'] = separator.join(valid_values) if valid_values else ''
    return row    

def process_row(data, categories_map):
    """
    Normalise les catégories d'un DataFrame en utilisant une correspondance exacte ou floue.

    Args:
        data (pd.DataFrame): Le DataFrame à normaliser.
        categories_map (dict): Un dictionnaire de mapping des catégories.

    Returns:
        pd.DataFrame: Le DataFrame avec les catégories normalisées.
    """
    check_duplicates(categories_map)
    data = pd.DataFrame(data).fillna("")
    all_subcategories = {item: key for key, sublist in categories_map.items() for item in sublist}
    data['Type'] = ""
    def find_match(original_category):
        """
        Trouve une correspondance pour une catégorie, de manière exacte ou floue.

        Args:
            original_category (str): La catégorie originale à trouver.

        Returns:
            str: La catégorie principale correspondante ou une chaîne vide.
        """
        original_category = str(original_category).strip()
        normalized = ""
        if original_category in all_subcategories:
            normalized = all_subcategories[original_category]
        else:
            for main_category, sub_categories_list in categories_map.items():
                for sub_category in sub_categories_list:
                    if fuzz.partial_ratio(sub_category, original_category) >= 90:
                        normalized = main_category
                        break
                if normalized:
                    break
        return normalized
    data['Type'] = Parallel(n_jobs=-1)(delayed(find_match)(row) for row in data['Category'])
    return data

def get_corespondance(x, lt, column_name='text', threshold=99):
    """
    Trouve la meilleure correspondance pour un texte donné dans une liste de choix.

    Args:
        x (pd.DataFrame): Le DataFrame contenant le texte.
        lt (list): La liste des correspondances possibles.
        column_name (str): Le nom de la colonne à utiliser pour la correspondance.
        threshold (int): Le seuil de confiance pour la correspondance.

    Returns:
        pd.DataFrame: Le DataFrame avec une nouvelle colonne 'corespondance'.
    """
    lt_clean = [str(elem).strip().lower() for elem in lt]
    x = x.copy()
    x['clean_text'] = x[column_name].astype(str).str.strip().str.lower()
    matches = x['clean_text'].apply(lambda s: '/' in s and len(s) > 3)

    def find_best_match(text):
        if not text:
            return None
        match = process.extractOne(text, lt_clean, scorer=fuzz.partial_ratio)
        return match[0] if match and match[1] >= threshold else None
    x.loc[matches, 'corespondance'] = Parallel(n_jobs=-1)(
        delayed(find_best_match)(t) for t in x.loc[matches, 'clean_text']
    )
    return x.drop(columns='clean_text')

def match_article(x, lt, column_name='dt', threshold=100):
    """
    Fait correspondre les articles d'un DataFrame à une liste de termes.

    Args:
        x (pd.DataFrame): Le DataFrame à traiter.
        lt (list): La liste de termes à laquelle faire correspondre.
        column_name (str): Le nom de la colonne contenant les articles.
        threshold (int): Le seuil de correspondance.

    Returns:
        pd.DataFrame: Le DataFrame avec les correspondances.
    """
    lt_clean = [str(elem).strip().lower() for elem in lt]
    x = x.copy()
    x['clean_text'] = x[column_name].astype(str).str.strip().str.lower()
    def find_best_match(text):
        if not text:
            return None
        for elem in lt_clean:
            if re.findall(rf'^{elem}', text):
                match = process.extractOne(text, lt_clean, scorer=fuzz.partial_ratio)
                return match[0] if match and match[1] >= threshold else None
        return None

    x['corespondance'] = Parallel(n_jobs=-1)(
        delayed(find_best_match)(t) for t in x['clean_text']
    )
    return x.drop(columns='clean_text')

def match_with_fallback(df, liste, column_name_article='dt', column_name_cat='xt'):
    """
    Tente une première correspondance avec `match_article`, puis utilise `get_corespondance` pour les valeurs manquantes.

    Args:
        df (pd.DataFrame): Le DataFrame à traiter.
        liste (list): La liste de correspondances.
        column_name_article (str): Le nom de la colonne pour `match_article`.
        column_name_cat (str): Le nom de la colonne pour `get_corespondance`.

    Returns:
        pd.DataFrame: Le DataFrame avec les correspondances complétées.
    """
    res = process_row(df, categories)
    res = match_article(res, liste, column_name=column_name_article, threshold=100)
    mask_none = res['corespondance'].isna()
    if mask_none.any():
        df_second = res.loc[mask_none].copy()
        res2 = get_corespondance(df_second, liste, column_name=column_name_cat, threshold=99)
        res.loc[mask_none, 'corespondance'] = res2['corespondance']
    logging.info(f"match_with_fallback returned DataFrame with shape: {res.shape}")
    return res

def get_token():
    """
    Récupère un jeton d'authentification depuis l'API, avec mise en cache.

    Returns:
        str: Le jeton d'accès.
    Raises:
        ValidationError: Si l'authentification échoue.
    """
    token = cache.get('odoo_api_token')
    if token:
        logging.info("Jeton récupéré depuis le cache")
        return token

    url = f"{settings.API_URL}/token"
    try:
        response = requests.post(
            url,
            params={"app_id": settings.APP_ID},
            headers={"accept": "application/json"},
            data=""
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("access_token") or data.get("token")
        if token:
            cache.set('odoo_api_token', token, timeout=86400)
            logging.info("Nouveau jeton obtenu et mis en cache")
        return token
    except Exception as e:
        logging.error(f"Erreur dans get_token : {str(e)}\n{traceback.format_exc()}")
        raise ValidationError(f"Erreur d'authentification : {str(e)}")

def fetch_odoo_data_init(result_list):
    """
    Exécute get_token et fetch_odoo_data_init dans un thread, stockant le résultat dans result_list.

    Args:
        result_list (list): Liste pour stocker le DataFrame résultant.
    """
    start_time = time.time()
    try:
        token = get_token()
        response = requests.get(
            f"{settings.API_URL}/get-all-product/",
            headers={
                "accept": "text/csv",
                "Authorization": f"Bearer {token}"
            },
            timeout=10
        )
        response.raise_for_status()
        csv_data = response.text
        df = pd.read_csv(StringIO(csv_data))
        print(df.shape)
        # if len(df) < 20:
        #     logging.warning(f"Le DataFrame contient {len(df)} lignes, moins que les 1000 demandées")
        #     sample_size = min(len(df), 100)
        # else:
        #     sample_size = 100
        df = df.sample(n=50, random_state=42)
        df['numero_devis'] = ['V.25.{:04d}'.format(np.random.randint(100, 1001)) for _ in range(len(df))]
        df = df.replace([np.nan, np.inf, -np.inf], '')
        logging.info(f"DataFrame après nettoyage : process_row, Colonnes : {df.columns.tolist()}")
        logging.info(f"Temps pour fetch_odoo_data_thread : {time.time() - start_time:.2f} secondes")
        result_list.append(df)
    except Exception as e:
        logging.error(f"Erreur dans fetch_odoo_data_thread : {str(e)}\n{traceback.format_exc()}")
        result_list.append(None)

def filter_products_by_date_and_period():
    """
    Filtre les produits de la base de données MongoDB en fonction de la date et de la période actuelles.

    Returns:
        pd.DataFrame: Un DataFrame contenant les enregistrements de produits filtrés.
                      Retourne une réponse d'erreur si aucune donnée n'est trouvée ou en cas d'exception.
    """
    try:
        start_time = time.time()
        eat_tz = pytz.timezone('Africa/Nairobi')
        current_time = datetime.now(eat_tz)
        today_date = current_time.strftime("%Y-%m-%d")
        logging.info(f"Date actuelle en EAT : {today_date}")
        logging.info(f"Heure actuelle en EAT : {current_time.strftime('%H:%M')}")
        hour = current_time.hour
        minute = current_time.minute
        period_filter = 'pm' if hour > 12 or (hour == 12 and minute > 0) else 'am'
        logging.info(f"Période filtrée : {period_filter}")
        query = {
            "planification_date": today_date,
            "state": "draft",
            "period": period_filter
        }
        client = MongoClient(MONGO_URI)
        db = client['livraison']
        collection = db['article']
        results = collection.find(query)
        records = list(results)
        client.close()
        logging.info(f"filter_products_by_date_and_period : {len(records)}")
        if not records:
            logging.warning("Aucun document trouvé pour la requête")
            return Response(
                {"error": f"Aucune donnée disponible pour la date {today_date} et période {period_filter}"},
                status=200
            )
        for record in records:
            record.pop('_id', None)
        df = pd.DataFrame(records)
        return df
    except Exception as e:
        logging.error(f"Erreur dans filter_products_by_date_and_period : {str(e)}\n{traceback.format_exc()}")
        return Response(
            {"error": f"Erreur serveur : {str(e)}"},
            status=500
        )

def update_document(record, collection):
    """
    Met à jour un document dans MongoDB pour un enregistrement donné.
    
    Args:
        record (dict): L'enregistrement à mettre à jour.
        collection: La collection MongoDB où effectuer la mise à jour.
    """
    try:
        query = {"ref_produit": record.get("ref_produit", "")}
        update_data = {k: v for k, v in record.items() if k != '_id'}
        collection.update_one(
            query,
            {"$set": update_data},
            upsert=True
        )
    except Exception as e:
        logging.error(f"Erreur lors de la mise à jour du document {record.get('ref_produit', '')}: {str(e)}")

def process_row_vol(index, name):
    """Fonction pour traiter une ligne et retourner l'index et le résultat."""
    if name.strip() != '' and pd.notna(name):
        try:
            result = generate_metrics(name.strip())
            return index,result
        except:
            pass

def clean_one_metric(args):
    index, row = args
    text = str(row['Metrics']).lower()
    cleaned = row['Metrics']
    if "erreur" in text or "exception" in text:
        cleaned_str = re.sub(r'.*(produit:|réponse_brute|``````)', '', str(cleaned)).replace('\\n ', "").strip()
        try:
            cleaned_str = re.findall(r'\{.*\}', cleaned_str, flags=re.DOTALL)[0].strip()
        except:
            pass
        try:
            cleaned_str = re.sub(r',\\n(.*$)', '}', cleaned_str)
        except:
            pass
        try:
            cleaned_str = re.sub(r'\s{2,}', ' ', cleaned_str)
            cleaned_str = "[" + cleaned_str.strip().replace('{ ', '{').replace(' }', '}') + "]"
            try:
                cleaned = ast.literal_eval(cleaned_str)
            except (ValueError, SyntaxError):
                cleaned = []
        except:
            cleaned = []
        proc = 1
    else:
        proc = 0
    return (index, cleaned, proc)

def clean_metrics_threaded(data, n_threads=4):
    with ThreadPoolExecutor(max_workers=n_threads) as executor:
        items = list(data.iterrows())
        for index, cleaned, proc in executor.map(clean_one_metric, items):
            data.at[index, 'Metrics'] = cleaned
            #data.at[index, 'proc'] = proc
    return data

def parallel_process_dataframe(df, max_workers=4):
    """Parallélise le traitement des lignes du DataFrame."""
    # Initialiser la colonne 'Metrics' si elle n'existe pas
    if 'Metrics' not in df.columns:
        df['Metrics'] = None
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(process_row_vol, index, row['Name']) 
                   for index, row in df.iterrows() if pd.notna(row['Name'])]
        for future in futures:
            index, result = future.result()
            results.append((index, result))
    assigned_count = 0
    for index, result in results:
        if result is not None:
            df.at[index, 'Metrics'] = result
            assigned_count += 1
    df=clean_metrics_threaded(df, n_threads=max_workers)
    return df

def migrate_fix_metrics_array():
    client = MongoClient(MONGO_URI)
    db = client['livraison']
    collection = db['article']
    # Corriger les docs où Metrics est un objet et non un tableau
    for doc in collection.find({"Metrics": {"$type": "object"}}):
        obj = doc['Metrics']
        collection.update_one(
            {"_id": doc['_id']},
            {"$set": {"Metrics": [obj]}}
        )
    # Corriger les docs où Metrics est une string
    for doc in collection.find({"Metrics": {"$type": "string"}}):
        try:
            obj = ast.literal_eval(doc['Metrics'])
            if isinstance(obj, list):
                collection.update_one({"_id": doc['_id']}, {"$set": {"Metrics": obj}})
            else:
                collection.update_one({"_id": doc['_id']}, {"$set": {"Metrics": [obj]}})
        except (ValueError, SyntaxError):
            collection.update_one({"_id": doc['_id']}, {"$set": {"Metrics": []}})
    client.close()

def merge_and_update_metrics(docs: List[Dict[str, Any]], collection: Collection, ref_field="Name"):
    """
    Aplati, fusionne et met à jour les Metrics dans MongoDB.

    Args:
        docs: Liste de documents contenant "Metrics".
        collection: Collection MongoDB à mettre à jour.
        ref_field: Champ MongoDB pour identifier le produit (par défaut "ref_produit").
    """
    
    # --- Fonction récursive pour aplatir les métriques ---
    def flatten_metrics(data):
        flat_list = []
        if isinstance(data, dict):
            if "erreur" not in data:
                flat_list.append(data)
        elif isinstance(data, (list, tuple)):
            for item in data:
                flat_list.extend(flatten_metrics(item))
        return flat_list

    # --- Collecter toutes les métriques valides ---
    all_metrics = []
    for doc in docs:
        metrics_data = doc.get("Metrics", [])
        all_metrics.extend(flatten_metrics(metrics_data))

    # --- Fusionner par produit ---
    merged_by_product = defaultdict(lambda: {
        "produit": None,
        "forme": None,
        "hauteur_cm": [],
        "longueur_cm": [],
        "largeur_cm": [],
        "rayon_cm": [],
        "facteur_forme": None,
        "volume_m3": 0,
        "mode_emballage": None,
        "facteur_emballage": 0,
        "volume_livraison_m3": [],
        "poids_kg": []
    })

    for m in all_metrics:
        key = m["produit"]
        merged = merged_by_product[key]
        merged["produit"] = m["produit"]
        merged["forme"] = m.get("forme") or merged["forme"]
        merged["facteur_forme"] = m.get("facteur_forme") or merged["facteur_forme"]
        merged["volume_m3"] = m.get("volume_m3") or merged["volume_m3"]
        merged["mode_emballage"] = m.get("mode_emballage") or merged["mode_emballage"]
        merged["facteur_emballage"] = m.get("facteur_emballage") or merged["facteur_emballage"]

        # Champs qui doivent être des listes
        for field in ["hauteur_cm", "longueur_cm", "largeur_cm", "rayon_cm", "volume_livraison_m3", "poids_kg"]:
            value = m.get(field)
            if isinstance(value, list):
                merged[field].extend(value)
            elif value is not None:
                merged[field].append(value)

    # --- Mettre à jour MongoDB ---
    final_metrics = list(merged_by_product.values())
    for metric in final_metrics:
        ref_produit = metric["produit"]
        collection.update_one(
            {ref_field: ref_produit},
            {"$set": {"Metrics": [metric]}},
            upsert=True
        )

    return final_metrics
def fetch_odoo_data():
    """
    Récupère les données de produits, les normalise, et les enrichit.

    Returns:
        pd.DataFrame: Le DataFrame final des produits traités.
    """
    df = generate_articles()
    df=pd.DataFrame(df)
    df = df.fillna('')
    df = parallel_process_dataframe(df, max_workers=8)
    print(df.columns)
    logging.info(f"generate_articles returned DataFrame with shape: process_row")
    df = process_row(df, categories)
    df = match_with_fallback(df, lt, column_name_article='Name', column_name_cat='Category')
    df = get_vertex(df)
    df = df.apply(lambda row: concat_colonne(row, ['Type', 'Taille'], separator=" "), axis=1)
    df = apply_incompatibilities_to_df(df)
    fields_to_clean = ['Incompatible_Articles', 'Incompatible_Condition', 'Taille', 'Type', 'corespondance']
    for field in fields_to_clean:
        if field in df.columns:
            df[field] = df[field].replace([None, np.nan], '')
            df[field] = df[field].apply(lambda x: '' if isinstance(x, list) and len(x) == 0 else x)
    client = MongoClient(MONGO_URI)
    db = client['livraison']
    collection = db['article']
    
    migrate_fix_metrics_array() # Run this first on existing data.

    for record in df.to_dict('records'):
        record = clean_record_for_mongo(record)
        
        ref_produit = record.get("ref_produit", "")
        name = record.get("Name", "")
        new_metric = record.get("Metrics", None)
        
        query = {"ref_produit": ref_produit, "Name": name}
        
        # Prepare the update for other fields
        update_data = {k: v for k, v in record.items() if k not in ['_id', 'Metrics']}
        
        update_op = {"$set": update_data}
        
        if new_metric:
            # Ensure new_metric is a list for $each
            if not isinstance(new_metric, list):
                new_metric = [new_metric]
            
            # We can't use $addToSet and $set on the same field in one op.
            # But we are setting other fields, and addToSet on Metrics. This is fine.
            update_op["$addToSet"] = {"Metrics": {"$each": new_metric}}

        collection.update_one(query, update_op, upsert=True)

    logging.info(f"Mis à jour/inséré {len(df)} documents dans MongoDB")
    client.close()
    df.to_csv(r'data.csv')
    return df