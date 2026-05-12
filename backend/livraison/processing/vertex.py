import vertexai
from vertexai.generative_models import GenerativeModel
from .data import *
import json
from django.conf import settings
from google.oauth2 import service_account
import re
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

credentials = None
credential_path = getattr(settings, 'GOOGLE_APPLICATION_CREDENTIALS', None)
if credential_path:
    try:
        credentials = service_account.Credentials.from_service_account_file(credential_path)
    except Exception as e:
        print(f"Could not load credentials from {credential_path}: {e}")

PROJECT_ID = "viseo-env-prod"     
LOCATION   = "us-central1"       
vertexai.init(project=PROJECT_ID, location=LOCATION, credentials=credentials)
model = GenerativeModel("gemini-2.0-flash-001")
def detect_product_category(text: str) -> dict:
    """
    Retourne un objet JSON { "grand_theme": "...", "sous_categorie": "...", "mot_liste": "..." }
    correspondant le mieux au texte produit.
    """
    prompt = f"""
        You are a product categorization expert. Your only task is to analyze a product description and return a single, valid JSON object with the specified fields.

        **Input Dictionaries:**
        1. Categories: {json.dumps(categories, ensure_ascii=False)}
        2. Keywords: {json.dumps(lt, ensure_ascii=False)}

        **Instructions:**
        1. Analyze the user's product text.
        2. Find the best `grand_theme` and `sous_categorie` from the Categories dictionary.
        3. Find the closest keyword from the Keywords list for `mot_liste`.
        
        5. **CRITICAL:** Your response MUST be ONLY the JSON object. No other text, explanations, or markdown. If a value cannot be found, use an empty string.
        6.Determine the `size` or specific type of the product according to the following rules:
            - **Electrical equipment**: Specify if it is a coil (cable), reel (cable), electrical component (IE), or fragile component.
            - **Construction material**: Specify if it is iron, sheet metal, bagged, drummed, or fragile.
            - **Spare part**: Specify if it is small, medium, large, or fragile.
            - **Lubricant**: Specify if it is in a carton, can, or drum.
            - **Tire**: Specify if it is for a light vehicle or heavy vehicle.
            - **Chemical product**: Specify if it is in a can, drum, or bag.
        7. Ensure that the selected values are accurate and true to the reality of the described product.
        8. Return **only** a JSON object with the following fields: `grand_theme`, `sous_categorie`, `mot_liste`, `size`. If a value cannot be determined, use an empty string ("").
        9. All responses must be in french.
                ---
        **Example:**

        **User:**
        Texte du produit: "FILTRE A AIR"

        **Assistant:**
        ```json
        {{
        "grand_theme": "PIÈCES DÉTACHÉES",
        "sous_categorie": "AUTOMOTIVE / FILTRE / AIR",
        "mot_liste": "filtre a air",
        "taille": "petit"
        }}
        ```
        ---

        **User:**
        Texte du produit: "{text}"

        **Assistant:**
        """


    resp = model.generate_content(prompt)
    return (resp.text)



def extract_grand_theme(text: str) -> Optional[str]:
    """
    Extrait la valeur de grand_theme depuis une chaîne contenant
    éventuellement des balises ```json … ``` et un bloc { ... }.
    Retourne la valeur (str) ou None si non trouvé.
    """
    # Supprimer les balises ```json … ```
    clean = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE)
    match_braces = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not match_braces:
        return None
    inside = match_braces.group(0)
    match_theme = re.search(r'"grand_theme"\s*:\s*"([^"]+)"', inside)
    if match_theme:
        return match_theme.group(1)
    return None

def extract_taille(text: str) -> Optional[str]:
    clean = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE)
    match_braces = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not match_braces:
        return None
    inside = match_braces.group(0)
    match_theme = re.search(r'"taille"\s*:\s*"([^"]+)"', inside)
    if match_theme:
        return match_theme.group(1)
    return None

def get_vertex(text: str) -> dict:
    response = detect_product_category(text)
    grand_theme = extract_grand_theme(response)
    taille = extract_taille(response)
    return {
        "text": text,
        "grand_theme": grand_theme,
        "taille": taille
    }

def get_vertex_parallel(texts: list[str]) -> list[dict]:
    with ThreadPoolExecutor() as executor:
        results = list(executor.map(get_vertex, texts))
    return results
    
# --- Étape 4 : fonction pour générer les métriques ---
def generate_metrics(product_name: str):
    prompt_template = """
        Tu es un assistant spécialisé en logistique, inventaire et gestion de flotte de livraison.
        Je vais te donner le nom d’un produit.
        Ta tâche est de générer des dimensions physiques réalistes selon la forme géométrique la plus appropriée
        et d’estimer le volume utile pour le chargement d’un camion (volume prêt à être livré).

        Formes disponibles et leurs paramètres :
        1. "rectangulaire" : hauteur, longueur, largeur (en cm)
        - Volume = (hauteur × longueur × largeur) / 1,000,000 m³
        2. "cylindrique" : hauteur, rayon (en cm)
        - Volume = π × rayon² × hauteur / 1,000,000 m³
        3. "spherique" : rayon (en cm)
        - Volume = (4/3) × π × rayon³ / 1,000,000 m³
        4. "conique" : hauteur, rayon (en cm)
        - Volume = (1/3) × π × rayon² × hauteur / 1,000,000 m³
        5. "irregulier" : hauteur, longueur, largeur, facteur_forme (0.3-0.9)
        - Volume = (hauteur × longueur × largeur × facteur_forme) / 1,000,000 m³

        Règles d’emballage :
        - Déterminer si le produit est livré "en_vrac", "avec_sachet" ou "avec_carton"
        * "en_vrac" : sans emballage rigide (pneus, pièces métalliques, matériaux bruts)
            - facteur_emballage = 1.00 à 1.03
        * "avec_sachet" : emballage souple ou léger (petits composants, produits en sachet plastique)
            - facteur_emballage = 1.03 à 1.07
        * "avec_carton" : emballage rigide ou volumineux (produits fragiles, électroménager)
            - facteur_emballage = 1.08 à 1.20

        Règles de calcul :
        - Le poids doit être cohérent avec le volume (densité entre 100 et 800 kg/m³)
        - Le volume prêt à livrer est : volume_livraison_m3 = volume_m3 × facteur_emballage
        - Le résultat doit permettre de comparer facilement le poids et le volume avec la capacité du camion
        - Tous les calculs doivent être arrondis à 6 décimales

        Résultat attendu au format JSON (colonnes séparées pour une utilisation dans un tableau Excel ou DataFrame) :
        {
        "produit": "<nom>",
        "forme": "<forme>",
        "hauteur_cm": <valeur ou null>,
        "longueur_cm": <valeur ou null>,
        "largeur_cm": <valeur ou null>,
        "rayon_cm": <valeur ou null>,
        "facteur_forme": <valeur ou null>,
        "volume_m3": <valeur>,
        "mode_emballage": "<en_vrac|avec_sachet|avec_carton>",
        "facteur_emballage": <valeur>,
        "volume_livraison_m3": <valeur>,
        "poids_kg": <valeur>,
        }
        """
    """Appelle le modèle Gemini pour générer les métriques logistiques du produit."""
    full_prompt = f"{prompt_template}\nProduit : {product_name}"
    response = model.generate_content(full_prompt)
    try:
        text = response.text.strip()
        json_text = text[text.find("{"):text.rfind("}") + 1]
        result = json.loads(json_text)
        return result
    except Exception as e:
        return {"produit": product_name, "erreur": str(e), "réponse_brute": response.text}

   
