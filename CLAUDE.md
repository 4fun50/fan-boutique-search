# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fan Boutique Search Widget - Moteur de recherche sémantique pour ventilateurs-plafond.com. Widget JavaScript qui s'intègre sur le site e-commerce et communique avec un backend de recherche vectorielle via n8n.

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
      → OpenAI Embedding (vectorisation de la requête)
      → Code node "Build Supabase Payload" (sérialisation JSON propre)
      → Supabase RPC: fan_boutique_search_v2 (recherche vectorielle + filtres)
      → Code node "Recover all values for frontend" (formatage réponse)
    → Réponse formatée au widget
```

### Key Components

**Widget (`FanBoutiqueSearchWidget`)**: Self-contained IIFE exposing `window.FanBoutiqueSearchWidget`. Features:
- Debounced search with configurable delay
- Query chip mode for mobile (hides input, shows query as chip)
- Animated placeholder rotation (typewriter effect)
- Search history (localStorage with `fb_search_history` key)
- Rate limit error handling
- Load more pagination
- Welcome message with examples responsifs (4 mobile / 6 desktop)
- Accordion de détails produit via `detailsConfig` array (facile à modifier)
- Affichage prix promo (barré + badge -XX%) automatique si `prix_promo` fourni
- Badge "Rupture de stock" + opacité réduite pour produits hors stock

**Serverless Function** (`netlify/functions/search.mjs`): Proxies requests to n8n webhook with:
- Origin-based CORS (`FB_ALLOWED_ORIGINS` env var, supporte les wildcards `https://*.ventilateurs-plafond.com`)
- Client IP forwarding (via `x-nf-client-connection-ip`, `x-forwarded-for`, `x-real-ip`)
- Authentication header injection (`N8N_AUTH_HEADER_NAME`, `N8N_AUTH_HEADER_VALUE`)

### Backend (services externes)

**n8n** (hébergé sur `n8n.guillaume-gonano.com`):
- Webhook: `fan-boutique-search-engine` (Header Auth)
- Orchestre le pipeline : rate limit → LLM parsing → embedding → build payload → recherche vectorielle → formatage
- ⚠️ Node "Supabase request" (HTTP Request) : Response Format doit être forcé en **JSON** (pas Autodetect) sinon mojibake UTF-8
- ⚠️ Le payload Supabase doit passer par un **Code node** (pas "Using JSON" direct) car les champs tableau (p_style, p_couleur_moteur, etc.) ne se sérialisent pas correctement en mode expression

**Supabase** (hébergé sur `supabase.guillaume-gonano.com`):
- Table `fan_boutique_products_v2` : ~3779 produits avec colonnes typées + embeddings vectoriels
- Table `fan_boutique_rate_limit` : rate limiting par IP (minute + jour)
- Fonction RPC `fan_boutique_check_rate_limit` : vérification atomique des limites
- Fonction RPC `fan_boutique_search_v2` : recherche vectorielle avec filtres structurés (37 paramètres)
- Index IVFFlat (lists=60) pour la recherche vectorielle cosine

### Base de données V2 — Table `fan_boutique_products_v2`

Colonnes principales :
- `id`, `prestashop_id`, `nom`, `prix_ttc`, `prix_promo`, `en_stock`, `stock`
- `image_url`, `product_url`, `description_courte`, `description_longue`

Attributs LLM normalisés (colonnes typées, pas JSONB) :
- `type_produit` : ventilateur_plafond, ventilateur_table, ventilateur_sur_pied, ventilateur_mural, ventilateur_colonne, destratificateur, brasseur_air, climatiseur, humidificateur, chauffage, cheminee, accessoire
- `style` : moderne, classique, industriel, tropical, design, nordique, rustique, retro, minimaliste, enfant, exterieur
- `couleur_moteur`, `couleur_pales` : valeurs normalisées (blanc, noir, nickel_brosse, etc.)
- `type_moteur` : dc, ac
- `marque`, `gamme` : strings
- `pieces` : tableau PostgreSQL text[] (salon, chambre, chambre_enfant, etc.)
- Booléens : `silencieux`, `avec_lumiere`, `avec_telecommande`, `wifi`, `reversible`, `option_destratificateur`, `usage_exterieur`, `plafond_en_pente`, `commande_vocale`, `app_telephone`, `lumiere_dimmable`, `sonde_thermostatique`, `prolongateur_dispo`, `boitier_mural_adaptable`
- Numériques : `diametre_cm`, `nombre_pales`, `surface_min_m2`, `surface_max_m2`, `distance_plafond_pales_cm`, `surface_destrat_m2`, `score_reparabilite`
- Texte : `matiere_pales`, `garantie`, `hauteur_max_destrat`, `longueur_max_prolongateur`
- `embedding` : vector(1536), `total_sales` : integer

