# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## En attente (dépendances externes)

- **Avis clients** : En attente. L'agence (Algo Factory) doit installer/activer le module natif PrestaShop `productcomments`. Vérifié 2026-05-06 : les ressources `product_comments`, `product_comment_criterions`, `product_comment_usefulnesses` n'apparaissent pas dans la liste des permissions webservice → le module n'est pas enregistré. Une fois activé côté BO PrestaShop, ajouter une colonne `note_moyenne` + `nb_avis` dans Supabase et enrichir le widget.
- **Bouton "Ajouter au panier"** : ✅ Implémenté. URL PrestaShop native `/panier?add=1&id_product={prestashop_id}&qty=1`. Le `prestashop_id` est extrait depuis l'URL produit via regex (`/(\d+)-[^/]+\.html/`). Bouton masqué si produit en rupture. Hiérarchie CTA : "Ajouter au panier" = primaire orange, "Voir sur le site" = secondaire outlined. Au clic : le bouton passe en vert "Ajouté !" pendant 2s puis devient "Voir le panier" (lien `/panier`). La modale reste ouverte.
- **Recherche par référence produit** : ✅ Implémenté (2026-05-06). Colonne `reference TEXT` dans `fan_boutique_products_v2` (3812/3812 produits remplis), index GIN trigram (`pg_trgm`) pour recherche `ILIKE` rapide, paramètre `p_reference` ajouté à la RPC `fan_boutique_search_v2`, règle prioritaire de détection dans le LLM Parser (pattern alphanumérique avec chiffres + séparateur), nodes n8n `Build Supabase Payload` + `Recover all values for frontend` mis à jour. Validé end-to-end sur preprod (`te3_p8wi166` → 2 produits Tenerife matchés).
- **Module PrestaShop `fanboutiquesearch`** : ✅ v1.0.3 mis en **production** le 2026-05-07 sur www.ventilateurs-plafond.com (validé par le client après recette préprod). Hijack de l'autocomplete natif (module `ps_searchbar`), désactive jQuery UI Autocomplete, branche `FanBoutiqueSearchWidget` à la place. Désactivé sur tunnel d'achat (`/panier`, `/commande`) et réseau 2G. Logo PNG inclus. ⚠️ Vider le cache PrestaShop après chaque update (BO → Performance → Effacer le cache, sinon le bundle CCC garde l'ancien JS).
- **Tracking conversions GTM → n8n** : 🟡 En **observation** depuis le 2026-05-07. Pipeline : widget pose un cookie `fb_search_used=1` (30j) au clic produit → GTM tag fire sur event `purchase` si cookie présent → POST vers `https://n8n.guillaume-gonano.com/webhook/tracking-search-engine`. Workflow n8n actuel = webhook seul (pas encore de logique aval). Vérification prévue à 48h pour confirmer que les payloads arrivent bien et qu'ils sont propres, avant d'ajouter email/BDD/Slack en aval. Container GTM : `GTM-5GQ33Z7` (workspace 43, version 40 publiée). Variables/triggers/tags créés via MCP gtm-mcp.

## Règles de travail

- **Code n8n** : Quand du code n8n doit être modifié, toujours fournir le **code intégral** du node, jamais un extrait partiel. Guillaume copie-colle le code entier dans n8n.
- **Déploiement** : TOUJOURS via `git push origin main` → Netlify redéploie automatiquement. Ne JAMAIS utiliser les outils MCP Netlify.

## Project Overview

Fan Boutique Search Widget - Moteur de recherche pour ventilateurs-plafond.com. Widget JavaScript qui s'intègre sur le site e-commerce et communique avec un backend de recherche par filtres structurés via n8n. Pas de recherche vectorielle — le LLM Parser extrait des filtres structurés, et la RPC Supabase filtre + trie les produits.

## Architecture

### Fichiers du projet

```
├── fan-boutique-search-widget.js  # Main widget class (FanBoutiqueSearchWidget)
├── fb-search-widget.css           # Widget styling (uses .fm-* class prefix)
├── netlify/functions/search.mjs   # Serverless proxy function
├── demo.html                      # Test page
├── netlify.toml                   # Netlify configuration
├── llm-enrichment/                # Pipeline d'enrichissement LLM (V2)
│   ├── enrich_products.py         # Script principal (parallélisé, 20 workers)
│   └── enrichment_prompt.md       # Prompt d'enrichissement produit
├── prompts/
│   └── llm-parser-v6-v2db.md     # Prompt LLM Parser actif (V2)
├── test-llm-parser.mjs           # Test direct du LLM Parser
└── archive/                       # Code V1 archivé (gitignored)
```

### Chaîne complète (flux de données)

```
Widget JS (navigateur)
  → Netlify serverless function (proxy CORS + auth)
    → n8n webhook (orchestration)
      → Rate limit check (Supabase RPC: fan_boutique_check_rate_limit)
      → LLM Parser (GPT-4.1-mini: extraction de filtres structurés)
      → Code node "Build Supabase Payload" (sérialisation JSON propre)
      → Supabase RPC: fan_boutique_search_v2 (filtres structurés + tri)
      → Code node "Recover all values for frontend" (formatage réponse)
    → Réponse formatée au widget
```

### Widget (`FanBoutiqueSearchWidget`)

Self-contained IIFE exposing `window.FanBoutiqueSearchWidget`. Features:
- Debounced search with configurable delay
- Query chip mode for mobile (hides input, shows query as chip)
- Animated placeholder rotation (typewriter effect)
- Search history (localStorage with `fb_search_history` key)
- Rate limit error handling
- Load more pagination
- Welcome message with examples responsifs (4 mobile / 6 desktop)
- Affichage prix promo (barré + badge -XX%) automatique si `prix_promo` fourni
- Badge "Rupture de stock" + opacité réduite pour produits hors stock

#### Modale produit (desktop & mobile)

Structure HTML de la modale :
```
.fm-modal-body (image + info en 2 colonnes)
  .fm-modal-image-col (image produit)
  .fm-modal-info-col (titre, description, prix, stock, CTA "Voir sur le site")
.fm-modal-footer (full-width, sous les colonnes)
  .fm-modal-details (grille 3 colonnes desktop / 1 colonne mobile)
```

- `allDetailsConfig` : tableau de 38 attributs `{key, label}` qui contrôle quels champs afficher dans la grille
- **Tri dynamique** : les attributs correspondant aux filtres de la requête (`active_filters`) sont remontés en premier
- **Highlighting** : les attributs matchés reçoivent la classe `.fm-modal-detail-row--highlighted` (fond `#fff7ed` orange pâle)
- `this.activeFilters` est alimenté par `data.active_filters` ou `data[0].active_filters` dans `displayResults()`

#### Format de données reçu

Le widget gère plusieurs formats de réponse :
- `{results: [...], active_filters: [...]}` — format standard
- `[{results: [...], active_filters: [...]}]` — wrappé dans un tableau (format n8n webhook)
- `[...]` — tableau plat de produits (fallback)

Logique d'unwrap (ligne ~712) :
```js
const payload = Array.isArray(data) && data.length > 0 && data[0].results ? data[0] : data;
```

### Serverless Function (`netlify/functions/search.mjs`)

Proxies requests to n8n webhook with:
- Origin-based CORS (`FB_ALLOWED_ORIGINS` env var, supporte les wildcards `https://*.ventilateurs-plafond.com`)
- Client IP forwarding (via `x-nf-client-connection-ip`, `x-forwarded-for`, `x-real-ip`)
- Authentication header injection (`N8N_AUTH_HEADER_NAME`, `N8N_AUTH_HEADER_VALUE`)

### Backend (services externes)

**n8n** (hébergé sur `n8n.guillaume-gonano.com`):
- Webhook: `fan-boutique-search-engine` (Header Auth)
- Orchestre le pipeline : rate limit → LLM parsing → embedding → build payload → recherche vectorielle → formatage
- ⚠️ Node "Supabase request" (HTTP Request) : Response Format doit être forcé en **JSON** (pas Autodetect) sinon mojibake UTF-8
- ⚠️ Le payload Supabase doit passer par un **Code node** ("Build Supabase Payload") car les champs tableau ne se sérialisent pas en mode expression "Using JSON"
- ⚠️ Le LLM Parser (GPT-4.1-mini via Responses API) renvoie `content[0].text` comme un **objet JS** (pas une string JSON) — le node "Recover all values for frontend" doit gérer les deux cas (`typeof === 'string'` → `JSON.parse()`, `typeof === 'object'` → utiliser directement)
- ⚠️ Le webhook n8n ne retourne que le **premier item** quand un Code node renvoie plusieurs items — il faut wrapper tous les résultats dans un seul item `[{json: {results: [...], active_filters: [...]}}]`

**Supabase** (hébergé sur `supabase.guillaume-gonano.com`):
- Table `fan_boutique_products_v2` : ~3779 produits avec colonnes typées + embeddings vectoriels
- Table `fan_boutique_rate_limit` : rate limiting par IP (minute + jour)
- Fonction RPC `fan_boutique_check_rate_limit` : vérification atomique des limites
- Fonction RPC `fan_boutique_search_v2` : filtres structurés + tri (38 paramètres, plus de vectoriel). Exclut les produits en rupture par défaut (`p_include_out_of_stock=false`).

### Node n8n "Recover all values for frontend"

Ce node formate la réponse Supabase pour le widget. Fonctionnement clé :

1. **Lecture des filtres LLM** : récupère `$('LLM Parser').first().json.output[0].content[0].text` (objet ou string JSON)
2. **Calcul `active_filters`** : via `FILTER_TO_DETAIL` mapping (27 entrées : `p_style` → `"style"`, `p_wifi` → `"wifi"`, `p_reference` → `"reference"`, etc.), identifie quels filtres le LLM a activés
3. **Formatage produits** : mappe les colonnes Supabase vers le format frontend (38 champs `details`, surface combinée, pièces lisibles, score similarité)
4. **Wrapping** : retourne `[{json: {results: [...], active_filters: [...]}}]` — un seul item n8n

### Base de données V2 — Table `fan_boutique_products_v2`

Colonnes principales :
- `id`, `prestashop_id`, `nom`, `reference`, `prix_ttc`, `prix_promo`, `en_stock`, `stock`
- `image_url`, `product_url`, `description_courte`, `description_longue`
- `reference` : référence produit PrestaShop brute (ex: `KL_TE3_P8WI166_RINGCH`, `FAB_213591328`). Indexée via GIN trigram (`pg_trgm`) sur `LOWER(reference)` pour permettre la recherche `ILIKE '%...%'` rapide

Attributs LLM normalisés (colonnes typées, pas JSONB) :
- `type_produit` : ventilateur_plafond, ventilateur_table, ventilateur_sur_pied, ventilateur_mural, ventilateur_colonne, destratificateur, brasseur_air, climatiseur, humidificateur, chauffage, cheminee, accessoire
- `style` : moderne, classique, industriel, tropical, design, nordique, rustique, retro, minimaliste, enfant, exterieur
- `couleur_moteur`, `couleur_pales` : valeurs normalisées (blanc, noir, nickel_brosse, etc.)
- `type_moteur` : dc, ac
- `marque`, `gamme` : strings
- `pieces` : tableau PostgreSQL text[] (salon, chambre, chambre_enfant, etc.)
- Booléens : `silencieux`, `avec_lumiere`, `avec_telecommande`, `wifi`, `reversible`, `option_destratificateur`, `usage_exterieur`, `plafond_en_pente`, `commande_vocale`, `app_telephone`, `lumiere_dimmable`, `sonde_thermostatique`, `prolongateur_dispo`, `boitier_mural_adaptable`
- Numériques : `diametre_cm`, `nombre_pales`, `surface_min_m2`, `surface_max_m2`, `distance_plafond_pales_cm`, `surface_destrat_m2`, `score_reparabilite`, `puissance_watts`
- Texte : `matiere_pales`, `garantie`, `hauteur_max_destrat`, `longueur_max_prolongateur`, `classe_energetique`, `indice_protection`, `type_source_lumineuse`, `sous_type`
- Booléens supplémentaires : `pales_reversibles_bicolores`, `kit_lumiere_option`, `telecommande_adaptable`
- `embedding` : vector(1536) — colonne conservée mais plus utilisée (pas de recherche vectorielle)
- `total_sales` : integer

Distribution des types de produit :
- ventilateur_plafond: 2978, accessoire: 455, (null): 76, brasseur_air: 50, chauffage: 48
- ventilateur_sur_pied: 39, destratificateur: 32, ventilateur_table: 24, climatiseur: 21
- autre: 16, humidificateur: 13, cheminee: 11, ventilateur_mural: 9, ventilateur_colonne: 6

### RPC `fan_boutique_search_v2` — Paramètres

38 paramètres (plus de `p_query_embedding`), tous optionnels. Filtrage par matching exact sur colonnes typées. Plus de recherche vectorielle ni de score de similarité.

- `p_include_out_of_stock` (DEFAULT FALSE) : par défaut, les produits avec `en_stock=false` sont exclus. Mettre `true` pour inclure les ruptures (ex: page admin, stats).
- `p_type_produit` : filtre exact (ex: "ventilateur_plafond"). **Par défaut le LLM envoie "ventilateur_plafond"** pour les requêtes génériques.
- `p_style`, `p_couleur_moteur`, `p_couleur_pales`, `p_matiere_pales` : tableaux text[] avec matching ANY
- `p_pieces` : tableau text[] avec overlap (&&)
- `p_marque` : ILIKE pour tolérance casse
- `p_reference` : recherche par référence produit (`LOWER(reference) LIKE '%' || LOWER(p_reference) || '%'`). Insensible à la casse, contains. L'utilisateur peut taper `te3_p8wi166` ou `TE3_P8Wi166` ou même juste `p8wi166` → match. Le préfixe `KL_`/`FAB_`/`FA_` est implicitement géré (non requis dans la requête).
- Booléens : matching exact (pas de ILIKE sur "Oui/Non" comme en V1)
- Prix : sur `effective_price` = COALESCE(prix_promo, prix_ttc)
- Tri : `p_sort_column` = sales_desc (défaut), price_asc, price_desc. Pas de tri par similarité.
- Produits en rupture (stock=0) poussés en bas des résultats
- ⚠️ `RETURNS TABLE` ne peut pas être modifié avec `CREATE OR REPLACE` — il faut `DROP FUNCTION` puis `CREATE FUNCTION`
- ⚠️ **Types `RETURNS TABLE` stricts** : les types doivent correspondre **exactement** aux colonnes de la table. Par exemple `prestashop_id` est `integer` (int4) dans la table, pas `bigint`. Idem `diametre_cm`, `puissance_watts`, `distance_plafond_pales_cm` sont `integer`, pas `numeric`. Un mismatch provoque l'erreur PostgREST "structure of query does not match function result type".
- ⚠️ **PostgREST schema cache** : après un `DROP + CREATE FUNCTION`, PostgREST garde l'ancien schéma en cache. `NOTIFY pgrst, 'reload schema'` ne suffit pas toujours → `docker restart supabase-rest-koc4w8ocsgs8kwwsggkwwkkc` pour forcer le rechargement.

## LLM Enrichissement (V2)

Pipeline dans `llm-enrichment/enrich_products.py` :
1. Récupère les produits depuis PrestaShop API (production www)
2. Enrichit chaque produit via GPT-4.1-mini (20 workers en parallèle)
3. Insère dans `fan_boutique_products_v2` (UPSERT sur prestashop_id)

Note : pas de vectorisation (embeddings retirés).

**Dernière exécution complète** : 2026-05-06 — 3812 produits enrichis, 0 erreurs, ~27 min.

### Mode 1 — Enrichissement complet (LLM, ~28 min, coûte ~3-5 €)
```bash
cd llm-enrichment && PYTHONUNBUFFERED=1 ../archive/v1-vectorisation/prestashop-catalog-sync/venv/bin/python enrich_products.py --all --db
```
- Re-classifie tous les produits via GPT-4.1-mini
- Vide la table puis ré-insère tout (TRUNCATE + INSERT)
- À utiliser quand : nouveaux produits dans le catalogue, ajustement du prompt LLM, refresh complet annuel

### Mode 2 — Refresh prix/stocks uniquement (sans LLM, ~3 min, coût 0 €)
```bash
cd llm-enrichment && PYTHONUNBUFFERED=1 ../archive/v1-vectorisation/prestashop-catalog-sync/venv/bin/python enrich_products.py --prices-only
```
- UPDATE ciblé sur 5 colonnes : `prix_ttc`, `prix_promo`, `en_stock`, `stock`, `total_sales`
- Préserve TOUS les attributs LLM existants (style, type_produit, couleurs, etc.)
- 20 workers parallèles, UPDATE par produit via `prestashop_id`
- Les produits **nouveaux** (pas encore dans Supabase) sont **ignorés** — il faut `--all --db` pour les ajouter
- À utiliser quand : refresh hebdomadaire des promos/prix, mise à jour stocks, recalcul des ventes

## Prompt LLM Parser — Règles clés (v6)

Fichier source : `prompts/llm-parser-v6-v2db.md`
Ce fichier est copié-collé directement dans le node LLM Parser de n8n (pas de lignes de commentaire en en-tête).

- **Plus de `refined_query`** : le LLM ne renvoie que des filtres structurés (pas de recherche vectorielle).
- **RÈGLE PRIORITAIRE — détection de référence produit** : placée tout en haut du prompt, court-circuite toutes les autres règles. Si la requête matche un pattern alphanumérique ≥ 5 chars avec chiffres ET séparateur (`_`, `-`, `.`, `/`) sans espace au milieu → seul `p_reference` est rempli (+ `p_sort_column`). Exemples : `KL_TE3_P8WI166_RINGCH`, `te3_p8wi166`, `FAB_213591328`. Le LLM ne remplit PAS `p_type_produit` dans ce cas (sinon ça filtrerait inutilement).
- **Type produit par défaut** : "ventilateur" sans précision → `p_type_produit: "ventilateur_plafond"`. Seuls les types explicites (table, mural, etc.) utilisent un autre type.
- **Anti sur-filtrage** : les requêtes courtes/vagues ne doivent pas activer trop de filtres.
- **Tolérance diamètre ±5cm** : "130 cm" → `p_diametre_min=125, p_diametre_max=135`.
- **Destratificateur synonymes** : "réversible", "marche arrière", "sens inverse" → `p_destratificateur: true`.
- **Promo** : "en promotion", "soldé" → `p_promo_only: true` + tri `price_asc`.
- **Couleur ambiguë** : "noir" sans contexte → `p_couleur_moteur` UNIQUEMENT (pas p_couleur_pales).
- **Valeurs normalisées** : tout en minuscules avec underscores (ventilateur_plafond, nickel_brosse, chambre_enfant).
- **37 noms de champs stricts** listés en fin de prompt (ajout de `p_reference`).

## Outils de test

- `test-llm-parser.mjs` : test direct du prompt GPT-4.1-mini. Lit `prompts/llm-parser-v6-v2db.md`. Usage : `node test-llm-parser.mjs` (batterie complète) ou `node test-llm-parser.mjs "requête"` (test unitaire).

## Development

No build step required - static files served directly.

**Local testing**: Open `demo.html` in browser. Configure `webhookUrl` in widget initialization.

**Deployment**: Push to GitHub (`git push origin main`) triggers automatic Netlify deployment.

## Netlify

**Site ID**: `f1734317-fc62-4b54-8b43-203da878eeca`
**URL de production**: `https://fan-boutique-search-engine.netlify.app`
**Demo**: `https://fan-boutique-search-engine.netlify.app/demo.html`

### Environment Variables

| Variable | Description | Valeur actuelle |
|----------|-------------|-----------------|
| `N8N_WEBHOOK_URL` | URL du webhook n8n | `https://n8n.guillaume-gonano.com/webhook/fan-boutique-search-engine` |
| `N8N_AUTH_HEADER_NAME` | Nom du header d'auth | `key` |
| `N8N_AUTH_HEADER_VALUE` | Valeur du header d'auth (secret) | *(configuré dans Netlify UI)* |
| `FB_ALLOWED_ORIGINS` | Origines CORS autorisées (virgules) | `https://www.ventilateurs-plafond.com,https://*.ventilateurs-plafond.com,https://fan-boutique-search-engine.netlify.app` |

## CSS Class Naming

All CSS classes use `.fm-` prefix (legacy from France Minéraux migration). Key classes:
- `.fm-search-results` - Results container
- `.fm-product-result` - Product card
- `.fm-query-chip` - Mobile query chip
- `.fm-modal-detail-row--highlighted` - Attribut surligné (filtre actif)
- `[data-theme="dark"]` - Dark mode variants

## Widget Configuration

```javascript
new FanBoutiqueSearchWidget('#search-input', {
  webhookUrl: 'https://...',    // Required
  theme: 'light',               // 'light' | 'dark'
  chipMode: 'always',           // 'always' | 'auto' | 'never'
  minChars: 4,
  debounceDelay: 800,
  initialResults: 100,
  loadMoreStep: 50,
  placeholderExamples: [        // Typewriter examples (mix néophyte + expert)
    "Je cherche un ventilateur pour ma chambre",
    "Grand ventilateur noir moderne avec lumière",
    // ... 10 exemples au total
  ]
});
```

## Format de réponse n8n → Widget

```json
{
  "results": [{
    "id": 3682,
    "titre": "Nom du produit",
    "prix": 199.00,
    "prix_promo": 149.00,
    "en_stock": true,
    "image": "https://...",
    "url": "https://...",
    "description": "Extrait de 120 caractères...",
    "details": {
      "style": "design",
      "couleur_moteur": "noir",
      "couleur_pales": "marron",
      "type_moteur": "DC",
      "silence": "Oui",
      "diametre": "132 cm",
      "nombre_pales": "3",
      "telecommande": "Oui",
      "wifi": "Oui",
      "reversible": "Oui",
      "lumiere": "Oui",
      "usage_exterieur": "Oui",
      "commande_vocale": "Oui",
      "matiere_pales": "abs",
      "garantie": "10 ans",
      "marque": "KlassFan",
      "gamme": "Modulo",
      "puissance": "22 W",
      "distance_plafond_pales": "20 cm",
      "surface": "20 – 30 m²",
      "pieces": "Salon, Chambre",
      "indice_protection": "IP44",
      "score_reparabilite": "9.5"
    },
    "active_filters": ["usage_exterieur", "wifi"]
  }],
  "active_filters": ["usage_exterieur", "wifi"]
}
```

Note : `active_filters` est présent à la racine ET dans chaque produit (redondance voulue pour simplicité).

## Color Scheme

Primary accent: `#ff750e` (orange)
Text color: `#1a2a3a` (dark blue)
Highlight filtre actif: `#fff7ed` (orange très pâle)

## Archive V1

L'ancien code V1 est dans `archive/` (gitignored) :
- `archive/v1-vectorisation/prestashop-catalog-sync/` : ancien script de vectorisation (JSONB metadata)
- `archive/v1-prompts/` : prompts LLM v4 et v5
- `archive/test-filters.mjs` : ancien test end-to-end V1

## Liens avec France Minéraux

Ce projet est dérivé du moteur de recherche France Minéraux (`france-mineraux-search-engine`).
Différences principales :
- Base Supabase séparée (`fan_boutique_*` au lieu de `france_mineraux_*`)
- V2 utilise des colonnes typées (pas JSONB) pour les attributs produit
- Prompt LLM adapté pour extraire des filtres ventilateur
- Même infrastructure (Netlify + n8n + Supabase + OpenAI)
