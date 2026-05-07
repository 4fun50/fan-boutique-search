"""
LLM Product Enrichment — Fan Boutique Search Engine (V2)

Pipeline complet :
  1. Charge les produits depuis PrestaShop (+ stocks, promos, ventes)
  2. Envoie chaque fiche au LLM → attributs normalisés
  3. Insère dans fan_boutique_products_v2 (Supabase)

Usage :
    venv/bin/python enrich_products.py              # 10 produits (test, JSON local)
    venv/bin/python enrich_products.py --count 50   # 50 produits (test)
    venv/bin/python enrich_products.py --all         # tous les produits
    venv/bin/python enrich_products.py --all --db    # tous + insertion Supabase

Mode rafraîchissement rapide (pas d'appel LLM, ~3 min, coût 0 €) :
    venv/bin/python enrich_products.py --prices-only  # MAJ prix/promos/stocks/ventes uniquement
"""

import json
import os
import re
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

# Charger le .env (racine projet + ancien emplacement en fallback)
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent / "archive" / "v1-vectorisation" / "prestashop-catalog-sync" / ".env")

# ── Config ──────────────────────────────────────────────
PS_URL = "https://www.ventilateurs-plafond.com/api"
PS_KEY = os.getenv("PRESTASHOP_API_KEY")
PUBLIC_BASE = "https://www.ventilateurs-plafond.com"
LANG_ID = 1  # français

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
LLM_MODEL = "gpt-4.1-mini"

TABLE_V2 = "fan_boutique_products_v2"

# Charger le prompt d'enrichissement
PROMPT_PATH = Path(__file__).parent / "enrichment_prompt.md"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# ── Helpers PrestaShop ──────────────────────────────────

def ps_get(endpoint, params=None):
    """Requête GET vers l'API PrestaShop avec auth."""
    url = f"{PS_URL}/{endpoint}"
    p = {"output_format": "JSON"}
    if params:
        p.update(params)
    r = requests.get(url, auth=(PS_KEY, ""), params=p)
    r.raise_for_status()
    return r.json()


def get_lang(field):
    """Extrait la valeur française d'un champ multilangue PrestaShop."""
    if isinstance(field, list):
        for item in field:
            if int(item.get("id", 0)) == LANG_ID:
                return item.get("value", "")
        return field[0].get("value", "") if field else ""
    return field or ""


def strip_html(text):
    """Retire les balises HTML d'un texte."""
    return re.sub(r"<[^>]+>", "", text).strip()


# ── Chargement des tables de référence ──────────────────

def load_features():
    """Charge la table features : {id: nom_feature}."""
    data = ps_get("product_features", {"display": "full"})
    return {
        int(f["id"]): get_lang(f["name"])
        for f in data.get("product_features", [])
    }


def load_feature_values():
    """Charge la table feature_values : {id: valeur_texte}."""
    data = ps_get("product_feature_values", {"display": "full"})
    return {
        int(fv["id"]): get_lang(fv["value"])
        for fv in data.get("product_feature_values", [])
    }


def load_categories():
    """Charge la table catégories : {id: nom_catégorie}."""
    data = ps_get("categories", {"display": "[id,name]"})
    return {
        int(c["id"]): get_lang(c["name"])
        for c in data.get("categories", [])
    }


def load_specific_prices():
    """Charge toutes les specific_prices : {product_id: [liste de promos]}."""
    all_sp = []
    offset = 0
    while True:
        data = ps_get("specific_prices", {
            "display": "full",
            "limit": f"{offset},1000",
        })
        if not isinstance(data, dict):
            break
        batch = data.get("specific_prices", [])
        if not batch:
            break
        all_sp.extend(batch)
        offset += 1000

    sp_map = {}
    for sp in all_sp:
        pid = int(sp["id_product"])
        sp_map.setdefault(pid, []).append(sp)
    return sp_map


def get_sale_price(price_ttc, specific_prices):
    """Calcule le prix promo TTC. Retourne None si pas de promo active."""
    now = datetime.now()
    for sp in specific_prices:
        from_date = sp["from"]
        to_date = sp["to"]
        permanent = from_date == "0000-00-00 00:00:00"
        if not permanent:
            start = datetime.strptime(from_date, "%Y-%m-%d %H:%M:%S")
            end = datetime.strptime(to_date, "%Y-%m-%d %H:%M:%S")
            if not (start <= now <= end):
                continue
        reduction = float(sp["reduction"])
        reduction_type = sp["reduction_type"]
        reduction_tax = sp["reduction_tax"]
        if reduction_type == "amount":
            if reduction_tax == "0":
                reduction = reduction * 1.20
            return round(price_ttc - reduction, 2)
        elif reduction_type == "percentage":
            return round(price_ttc * (1 - reduction), 2)
    return None


