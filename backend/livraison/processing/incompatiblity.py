from pymongo import MongoClient
import os
import pandas as pd
import numpy as np
import logging

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def find_incompatibilities_for_df():
    """
    Charge et transforme la matrice de compatibilité depuis MongoDB, en gérant les structures de données plates et imbriquées.
    """
    try:
        client = MongoClient(MONGO_URI)
        db = client['livraison']
        collection = db['compatiblity']
        data = list(collection.find({}, {'_id': 0}))
        client.close()

        if not data:
            raise ValueError("Aucune donnée de compatibilité trouvée dans MongoDB.")

        all_compat_labels = set()
        parsed_rows = []

        for doc in data:
            main_category = doc.get("name")
            characteristics = doc.get("caracteristiques")
            if not main_category or not characteristics:
                continue

            is_nested = all(isinstance(v, dict) for v in characteristics.values())

            if is_nested:
                for sub_category, incompatibilities in characteristics.items():
                    row_label = f"{main_category} {sub_category}".lower()
                    all_compat_labels.add(row_label)
                    row_data = {'_label_': row_label}
                    if isinstance(incompatibilities, dict):
                        for other_item_label, flag in incompatibilities.items():
                            normalized_other_label = other_item_label.lower()
                            all_compat_labels.add(normalized_other_label)
                            flag_val = str(flag).strip()
                            if flag_val == '-1':
                                row_data[normalized_other_label] = -1
                            elif flag_val == '0':
                                row_data[normalized_other_label] = 0
                    parsed_rows.append(row_data)
            else:
                row_label = main_category.lower()
                all_compat_labels.add(row_label)
                row_data = {'_label_': row_label}
                for other_item_label, flag in characteristics.items():
                    normalized_other_label = other_item_label.lower()
                    all_compat_labels.add(normalized_other_label)
                    flag_val = str(flag).strip()
                    if flag_val == '-1':
                        row_data[normalized_other_label] = -1
                    elif flag_val == '0':
                        row_data[normalized_other_label] = 0
                parsed_rows.append(row_data)

        if not parsed_rows:
            raise ValueError("Format de données de compatibilité inattendu dans MongoDB.")

        df = pd.DataFrame(parsed_rows).set_index('_label_')
        sorted_labels = sorted(list(all_compat_labels))
        df = df.reindex(index=sorted_labels, columns=sorted_labels)
        
        logging.info(f"Matrice de compatibilité construite. Dimensions: {df.shape}")
        return df

    except Exception as e:
        raise Exception(f"Erreur lors de la construction de la matrice de compatibilité: {str(e)}")

def apply_incompatibilities_to_df(df):
    """
    Applique les règles d'incompatibilité (totale et conditionnelle) à un DataFrame d'articles.
    """
    if 'Compatibilte' not in df.columns or 'Name' not in df.columns:
        raise ValueError("Le DataFrame doit contenir les colonnes '''Compatibilte''' et '''Name'''")

    try:
        compatibility_matrix_df = find_incompatibilities_for_df()
    except Exception as e:
        logging.warning(f"Impossible de charger la matrice de compatibilité: {e}. Le calcul des incompatibilités sera ignoré.")
        df['Incompatible_Articles'] = [[] for _ in range(len(df))]
        df['Incompatible_Condition'] = [[] for _ in range(len(df))]
        return df

    row_labels = compatibility_matrix_df.index
    col_labels = compatibility_matrix_df.columns
    compatibility_matrix = compatibility_matrix_df.fillna(999).to_numpy()
    
    total_incomp_map = {}
    conditional_incomp_map = {}
    for i, category in enumerate(row_labels):
        total_indices = np.where(compatibility_matrix[i] == -1)[0]
        if total_indices.size > 0:
            total_incomp_map[category] = col_labels[total_indices].tolist()
        
        conditional_indices = np.where(compatibility_matrix[i] == 0)[0]
        if conditional_indices.size > 0:
            conditional_incomp_map[category] = col_labels[conditional_indices].tolist()

    df_copy = df.copy()
    df_copy['normalized_compat'] = df_copy['Compatibilte'].str.lower()
    cat_articles_map = df_copy.groupby('normalized_compat')['Name'].apply(list).to_dict()

    total_incompatible_list = []
    conditional_incompatible_list = []

    for index, row in df.iterrows():
        current_category_normalized = str(row['Compatibilte']).lower()
        current_name = row['Name']
        
        total_incomp_cats = total_incomp_map.get(current_category_normalized, [])
        all_total_articles = [name for cat in total_incomp_cats for name in cat_articles_map.get(cat, []) if name != current_name]
        total_incompatible_list.append(all_total_articles)
        
        conditional_incomp_cats = conditional_incomp_map.get(current_category_normalized, [])
        all_conditional_articles = [name for cat in conditional_incomp_cats for name in cat_articles_map.get(cat, []) if name != current_name]
        conditional_incompatible_list.append(all_conditional_articles)

    df['Incompatible_Articles'] = total_incompatible_list
    df['Incompatible_Condition'] = conditional_incompatible_list
    
    total_count = sum(1 for lst in total_incompatible_list if lst)
    conditional_count = sum(1 for lst in conditional_incompatible_list if lst)
    logging.info(f"Calcul des incompatibilités terminé. {total_count} articles avec incompatibilités totales. {conditional_count} articles avec incompatibilités conditionnelles.")
    
    return df