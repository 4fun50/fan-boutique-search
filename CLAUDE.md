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
└── netlify.toml                   # Netlify configuration
```

### Chaîne complète (flux de données)

```
Widget JS (navigateur)
  → Netlify serverless function (proxy CORS + auth)
    → n8n webhook (orchestration)
      → Rate limit check (Supabase RPC: fan_boutique_check_rate_limit)
      → LLM Parser (GPT-4.1-mini: extraction de filtres structurés)
      → OpenAI Embedding (vectorisation de la requête)
      → Supabase RPC: fan_boutique_search_v1 (recherche vectorielle + filtres)
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

**Serverless Function** (`netlify/functions/search.mjs`): Proxies requests to n8n webhook with:
- Origin-based CORS (`FB_ALLOWED_ORIGINS` env var, supporte les wildcards `https://*.ventilateurs-plafond.com`)
- Client IP forwarding (via `x-nf-client-connection-ip`, `x-forwarded-for`, `x-real-ip`)
- Authentication header injection (`N8N_AUTH_HEADER_NAME`, `N8N_AUTH_HEADER_VALUE`)

### Backend (services externes)

**n8n** (hébergé sur `n8n.guillaume-gonano.com`):
- Webhook: `fan-boutique-search-engine` (Header Auth)
- Orchestre le pipeline : rate limit → LLM parsing → embedding → recherche vectorielle → formatage

**Supabase** (hébergé sur `supabase.guillaume-gonano.com`):
- Table `fan_boutique_products` : 4140 produits avec embeddings vectoriels et métadonnées JSONB
- Table `fan_boutique_rate_limit` : rate limiting par IP (minute + jour)
- Fonction RPC `fan_boutique_check_rate_limit` : vérification atomique des limites
- Fonction RPC `fan_boutique_search_v1` : recherche vectorielle avec filtres structurés

**Métadonnées produits filtrables** (champs JSONB dans `fan_boutique_products.metadata`):
- `styles` : Classique, Moderne, Industriel, Tropical, Design, Nordique, Rustique
- `couleur_du_moteur` : ~23 valeurs (Blanc, Noir, Nickel, Chrome, Bois, etc.)
- `couleurs_des_pales` : ~50 valeurs
- `type_de_moteur_ac_ou_dc` : AC, DC
- `hyper_silence` : Oui, Non
- `livre_avec_lumiere` : Oui, Non
- `wifi` : Oui, Non
- `ip` : IP20, IP44 (indicateur extérieur)
- `option_destratificateur` : Oui, Non
- `nombre_de_pales_maximum` : 2-8
- `diametre_total_cm` : numérique
- `prix` : numérique

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
  placeholderExamples: ['...']  // Typewriter examples
});
```

## Color Scheme

Primary accent: `#ff750e` (orange)
Text color: `#1a2a3a` (dark blue)

## CORS Wildcard

La fonction serverless supporte les patterns wildcard dans `FB_ALLOWED_ORIGINS`.
Exemple : `https://*.ventilateurs-plafond.com` autorise tous les sous-domaines.
Logique implémentée dans [search.mjs](netlify/functions/search.mjs) (lignes 43-68).

## Liens avec France Minéraux

Ce projet est dérivé du moteur de recherche France Minéraux (`france-mineraux-search-engine`).
Différences principales :
- Base Supabase séparée (`fan_boutique_*` au lieu de `france_mineraux_*`)
- Métadonnées JSONB adaptées aux ventilateurs (style, moteur, pales, silence, wifi, etc.)
- Prompt LLM adapté pour extraire des filtres ventilateur
- Même infrastructure (Netlify + n8n + Supabase + OpenAI)