def load_stocks():
    """Charge les stocks : {product_id: quantité}."""
    all_stocks = []
    offset = 0
    while True:
        data = ps_get("stock_availables", {
            "display": "full",
            "limit": f"{offset},1000",
        })
        if not isinstance(data, dict):
            break
        batch = data.get("stock_availables", [])
        if not batch:
            break
        all_stocks.extend(batch)
        offset += 1000

    return {
        int(s["id_product"]): int(s["quantity"])
        for s in all_stocks
        if s["id_product_attribute"] == "0"
    }


def load_sales():
    """Charge les ventes par produit sur les 4 dernières années."""
    cutoff = (datetime.now() - timedelta(days=1460)).strftime("%Y-%m-%d")
    valid_states = {2, 3, 4, 5, 9, 11, 42, 43, 51, 52}

    valid_order_ids = set()
    offset = 0
    while True:
        data = ps_get("orders", {
            "display": "[id,current_state,date_add]",
            "sort": "[id_ASC]",
            "limit": f"{offset},5000",
        })
        if not isinstance(data, dict):
            break
        orders = data.get("orders", [])
        if not orders:
            break
        for o in orders:
            if o["date_add"] >= cutoff and int(o["current_state"]) in valid_states:
                valid_order_ids.add(int(o["id"]))
        offset += 5000

    sales = defaultdict(int)
    offset = 0
    while True:
        data = ps_get("order_details", {
            "display": "[id,id_order,product_id,product_quantity]",
            "sort": "[id_ASC]",
            "limit": f"{offset},5000",
        })
        if not isinstance(data, dict):
            break
        details = data.get("order_details", [])
        if not details:
            break
        for d in details:
            if int(d["id_order"]) in valid_order_ids:
                sales[int(d["product_id"])] += int(d["product_quantity"])
        offset += 5000

    return dict(sales)


def load_all_products(limit=None, start_offset=0):
    """Charge les produits actifs depuis PrestaShop."""
    all_products = []
    offset = start_offset
    batch_size = 100

    while True:
        print(f"  Fetch produits {offset}–{offset + batch_size}...")
        data = ps_get("products", {
            "display": "full",
            "filter[active]": "1",
            "limit": f"{offset},{batch_size}",
        })
        if not isinstance(data, dict):
            break
        batch = data.get("products", [])
        if not batch:
            break
        # Filtrer : uniquement les produits visibles sur le front-office
        # visibility: "both" (catalogue + recherche) ou "catalog" ou "search"
        # Exclure "none" (invisible) et les brouillons/copies
        for p in batch:
            visibility = p.get("visibility", "both")
            name = get_lang(p.get("name", "")).strip().lower()
            if visibility == "none":
                continue
            if name.startswith("copy of"):
                continue
            all_products.append(p)
        offset += batch_size

        if limit and len(all_products) >= limit:
            return all_products[:limit]

    return all_products


# ── Préparation de la fiche brute pour le LLM ──────────

def build_raw_product_card(raw, features_map, values_map, categories_map, sp_map, stocks_map, sales_map):
    """Construit la fiche brute d'un produit avec toutes les données."""
    name = get_lang(raw.get("name", ""))
    description = strip_html(get_lang(raw.get("description", "")))
    description_short = strip_html(get_lang(raw.get("description_short", "")))

    # Prix TTC et promo
    product_id = int(raw["id"])
    price_ttc = round(float(raw.get("price", 0)) * 1.20 + float(raw.get("ecotax", 0)), 2)
    sale_price = get_sale_price(price_ttc, sp_map.get(product_id, []))

    # Stock et ventes
    stock = stocks_map.get(product_id, 0)
    total_sales = sales_map.get(product_id, 0)

    # Caractéristiques brutes
    associations = raw.get("associations", {})
    features_raw = {}
    for pf in associations.get("product_features", []):
        fid = int(pf.get("id", 0))
        vid = int(pf.get("id_feature_value", 0))
        fname = features_map.get(fid)
        fval = values_map.get(vid)
        if fname and fval:
            features_raw[fname] = fval

    # Catégories
    cat_ids = [int(c["id"]) for c in associations.get("categories", [])]
    categories = [categories_map[cid] for cid in cat_ids if cid in categories_map]

    # Image
    default_image_id = raw.get("id_default_image")
    digits = "/".join(str(default_image_id)) if default_image_id else ""
    image_url = f"{PUBLIC_BASE}/img/p/{digits}/{default_image_id}-large_default.jpg" if default_image_id else None

    # URL produit
    link_rewrite = get_lang(raw.get("link_rewrite", ""))
    product_url = f"{PUBLIC_BASE}/{raw['id']}-{link_rewrite}.html" if link_rewrite else None

    # Référence PrestaShop (pour recherche par référence côté front)
    reference = (raw.get("reference") or "").strip() or None

    return {
        "prestashop_id": product_id,
        "nom": name,
        "reference": reference,
        "description_courte": description_short,
        "description_longue": description,
        "prix_ttc": price_ttc,
        "prix_promo": sale_price,
        "stock": stock,
        "total_sales": total_sales,
        "categories": categories,
        "caracteristiques": features_raw,
        "image_url": image_url,
        "product_url": product_url,
    }


