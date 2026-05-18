import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from time import sleep
from pymongo import MongoClient, UpdateOne
from tqdm import tqdm
import schedule
from rich import print
import time
import sys


SCRIPT = "schedule_request.py"
BASE_URL = "https://api.tag-ip.com/track/v3/trackables"
HEADERS = {
    "X-API-KEY": "q5UVwHJyP6CM1vA9HZggTkuyDSfKyz8O510iLrCT2ys"
}
db_name = 'livraison'
collection_name = 'reporting'

marques = [
    'FORLAND', 'JMC', 'ISUZU', 'MAZDA', 'CHERY', 'NISSAN', 'KEYTON','HYUNDAI', 'KARRY', 'GMC', 'DFSK', 'FORD', 'DFM', 'HINO', 'JAC', 'FOTON',
    'TOYOTA', 'RENAULT', 'MITSUBISHI', 'SUZUKI', 'CIVIC', 'TATA','T-KING', 'CHEVROLET', 'PEUGEOT', 'GEELY', 'FIAT', 'HAVAL',
    'KIA', 'BMW', 'MERCEDES', 'VOLKSWAGEN', 'DACIA', 'MAN', 'SINOTRUK'
]

def get_date():
    return datetime.now().strftime("%d/%m/%Y")

def get_trackables():
    url = BASE_URL
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    data = response.json().get("data", [])
    df = pd.DataFrame(data)
    if 'category' not in df.columns:
        df['category'] = None
    if 'label' not in df.columns:
        df['label'] = None
    return df

def fetch_fleet_info(trackable_id):
    url = f"{BASE_URL}/{trackable_id}/fleets"
    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        data = response.json().get("data", [])
        print(data)
        if data:
            attrs = data[0].get("attributes", {})
            return {"category": attrs.get("name", ""), "label": attrs.get("label", "")}
    except Exception:
        pass
    return {"category": "", "label": ""}

def enrich_dataframe(df):
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_index = {
            executor.submit(fetch_fleet_info, row['id']): index
            for index, row in df.iterrows()
        }
        disable_tqdm = not sys.stdout.isatty()
        for future in tqdm(as_completed(future_to_index), total=len(future_to_index), desc="Enrichissement", disable=disable_tqdm):
            index = future_to_index[future]
            try:
                result = future.result()
                df.at[index, 'category'] = result['category']
                df.at[index, 'label'] = result['label']
            except Exception:
                pass

def get_mark(mark_list, name):
    if not isinstance(name, str):
        return None
    name = name.upper()
    for mark in mark_list:
        if mark.upper() in name:
            return mark
    return None

def mongo_upsert_reporting(records):
    client = MongoClient("mongodb://mongodb:27017/")
    db = client[db_name]
    collection = db[collection_name]
    operations = []
    for record in records:
        if 'id' not in record or 'Date' not in record:
            continue
        filter_ = {"id": record["id"], "Date": record["Date"]}
        operations.append(UpdateOne(filter_, {"$set": record}, upsert=True))
    
    if operations:
        result = collection.bulk_write(operations)
        print(f"Documents mis à jour : {result.modified_count}, insérés : {result.upserted_count}")
    else:
        print("Aucun document à traiter.")
    
    client.close()

def get_odometer():
    print("Démarrage de la synchronisation odomètre...")
    try:
        df = get_trackables()
        if not df.empty:
            enrich_dataframe(df)
        df_filtered = df[df['category'] == 'LIVRAISON'].reset_index(drop=True)
        if df_filtered.empty:
            print("Aucun véhicule de type 'LIVRAISON' trouvé.")
            return

        TRIP_BASE = "https://api.tag-ip.com/track/v3/trackables"

        current_run_time = datetime.now()
        disable_tqdm = not sys.stdout.isatty()

        for index, row in tqdm(
            df_filtered.iterrows(),
            total=len(df_filtered),
            desc="Véhicules",
            disable=disable_tqdm
        ):
            try:
                id_ = str(row['id'])
                trip_url = f"{TRIP_BASE}/uuid/{id_}/trips"
                odometer_request = requests.get(trip_url, headers=HEADERS).json()
                print(odoometer_request)
                odometer_value = odometer_request.get("data", [])
                attributes = row.get('attributes', {})
                df_filtered.at[index, 'Marque'] = get_mark(marques, attributes.get('name', ''))
                df_filtered.at[index, 'Vehicules'] = str(attributes.get('name', '')).strip()
                df_filtered.at[index, 'Immatriculation'] = attributes.get('license_plate')
                df_filtered.at[index, 'Date'] = get_date()
                df_filtered.at[index, 'Database_date'] = current_run_time
                odometer_km = 0
                service_time = 0
                stop_duration = 0
                fuel_variation=0
                distance_km=0
                differences_km = []
                differences = []
                for elem in odometer_value:
                    attrs = elem.get('attributes', {})
                    differences_km.append(int(attrs.get('end_odometer')))
                for i in range(len(differences_km) - 1, 0, -1):
                    diff = differences_km[i] - differences_km[i-1]
                    differences.append(diff)
                distance_km /= 1000
                for elem in odometer_value:
                    attrs = elem.get('attributes', {})
                    fuel = attrs.get('fuel_volume_variation')
                    if fuel is not None:
                        try:
                            fuel_variation += int(fuel)
                        except (ValueError, TypeError):
                            pass
                
                for elem in odometer_value:
                    attrs = elem.get('attributes', {})
                    duration = attrs.get('duration')
                    if duration is not None:
                        try:
                            service_time += int(duration)
                        except (ValueError, TypeError):
                            pass

                for elem in odometer_value[1:]:
                    attrs = elem.get('attributes', {})
                    duration = attrs.get('stop_duration')
                    if duration is not None:
                        try:
                            stop_duration += int(duration)
                            
                        except (ValueError, TypeError):
                            pass

                for elem in reversed(odometer_value):
                    attrs = elem.get('attributes', {})
                    if 'end_odometer' in attrs and attrs['end_odometer'] is not None:
                        try:
                            odometer_km = attrs['end_odometer'] / 1000
                            break
                        except (TypeError, ValueError):
                            continue

                df_filtered.at[index, 'odometer'] = odometer_km
                df_filtered.at[index, 'Service'] = service_time
                df_filtered.at[index, 'Stop_service'] = stop_duration
                df_filtered.at[index,'fuel']=fuel_variation
                df_filtered.at[index,"distance"]=int(sum(differences))/1000
                sleep(1)
            except Exception as e:
                continue
        records = df_filtered.to_dict(orient='records')
        mongo_upsert_reporting(records)
        df_filtered.to_csv('odometer_livraison.csv', index=False)
        print("Synchronisation terminée.")

    except Exception as e:
        print(f"Erreur dans get_odometer() : {e}")

def job():
    try:
        get_odometer()
    except Exception as e:
        print(f"Erreur lors de l'exécution planifiée : {e}")

if __name__ == "__main__":
    print("Lancement du scheduler : exécution toutes les minutes")
    schedule.every(1).minutes.do(job)
    job()
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nArrêt du scheduler par l'utilisateur.")