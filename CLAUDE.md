# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fan Boutique Search Widget - A JavaScript search widget that integrates with a vector search backend via n8n webhooks. The widget provides autocomplete-style search with results displayed in a dropdown panel.

## Architecture

```
├── fan-boutique-search-widget.js  # Main widget class (FanBoutiqueSearchWidget)
├── fb-search-widget.css           # Widget styling (uses .fm-* class prefix)
├── netlify/functions/search.mjs   # Serverless proxy function
├── demo.html                      # Test page
└── netlify.toml                   # Netlify configuration
```

### Key Components

**Widget (`FanBoutiqueSearchWidget`)**: Self-contained IIFE exposing `window.FanBoutiqueSearchWidget`. Features:
- Debounced search with configurable delay
- Query chip mode for mobile (hides input, shows query as chip)
- Animated placeholder rotation (typewriter effect)
- Search history (localStorage with `fb_search_history` key)
- Rate limit error handling
- Load more pagination

**Serverless Function**: Proxies requests to n8n webhook with:
- Origin-based CORS (`FB_ALLOWED_ORIGINS` env var)
- Client IP forwarding
- Authentication header injection (`N8N_AUTH_HEADER_NAME`, `N8N_AUTH_HEADER_VALUE`)

## Development

No build step required - static files served directly.

**Local testing**: Open `demo.html` in browser. Configure `webhookUrl` in widget initialization.

**Deployment**: Push to GitHub (`git push origin main`) triggers automatic Netlify deployment.

⚠️ **IMPORTANT**: Ne JAMAIS utiliser les outils MCP Netlify pour déployer. Toujours passer par GitHub (commit + push) pour déclencher le déploiement automatique.

## Environment Variables (Netlify)

| Variable | Description |
|----------|-------------|
| `N8N_WEBHOOK_URL` | Backend webhook URL |
| `N8N_AUTH_HEADER_NAME` | Auth header name |
| `N8N_AUTH_HEADER_VALUE` | Auth header value |
| `FB_ALLOWED_ORIGINS` | Comma-separated allowed origins for CORS |

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