# ── Appel LLM ──────────────────────────────────────────

def enrich_single(card):
    """Envoie UNE fiche produit au LLM et retourne ses attributs normalisés."""
    user_parts = []
    user_parts.append(f"Nom : {card['nom']}")
    user_parts.append(f"Prix TTC : {card['prix_ttc']}€")
    if card["description_courte"]:
        user_parts.append(f"Description courte : {card['description_courte']}")
    if card["description_longue"]:
        desc = card["description_longue"][:1500]
        user_parts.append(f"Description longue : {desc}")
    if card["categories"]:
        user_parts.append(f"Catégories : {', '.join(card['categories'])}")
    if card["caracteristiques"]:
        user_parts.append("Caractéristiques :")
        for k, v in card["caracteristiques"].items():
            user_parts.append(f"  - {k} : {v}")

    user_message = "\n".join(user_parts)

    response = openai_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    raw_response = response.choices[0].message.content
    return json.loads(raw_response)


# ── Insertion Supabase ──────────────────────────────────

def build_db_row(card, attrs):
    """Construit une ligne pour la table fan_boutique_products_v2."""
    return {
        "prestashop_id": card["prestashop_id"],
        "nom": card["nom"],
        "reference": card.get("reference"),
        "prix_ttc": card["prix_ttc"],
        "prix_promo": card["prix_promo"],
        "en_stock": card["stock"] > 0,
        "stock": card["stock"],
        "image_url": card["image_url"],
        "product_url": card["product_url"],
        "description_courte": card["description_courte"],
        "description_longue": card["description_longue"],
        "total_sales": card["total_sales"],
        # Attributs LLM — on mappe chaque champ
        "type_produit": attrs.get("type_produit"),
        "sous_type": attrs.get("sous_type"),
        "marque": attrs.get("marque"),
        "gamme": attrs.get("gamme"),
        "style": attrs.get("style"),
        "pieces": attrs.get("pieces"),  # text[] PostgreSQL accepte les listes Python
        "surface_min_m2": attrs.get("surface_min_m2"),
        "surface_max_m2": attrs.get("surface_max_m2"),
        "diametre_cm": attrs.get("diametre_cm"),
        "nombre_pales": attrs.get("nombre_pales"),
        "pales_reversibles_bicolores": attrs.get("pales_reversibles_bicolores"),
        "matiere_pales": attrs.get("matiere_pales"),
        "couleur_moteur": attrs.get("couleur_moteur"),
        "couleur_pales": attrs.get("couleur_pales"),
        "type_moteur": attrs.get("type_moteur"),
        "puissance_watts": attrs.get("puissance_watts"),
        "classe_energetique": attrs.get("classe_energetique"),
        "silencieux": attrs.get("silencieux"),
        "avec_lumiere": attrs.get("avec_lumiere"),
        "type_source_lumineuse": attrs.get("type_source_lumineuse"),
        "lumiere_dimmable": attrs.get("lumiere_dimmable"),
        "kit_lumiere_option": attrs.get("kit_lumiere_option"),
        "avec_telecommande": attrs.get("avec_telecommande"),
        "telecommande_adaptable": attrs.get("telecommande_adaptable"),
        "boitier_mural_adaptable": attrs.get("boitier_mural_adaptable"),
        "wifi": attrs.get("wifi"),
        "commande_vocale": attrs.get("commande_vocale"),
        "app_telephone": attrs.get("app_telephone"),
        "reversible": attrs.get("reversible"),
        "option_destratificateur": attrs.get("option_destratificateur"),
        "surface_destrat_m2": attrs.get("surface_destrat_m2"),
        "hauteur_max_destrat": attrs.get("hauteur_max_destrat"),
        "sonde_thermostatique": attrs.get("sonde_thermostatique"),
        "usage_exterieur": attrs.get("usage_exterieur"),
        "indice_protection": attrs.get("indice_protection"),
        "plafond_en_pente": attrs.get("plafond_en_pente"),
        "distance_plafond_pales_cm": attrs.get("distance_plafond_pales_cm"),
        "prolongateur_dispo": attrs.get("prolongateur_dispo"),
        "longueur_max_prolongateur": attrs.get("longueur_max_prolongateur"),
        "garantie": attrs.get("garantie"),
        "score_reparabilite": attrs.get("score_reparabilite"),
        "est_accessoire": attrs.get("est_accessoire"),
        "est_ventilateur": attrs.get("est_ventilateur"),
    }