Distribution des types de produit :
- ventilateur_plafond: 2978, accessoire: 455, (null): 76, brasseur_air: 50, chauffage: 48
- ventilateur_sur_pied: 39, destratificateur: 32, ventilateur_table: 24, climatiseur: 21
- autre: 16, humidificateur: 13, cheminee: 11, ventilateur_mural: 9, ventilateur_colonne: 6

### RPC `fan_boutique_search_v2` — Paramètres

37 paramètres, tous optionnels. Filtrage par matching exact sur colonnes typées.
- `p_type_produit` : filtre exact (ex: "ventilateur_plafond"). **Par défaut le LLM envoie "ventilateur_plafond"** pour les requêtes génériques.
- `p_style`, `p_couleur_moteur`, `p_couleur_pales`, `p_matiere_pales` : tableaux text[] avec matching ANY
- `p_pieces` : tableau text[] avec overlap (&&)
- `p_marque` : ILIKE pour tolérance casse
- Booléens : matching exact (pas de ILIKE sur "Oui/Non" comme en V1)
- Prix : sur `effective_price` = COALESCE(prix_promo, prix_ttc)
- Tri : `p_sort_column` = sales_desc (défaut), price_asc, price_desc. Similarité vectorielle toujours en tri secondaire.
- Produits en rupture (stock=0) poussés en bas des résultats

## LLM Enrichissement (V2)

Pipeline dans `llm-enrichment/enrich_products.py` :
1. Récupère les produits depuis PrestaShop API (production www)
2. Enrichit chaque produit via GPT-4.1-mini (20 workers en parallèle)
3. Génère l'embedding OpenAI (text-embedding-3-small, 1536 dims)
4. Insère dans `fan_boutique_products_v2` (UPSERT sur prestashop_id)
5. Reconstruit l'index IVFFlat

**Dernière exécution** : 2026-03-11 — 3779 produits enrichis, 0 erreurs, ~28 minutes.
Lancer : `cd llm-enrichment && PYTHONUNBUFFERED=1 ../prestashop-catalog-sync/venv/bin/python enrich_products.py`

## Prompt LLM Parser — Règles clés (v6)

Fichier source : `prompts/llm-parser-v6-v2db.md`

- **Type produit par défaut** : "ventilateur" sans précision → `p_type_produit: "ventilateur_plafond"`. Seuls les types explicites (table, mural, etc.) utilisent un autre type.
- **Anti sur-filtrage** : les requêtes courtes/vagues ne doivent pas activer trop de filtres.
- **Tolérance diamètre ±5cm** : "130 cm" → `p_diametre_min=125, p_diametre_max=135`.
- **Destratificateur synonymes** : "réversible", "marche arrière", "sens inverse" → `p_destratificateur: true`.
- **Promo** : "en promotion", "soldé" → `p_promo_only: true` + tri `price_asc`.
- **Couleur ambiguë** : "noir" sans contexte → `p_couleur_moteur` UNIQUEMENT (pas p_couleur_pales).
- **Valeurs normalisées** : tout en minuscules avec underscores (ventilateur_plafond, nickel_brosse, chambre_enfant).
- **36 noms de champs stricts** listés en fin de prompt.

## Outils de test

- `test-llm-parser.mjs` : test direct du prompt GPT-4.1-mini. Lit `prompts/llm-parser-v6-v2db.md`. Usage : `node test-llm-parser.mjs` (batterie complète) ou `node test-llm-parser.mjs "requête"` (test unitaire).

## Development

No build step required - static files served directly.

**Local testing**: Open `demo.html` in browser. Configure `webhookUrl` in widget initialization.

**Deployment**: Push to GitHub (`git push origin main`) triggers automatic Netlify deployment.

⚠️ **IMPORTANT**: Ne JAMAIS utiliser les outils MCP Netlify pour déployer. Toujours passer par GitHub (commit + push) pour déclencher le déploiement automatique.

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
    "score_similarite": "57%",
    "details": {
      "style": "design",
      "couleur_moteur": "noir",
      "couleur_pales": "marron",
      "type_moteur": "dc",
      "silence": "Oui",
      "diametre": "132 cm",
      "nombre_pales": "3",
      "telecommande": "Oui",
      "garantie": "10 ans"
    }
  }]
}
```

## Color Scheme

Primary accent: `#ff750e` (orange)
Text color: `#1a2a3a` (dark blue)

## CORS Wildcard

La fonction serverless supporte les patterns wildcard dans `FB_ALLOWED_ORIGINS`.
Exemple : `https://*.ventilateurs-plafond.com` autorise tous les sous-domaines.

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
