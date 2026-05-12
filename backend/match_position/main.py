from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends, status,Request
from fastapi.security import HTTPBearer
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import jwt
from datetime import datetime, timedelta
import json
import sqlite3
from rich import print
import pandas as pd
from functools import lru_cache
import asyncio
from geo import *
from typing import Dict, List, Optional
from passlib.context import CryptContext
from pymongo import MongoClient
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from reporting.db.excel_report import router as excel_router

app = FastAPI(title="Livraison FastAPI – Version Finale APK")
app.include_router(excel_router, prefix="/excel_report")
SECRET_KEY = "super_secret_data_2025_change_me_en_prod!"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24
DB_FILE = "livraison_data.db"
DJANGO_API_KEY = "viseo2025_UltraSecretKey_9x8k2m4z_PleaseChangeMe"

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

oauth2_scheme = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_db_collection(name: str):
    client = MongoClient('mongodb://127.0.0.1:27017')
    return client['livraison'][name]

class UserCreate(BaseModel):
    Immatriculation: str
    password: str

class UserLogin(BaseModel):
    Immatriculation: str
    password: str

last_axes_data: Optional[dict] = None

def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("CREATE TABLE IF NOT EXISTS key_value (key TEXT PRIMARY KEY, value TEXT)")
    conn.commit()
    conn.close()

def save_axes():
    if last_axes_data is None: return
    conn = sqlite3.connect(DB_FILE)
    conn.execute("INSERT OR REPLACE INTO key_value (key, value) VALUES (?, ?)",
                 ("last_axes_data", json.dumps(last_axes_data)))
    conn.commit()
    conn.close()

def load_axes():
    global last_axes_data
    conn = sqlite3.connect(DB_FILE)
    row = conn.execute("SELECT value FROM key_value WHERE key = ?", ("last_axes_data",)).fetchone()
    conn.close()
    if row:
        last_axes_data = json.loads(row[0])


@lru_cache(maxsize=20000)
def get_proximity_cached(lieu: str):
    return get_proximity(lieu)

current_deliveries_apk: Dict[str, List[dict]] = {}

async def safe_send(websocket: WebSocket, data: dict):
    try:
        await websocket.send_text(json.dumps(data, ensure_ascii=False))
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        print(f"[FastAPI] Erreur d'envoi WebSocket : {e}")