# ── Mode rafraîchissement rapide (sans LLM) ─────────────

def prices_only_update():
    """
    Met à jour uniquement les colonnes prix/promos/stocks/ventes dans Supabase.
    Skip complètement le LLM → coût 0 €, durée ~3 min au lieu de ~28 min.
    Les attributs LLM (style, type_produit, etc.) sont conservés intacts.
    """
    start_time = time.time()
    print("=== Refresh PRIX/STOCKS uniquement (sans LLM) ===\n")

    # 1. Charger les données dynamiques depuis PrestaShop
    print("1. Chargement promos, stocks, ventes...")
    sp_map = load_specific_prices()
    stocks_map = load_stocks()
    sales_map = load_sales()
    print(f"   {sum(len(v) for v in sp_map.values())} promos, {len(stocks_map)} stocks, {len(sales_map)} produits avec ventes\n")

    print("2. Chargement des produits PrestaShop...")
    raw_products = load_all_products()
    print(f"   {len(raw_products)} produits chargés\n")

    # 2. Construire les updates
    print("3. Calcul des prix actuels...")
    updates = []
    for rp in raw_products:
        pid = int(rp["id"])
        price_ttc = round(float(rp.get("price", 0)) * 1.20 + float(rp.get("ecotax", 0)), 2)
        if price_ttc <= 0:
            continue
        sale_price = get_sale_price(price_ttc, sp_map.get(pid, []))
        stock = stocks_map.get(pid, 0)
        total_sales = sales_map.get(pid, 0)
        reference = (rp.get("reference") or "").strip() or None

        updates.append({
            "prestashop_id": pid,
            "reference": reference,
            "prix_ttc": price_ttc,
            "prix_promo": sale_price,
            "en_stock": stock > 0,
            "stock": stock,
            "total_sales": total_sales,
        })
    print(f"   {len(updates)} produits à mettre à jour\n")

    # 3. UPDATE Supabase parallélisé (20 workers)
    print("4. Mise à jour Supabase (20 workers parallèles)...")
    supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

    def update_one(row):
        pid = row["prestashop_id"]
        payload = {k: v for k, v in row.items() if k != "prestashop_id"}
        try:
            res = supabase.table(TABLE_V2).update(payload).eq("prestashop_id", pid).execute()
            # res.data est vide si la ligne n'existait pas (produit nouveau, jamais enrichi)
            return pid, len(res.data) > 0, None
        except Exception as e:
            return pid, False, str(e)

    updated = 0
    skipped_new = 0
    errors = []
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(update_one, row) for row in updates]
        for i, future in enumerate(as_completed(futures), start=1):
            pid, ok, err = future.result()
            if err:
                errors.append({"id": pid, "error": err})
            elif ok:
                updated += 1
            else:
                skipped_new += 1
            if i % 200 == 0 or i == len(updates):
                print(f"   [{i}/{len(updates)}] traités — {updated} MAJ, {skipped_new} nouveaux ignorés, {len(errors)} erreurs")

    elapsed = time.time() - start_time
    print(f"\n=== Refresh terminé en {elapsed/60:.1f} min ===")
    print(f"   {updated} produits mis à jour")
    if skipped_new:
        print(f"   {skipped_new} nouveaux produits ignorés (jamais enrichis — utiliser --all --db pour les ajouter)")
    if errors:
        print(f"   {len(errors)} erreurs :")
        for e in errors[:10]:
            print(f"     ID {e['id']}: {e['error'][:100]}")


