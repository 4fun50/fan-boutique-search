# 📖 Widget de recherche France Minéraux - Guide d'intégration

> Documentation technique pour l'intégration du widget de recherche intelligent sur le site WooCommerce

---

## 🎯 Vue d'ensemble

Ce widget transforme la barre de recherche existante en un moteur de recherche intelligent utilisant l'IA pour comprendre les requêtes en langage naturel.

**🔗 Démo en ligne :** [https://france-mineraux-search.netlify.app/demo.html](https://france-mineraux-search.netlify.app/demo.html)

---

## 📦 Fichiers nécessaires

Deux fichiers sont requis pour l'intégration :

1. **`france-mineraux-search-widget.css`** - Styles du widget
2. **`france-mineraux-search-widget.js`** - Logique JavaScript

**Télécharger les fichiers :**

- **CSS** : [https://france-mineraux-search.netlify.app/france-mineraux-search-widget.css](https://france-mineraux-search.netlify.app/france-mineraux-search-widget.css)
- **JS** : [https://france-mineraux-search.netlify.app/france-mineraux-search-widget.js](https://france-mineraux-search.netlify.app/france-mineraux-search-widget.js)

**💡 Astuce :** Clic droit sur les liens → "Enregistrer sous..." pour télécharger les fichiers

---

## 🚀 Méthode d'intégration

### Étape 1 : Upload des fichiers sur le serveur

Uploader les 2 fichiers dans le répertoire de votre thème WordPress :

```
/wp-content/themes/votre-theme/assets/france-mineraux-widget/
```

**Fichiers à uploader :**

- `france-mineraux-search-widget.css`
- `france-mineraux-search-widget.js`

**Alternative :** Vous pouvez aussi les placer dans :

```
/wp-content/uploads/france-mineraux-widget/
```

### Étape 2 : Ajouter les fichiers dans le header du site

Ouvrir le fichier `header.php` de votre thème WordPress et ajouter ces lignes **avant la balise `</head>`** :

```html
<!-- Widget de recherche France Minéraux -->
<link
  rel="stylesheet"
  href="<?php echo get_template_directory_uri(); ?>/assets/france-mineraux-widget/france-mineraux-search-widget.css"
/>
<script src="<?php echo get_template_directory_uri(); ?>/assets/france-mineraux-widget/france-mineraux-search-widget.js"></script>
```

**Si vous avez placé les fichiers dans `/wp-content/uploads/` :**

```html
<!-- Widget de recherche France Minéraux -->
<link
  rel="stylesheet"
  href="<?php echo wp_upload_dir()['baseurl']; ?>/france-mineraux-widget/france-mineraux-search-widget.css"
/>
<script src="<?php echo wp_upload_dir()['baseurl']; ?>/france-mineraux-widget/france-mineraux-search-widget.js"></script>
```

### Étape 3 : Initialiser le widget

Ajouter ce code **avant la balise `</body>`** dans le fichier `footer.php` :

```html
<script>
  document.addEventListener("DOMContentLoaded", function () {
    // ⚠️ IMPORTANT : Remplacer '.search-field' par le sélecteur CSS de votre barre de recherche
    new FranceMinerauxSearchWidget(".search-field");
  });
</script>
```

---

## 🔍 Trouver le sélecteur CSS (ÉTAPE CRITIQUE)

Le widget doit savoir quel champ de recherche utiliser. Voici comment trouver le bon sélecteur :

### Méthode 1 : Inspecteur du navigateur

1. Aller sur le site staging
2. **Clic droit** sur le champ de recherche → **"Inspecter"**
3. Observer le code HTML :
   ```html
   <input type="search" class="search-field" id="s" name="s" />
   ```
4. Noter la **classe** (`.search-field`) ou l'**ID** (`#s`)

### Méthode 2 : Console JavaScript

1. Ouvrir la console du navigateur (F12)
2. Tester ces commandes :
   ```javascript
   document.querySelector(".search-field");
   document.querySelector("#s");
   document.querySelector("#woocommerce-product-search-field-0");
   ```
3. Si la commande retourne un élément (pas `null`), c'est le bon sélecteur !

### Sélecteurs courants par thème

| Thème WooCommerce | Sélecteur probable                                       |
| ----------------- | -------------------------------------------------------- |
| Storefront        | `.search-field`                                          |
| Astra             | `.search-field` ou `#woocommerce-product-search-field-0` |
| Divi              | `.et-search-field`                                       |
| OceanWP           | `.search-field`                                          |
| Flatsome          | `.search-field`                                          |
| Thème custom      | À identifier avec l'inspecteur                           |

### Exemple d'utilisation

Une fois le sélecteur trouvé, l'utiliser dans le code :

```javascript
// Avec une classe
new FranceMinerauxSearchWidget(".search-field");

// Avec un ID
new FranceMinerauxSearchWidget("#s");

// Avec un sélecteur spécifique
new FranceMinerauxSearchWidget("#woocommerce-product-search-field-0");
```

---

## ✅ Vérification de l'installation

### 1. Vérifier le chargement des fichiers

**Console du navigateur (F12) → Onglet Network :**

- Chercher `france-mineraux-search-widget.css`
- Chercher `france-mineraux-search-widget.js`
- Vérifier que le status est **200 OK**

**Console JavaScript :**

```javascript
typeof FranceMinerauxSearchWidget;
// Doit retourner : "function"
```

### 2. Tester la recherche

1. Taper au moins **4 caractères** dans la barre de recherche
2. Observer :
   - ⏳ Spinner de chargement violet
   - 📋 Résultats s'affichant en dessous

### 3. Vérifier les requêtes API

**Onglet Network → Filter "XHR" :**

- Chercher la requête vers : `n8n.guillaume-gonano.com`
- Status doit être : **200 OK**
- Response doit contenir un JSON avec `results`

---

## 🎨 Design et couleurs

Le widget utilise automatiquement les couleurs de France Minéraux :

| Élément         | Couleur | Code                 |
| --------------- | ------- | -------------------- |
| Titres produits | Violet  | `#45293F`            |
| Prix            | Or      | `rgb(215, 185, 132)` |
| Étoiles         | Violet  | `#45293F`            |
| Spinner         | Violet  | `#45293F`            |
| Police          | Jost    | Google Fonts         |

**Aucune personnalisation CSS n'est nécessaire** - Le widget est déjà stylisé.

---

## 🔧 Fonctionnalités du widget

### Recherche intelligente

- ✅ Comprend le langage naturel (ex: "pierre pour le stress")
- ✅ Recherche par nom, vertus, signes astrologiques
- ✅ Minimum 4 caractères pour lancer la recherche
- ✅ Debounce de 500ms (évite trop de requêtes)

### Affichage des résultats

- 🖼️ Image du produit
- 📝 Titre du produit (violet #45293F)
- 🔮 Vertus (avec ellipsis si trop long)
- ♈ Signes astrologiques (avec ellipsis si trop long)
- 💰 Prix (or rgb(215, 185, 132))
- ⭐ Note en étoiles (uniquement si avis > 0)
- 🔗 Lien direct vers la page produit

### États du widget

- **Chargement** : Spinner violet animé
- **Résultats** : Liste des produits
- **Aucun résultat** : Message informatif
- **Erreur** : Message d'erreur

---

## 🐛 Dépannage

### ❌ Le widget ne s'affiche pas

**1. Vérifier le chargement des fichiers**

- Console (F12) → Network
- Chercher les fichiers CSS et JS
- Vérifier status 200

**2. Vérifier le sélecteur CSS**

```javascript
document.querySelector(".search-field");
// Doit retourner l'élément input, pas null
```

**3. Vérifier les erreurs JavaScript**

- Console (F12) → Onglet Console
- Chercher les erreurs en rouge

### ❌ Les résultats ne s'affichent pas

**1. Vérifier la requête API**

- Network → Chercher la requête vers n8n
- Vérifier le status (200)
- Vérifier la réponse JSON

**2. Vérifier la longueur de recherche**

- Minimum **4 caractères** requis

**3. Vérifier la console**

```javascript
// Taper dans la console
document.querySelector(".fm-search-results");
// Doit retourner l'élément de résultats
```

### ❌ Conflit CSS avec le thème

Si le design est cassé :

```css
/* Ajouter dans le CSS custom du thème si nécessaire */
.fm-search-widget .fm-product-result {
  /* Vos ajustements */
}
```

---

## 📞 Informations techniques

### API Webhook

**URL :** `https://n8n.guillaume-gonano.com/webhook/search-engine-france-mineraux`

### Format de requête

```json
{
  "query": "améthyste"
}
```

### Format de réponse

```json
{
  "results": [
    {
      "titre": "Pendentif Améthyste - Pointe",
      "prix": 15.0,
      "url": "https://...",
      "image": "https://...",
      "note": 5,
      "avis": 12,
      "details": {
        "pierre": "Améthyste",
        "vertus": "Lâcher-prise, Sommeil, Stress",
        "signes": "Vierge, Sagittaire, Capricorne"
      }
    }
  ]
}
```

---

## 📝 Checklist d'intégration

- [ ] Code ajouté dans `functions.php`
- [ ] Sélecteur CSS identifié et configuré
- [ ] Test sur staging : fichiers chargés (Network)
- [ ] Test : recherche avec 4+ caractères fonctionne
- [ ] Vérification : résultats s'affichent correctement
- [ ] Vérification : design cohérent avec le site
- [ ] Test responsive : mobile OK
- [ ] Test : clic sur résultat redirige vers produit
- [ ] Validation finale avant production

---

## 🎯 Résumé rapide

**Pour intégrer le widget en 3 étapes :**

1. ✅ Ajouter le code PHP dans `functions.php`
2. ✅ Trouver le sélecteur CSS de la barre de recherche (ex: `.search-field`)
3. ✅ Remplacer le sélecteur dans le code JavaScript

**C'est tout !** Le widget transforme automatiquement votre barre de recherche en moteur intelligent.

---

_Documentation créée le 28 décembre 2024_  
_Version du widget : 1.0.0_  
_Dernière mise à jour : 28/12/2024_