def create_jwt(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_driver(credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        immat = payload.get("sub")
        if not immat:
            raise HTTPException(status_code=401, detail="Token invalide")
        return immat.strip().upper()
    except Exception as e:
        print(f"Token invalide: {e}")
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

@app.on_event("startup")
async def startup():
    init_db()
    load_axes()
    print("FastAPI démarré → Axes chargés, prêt pour Django + APK")

async def process_dataframe(df_json_str: str, websocket: WebSocket = None):
    global last_axes_data
    try:
        df = pd.DataFrame(json.loads(df_json_str))
    except Exception as e:
        if websocket:
            await safe_send(websocket, {"type": "error", "message": f"Erreur parsing JSON: {e}"})
        return None
    total = len(df)
    df['rn'] = None
    step = max(1, total // 20)
    for i in range(0, total, step):
        end = min(i + step, total)
        chunk = df.iloc[i:end]
        def safe_get_rn(lieu):
            res = get_proximity_cached(lieu)
            if res is None:
                return None
            return res
        df.loc[i:end, 'rn'] = chunk['lieu'].apply(lambda x: (safe_get_rn(x) or {}).get('RN'))
        df.loc[i:end, 'latitude'] = chunk['lieu'].apply(lambda x: (safe_get_rn(x) or {}).get('latitude'))
        df.loc[i:end, 'longitude'] = chunk['lieu'].apply(lambda x: (safe_get_rn(x) or {}).get('longitude'))
        if websocket:
            percent = int(end / total * 100)
            await safe_send(websocket, {"type": "progress", "percent": percent})
        await asyncio.sleep(0)
    axes = df.groupby('rn').apply(
    lambda grp: [
        {row['lieu']: {'longitude': row['longitude'], 'latitude': row['latitude']}} 
        for _, row in grp.iterrows()
    ]
    ).to_dict()
    if websocket:
        await safe_send(websocket, {"type": "result", "data": axes})
    last_axes_data = axes
    return axes

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connecté")
    try:
        raw = await websocket.receive_text()
        await process_dataframe(raw, websocket)
    except WebSocketDisconnect:
        print("Client déconnecté")
    except Exception as e:
        await safe_send(websocket, {"type": "error", "message": str(e)})


@app.post("/android")
async def receive_vrp_result(request: Request, x_api_key: str = Header(None)):
    if x_api_key != DJANGO_API_KEY:
        raise HTTPException(status_code=403, detail="Clé API invalide")
    try:
        raw_data = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON invalide")
    if not isinstance(raw_data, dict):
        raise HTTPException(status_code=400, detail=f"Format de données racine inattendu. 'dict' attendu, mais reçu '{type(raw_data).__name__}'.")
    global current_deliveries_apk
    transformed = {}
    for immat_raw, route_data in raw_data.items():
        try:
            immat = str(immat_raw).strip().upper()
            if not isinstance(route_data, list) or len(route_data) < 3:
                print(f"[Avertissement] Données de route pour '{immat}' sont invalides ou incomplètes. Ignoré.")
                continue

            delivery_list = route_data[2]
            position=route_data[0]
            if not isinstance(delivery_list, list) or not isinstance(position, list):
                print(f"[Avertissement] La liste des livraisons pour '{immat}' est invalide. Ignoré.")
                continue

            deliveries_for_apk = []
            for step in delivery_list:
                city=step.get("lieu_livraison", "")
                for elem in position:
                    if str(city).strip() in elem:
                        step["latitude"]=str(elem).split("(")[1].split(",")[0]
                        step["longitude"]=str(elem).split("(")[1].split(",")[1].replace(")","")
                        break
                if not isinstance(step, dict):
                    print(f"[Avertissement] Élément de livraison non-conforme pour '{immat}': {step}. Ignoré.")
                    continue

                deliveries_for_apk.append({
                    "id": step.get("id"),
                    "commande_id": step.get("commande_id"),
                    "article": step.get("article"),
                    "quantite": step.get("quantite"),
                    "poids_unitaire_kg": float(step.get("poids_unitaire_kg", 0)),
                    "volume_unitaire_m3": float(step.get("volume_unitaire_m3", 0)),
                    "client": step.get("client", "Inconnu"),
                    "telephone": step.get("telephone", ""),
                    "lieu_livraison": step.get("lieu_livraison", ""),
                    "latitude":step.get("latitude",""),
                    "longitude":step.get("longitude","")
                    
                })
            transformed[immat] = deliveries_for_apk
            print(deliveries_for_apk)
        except Exception as e:
            print(f"Erreur inattendue lors du traitement du véhicule '{immat_raw}': {e}")
            continue
    current_deliveries_apk = transformed
    return {"success": True, "camions": len(transformed), "message": "Données reçues avec succès"}


@app.get("/my-deliveries")
async def my_deliveries(immat: str = Depends(get_current_driver)):
    deliveries = current_deliveries_apk.get(immat, [])
    return {immat: deliveries}

@app.post("/login")
async def login(creds: UserLogin):
    immat = creds.Immatriculation.strip().upper()
    user = get_db_collection("vehicules").find_one({"Immatriculation": immat})
    if not user:
        raise HTTPException(status_code=401, detail="Immatriculation inconnue")
    stored_password = user.get("password", "")
    if stored_password.startswith("$2"):
        if not pwd_context.verify(creds.password, stored_password):
            raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    else:
        if stored_password != creds.password:
            raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    if not stored_password.startswith("$2"):
        try:
            new_hash = pwd_context.hash(creds.password)
            get_db_collection("vehicules").update_one(
                {"Immatriculation": immat},
                {"$set": {"password": new_hash}}
            )
            print(f"Mot de passe ré-hashé (bcrypt) pour {immat}")
        except Exception as e:
            print(f"Échec du ré-hashage bcrypt: {e}")
    token = create_jwt({"sub": immat})
    return {
        "access_token": token,
        "token_type": "bearer"
    }
@app.get("/last-axes")
async def get_last_axes():
    if not last_axes_data or len(last_axes_data) == 0:
        return {"status": "success", "data": {}}
    return {"status": "success", "data": last_axes_data}