# ── Main ────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Enrichissement LLM des produits V2")
    parser.add_argument("--count", type=int, default=10, help="Nombre de produits (défaut: 10)")
    parser.add_argument("--offset", type=int, default=0, help="Offset de départ (défaut: 0)")
    parser.add_argument("--all", action="store_true", help="Traiter tous les produits")
    parser.add_argument("--db", action="store_true", help="Insérer dans Supabase (sinon JSON local)")
    parser.add_argument("--insert-only", type=str, metavar="JSON_FILE",
                        help="Réinsérer depuis un JSON existant (skip enrichissement)")
    parser.add_argument("--prices-only", action="store_true",
                        help="MAJ prix/promos/stocks/ventes uniquement (pas de LLM, ~3 min, coût 0€)")
    args = parser.parse_args()

    # Mode prix uniquement (rapide, gratuit)
    if args.prices_only:
        prices_only_update()
        return

    start_time = time.time()
    print("=== LLM Product Enrichment V2 ===\n")

    # Mode insert-only : charger le JSON et insérer directement
    if args.insert_only:
        print(f"Mode INSERT-ONLY depuis {args.insert_only}\n")
        with open(args.insert_only, encoding="utf-8") as f:
            data = json.load(f)
        print(f"   {len(data)} produits chargés")

        supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

        print("   Vidage de la table...", end=" ", flush=True)
        supabase.rpc("fan_boutique_truncate_v2", {}).execute()
        print("OK")

        db_batch_size = 50
        inserted = 0
        for i in range(0, len(data), db_batch_size):
            batch = data[i:i + db_batch_size]
            rows = []
            for item in batch:
                attrs = item["attributs"]
                rows.append({
                    "prestashop_id": item["prestashop_id"],
                    "nom": item["nom"],
                    "reference": item.get("reference"),
                    "prix_ttc": item["prix_ttc"],
                    "prix_promo": item["prix_promo"],
                    "en_stock": item["stock"] > 0,
                    "stock": item["stock"],
                    "image_url": item["image_url"],
                    "product_url": item["product_url"],
                    "description_courte": item["description_courte"],
                    "description_longue": item.get("description_longue"),
                    "total_sales": item["total_sales"],
                    **{k: attrs.get(k) for k in [
                        "type_produit", "sous_type", "marque", "gamme", "style", "pieces",
                        "surface_min_m2", "surface_max_m2", "diametre_cm", "nombre_pales",
                        "pales_reversibles_bicolores", "matiere_pales", "couleur_moteur",
                        "couleur_pales", "type_moteur", "puissance_watts", "classe_energetique",
                        "silencieux", "avec_lumiere", "type_source_lumineuse", "lumiere_dimmable",
                        "kit_lumiere_option", "avec_telecommande", "telecommande_adaptable",
                        "boitier_mural_adaptable", "wifi", "commande_vocale", "app_telephone",
                        "reversible", "option_destratificateur", "surface_destrat_m2",
                        "hauteur_max_destrat", "sonde_thermostatique", "usage_exterieur",
                        "indice_protection", "plafond_en_pente", "distance_plafond_pales_cm",
                        "prolongateur_dispo", "longueur_max_prolongateur", "garantie",
                        "score_reparabilite", "est_accessoire", "est_ventilateur",
                    ]},
                })
            try:
                supabase.table(TABLE_V2).insert(rows).execute()
                inserted += len(rows)
                print(f"   Inséré {inserted}/{len(data)}...")
            except Exception as e:
                print(f"   ERREUR insertion batch {i}: {e}")

        elapsed = time.time() - start_time
        print(f"\n=== INSERT-ONLY terminé en {elapsed:.1f}s — {inserted} produits insérés ===")
        return

    # 1. Tables de référence
    print("1. Chargement des tables de référence...")
    features_map = load_features()
    values_map = load_feature_values()
    categories_map = load_categories()
    print(f"   {len(features_map)} features, {len(values_map)} valeurs, {len(categories_map)} catégories\n")

    print("1b. Chargement promos, stocks, ventes...")
    sp_map = load_specific_prices()
    stocks_map = load_stocks()
    sales_map = load_sales()
    print(f"   {sum(len(v) for v in sp_map.values())} promos, {len(stocks_map)} stocks, {len(sales_map)} produits avec ventes\n")

    # 2. Produits
    print("2. Chargement des produits...")
    if args.all:
        raw_products = load_all_products()
    else:
        raw_products = load_all_products(limit=args.count, start_offset=args.offset)
    print(f"   {len(raw_products)} produits chargés\n")

    # 3. Construire les fiches brutes
    print("3. Construction des fiches brutes...")
    product_cards = []
    excluded = 0
    for rp in raw_products:
        card = build_raw_product_card(rp, features_map, values_map, categories_map, sp_map, stocks_map, sales_map)
        nom_lower = card["nom"].lower()
        # Exclure produits non vendables tels quels (kits à monter, configurateurs)
        if any(t in nom_lower for t in ["configurateur", "à composer"]):
            excluded += 1
            continue
        if card["prix_ttc"] <= 0:
            excluded += 1
            continue
        product_cards.append(card)
    print(f"   {len(product_cards)} fiches prêtes ({excluded} exclues)\n")

    # 4. Enrichissement LLM (parallèle, 20 workers)
    total = len(product_cards)
    LLM_WORKERS = 20
    print(f"4. Enrichissement LLM ({total} produits, {LLM_WORKERS} workers parallèles)...")
    all_enriched = [None] * total  # Pré-allouer pour garder l'ordre
    errors = []
    done_count = 0

    def enrich_worker(index, card):
        attrs = enrich_single(card)
        return index, card, attrs

    with ThreadPoolExecutor(max_workers=LLM_WORKERS) as executor:
        futures = {
            executor.submit(enrich_worker, i, card): i
            for i, card in enumerate(product_cards)
        }
        for future in as_completed(futures):
            done_count += 1
            try:
                idx, card, attrs = future.result()
                all_enriched[idx] = (card, attrs)
                if done_count % 50 == 0 or done_count == total:
                    print(f"   [{done_count}/{total}] traités...")
            except Exception as e:
                idx = futures[future]
                card = product_cards[idx]
                print(f"   ERREUR produit {card['prestashop_id']}: {e}")
                errors.append({"index": idx, "id": card["prestashop_id"], "error": str(e)})

    # Retirer les None (erreurs)
    all_enriched = [item for item in all_enriched if item is not None]

    llm_time = time.time() - start_time
    print(f"   LLM terminé en {llm_time/60:.1f} min ({len(all_enriched)} OK, {len(errors)} erreurs)\n")

    # 5. Sauvegarder en JSON local (toujours, pour backup)
    output_data = []
    for card, attrs in all_enriched:
        output_data.append({
            "prestashop_id": card["prestashop_id"],
            "nom": card["nom"],
            "reference": card.get("reference"),
            "prix_ttc": card["prix_ttc"],
            "prix_promo": card["prix_promo"],
            "stock": card["stock"],
            "total_sales": card["total_sales"],
            "image_url": card["image_url"],
            "product_url": card["product_url"],
            "description_courte": card["description_courte"],
            "description_longue": card["description_longue"],
            "attributs": attrs,
        })
    output_file = OUTPUT_DIR / f"enriched_products_{len(output_data)}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"5. JSON sauvegardé : {output_file}\n")

    # 6. Insertion Supabase (si --db)
    if args.db:
        print("6. Insertion dans Supabase (fan_boutique_products_v2)...")
        supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

        # Vider la table d'abord (full refresh) — TRUNCATE via RPC car DELETE timeout
        print("   Vidage de la table...", end=" ", flush=True)
        supabase.rpc("fan_boutique_truncate_v2", {}).execute()
        print("OK")

        # Insérer par batch de 50
        db_batch_size = 50
        inserted = 0
        for i in range(0, len(all_enriched), db_batch_size):
            batch_items = all_enriched[i:i + db_batch_size]
            rows = []
            for card, attrs in batch_items:
                rows.append(build_db_row(card, attrs))

            try:
                supabase.table(TABLE_V2).insert(rows).execute()
                inserted += len(rows)
                print(f"   Inséré {inserted}/{len(all_enriched)}...")
            except Exception as e:
                print(f"   ERREUR insertion batch {i}: {e}")

        print(f"   {inserted} produits insérés dans {TABLE_V2}\n")
    else:
        print("6. Insertion Supabase ignorée (ajouter --db pour insérer)\n")

    # Résumé
    elapsed = time.time() - start_time
    print(f"=== Terminé en {elapsed/60:.1f} min ===")
    print(f"   {len(all_enriched)} produits enrichis")
    if errors:
        print(f"   {len(errors)} erreurs LLM :")
        for e in errors[:10]:
            print(f"     ID {e['id']}: {e['error'][:80]}")
    if args.db:
        print(f"   Insérés dans {TABLE_V2}")
    print(f"   Backup JSON : {output_file}")


if __name__ == "__main__":
    main()
