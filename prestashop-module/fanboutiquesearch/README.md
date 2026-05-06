# Fan Boutique Search — Module PrestaShop

Module qui remplace l'autocomplete natif de la barre de recherche PrestaShop par
le moteur sémantique Fan Boutique (LLM + filtres typés).

## Fonctionnement

Le module utilise une stratégie de **hijack** :
1. La barre de recherche native PrestaShop (`#search_widget`) reste en place
2. Le module désactive jQuery UI Autocomplete sur l'input
3. Il branche `FanBoutiqueSearchWidget` (chargé depuis Netlify) à la place
4. Si le widget est désactivé via le BO, le comportement natif reprend

## Installation

1. Zipper le dossier `fanboutiquesearch/`
2. Aller dans **Modules → Module Manager → Téléverser un module**
3. Sélectionner le zip
4. Cliquer sur **Configurer** pour régler les options

## Configuration (BO)

| Option | Description | Valeur par défaut |
|---|---|---|
| Activer le widget | Switch on/off global | Oui |
| URL de base du widget | CDN Netlify hébergeant le widget | `https://fan-boutique-search-engine.netlify.app` |
| Nombre min. de caractères | Seuil de déclenchement | 3 |
| Délai debounce (ms) | Attente après frappe | 500 |

## Désinstallation

La désinstallation supprime toutes les variables `FBS_*` de `ps_configuration`
et désenregistre le hook `displayHeader`. La barre native PrestaShop reprend
automatiquement son comportement.

## Hooks utilisés

- `displayHeader` (front, toutes pages)

## Dépendances externes

- `https://fan-boutique-search-engine.netlify.app/fan-boutique-search-widget.js`
- `https://fan-boutique-search-engine.netlify.app/fb-search-widget.css`
- `https://fan-boutique-search-engine.netlify.app/.netlify/functions/search` (proxy n8n)
