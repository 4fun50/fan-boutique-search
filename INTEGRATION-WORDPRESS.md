# 🔍 France Minéraux Search Widget - Intégration WordPress

Guide d'intégration du widget de recherche vectorielle dans WordPress.

## 🚀 Installation rapide (3 étapes)

### Étape 1: Ajouter le CSS dans le header

Allez dans **Apparence > Éditeur de thème** et ajoutez cette ligne dans le fichier `header.php` avant `</head>` :

```html
<link
  rel="stylesheet"
  href="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.css"
/>
```

**OU** utilisez un plugin comme **Insert Headers and Footers** :

1. Installez le plugin "Insert Headers and Footers"
2. Allez dans **Réglages > Insert Headers and Footers**
3. Dans la section "Scripts in Header", collez :

```html
<link
  rel="stylesheet"
  href="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.css"
/>
```

### Étape 2: Ajouter le JavaScript dans le footer

Dans le même fichier `header.php` ou via le plugin, ajoutez avant `</body>` :

```html
<script src="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.js"></script>
<script>
  // Remplacez '.search-field' par le sélecteur de votre input de recherche
  new FranceMinerauxSearchWidget(".search-field");
</script>
```

### Étape 3: Identifier votre input de recherche

Trouvez le sélecteur CSS de votre input de recherche WordPress. Les plus courants :

- `.search-field` (thème par défaut)
- `#search-form-input` (certains thèmes)
- `.search-input` (thèmes personnalisés)
- `input[type="search"]` (sélecteur générique)

**Comment trouver votre sélecteur :**

1. Faites un clic droit sur votre barre de recherche
2. Sélectionnez "Inspecteur" ou "Inspecter l'élément"
3. Regardez l'attribut `class` ou `id` de l'input

## 💡 Exemple complet pour WordPress

```html
<!-- Dans le <head> via Insert Headers and Footers -->
<link
  rel="stylesheet"
  href="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.css"
/>

<!-- Avant </body> via Insert Headers and Footers -->
<script src="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.js"></script>
<script>
  // Initialiser le widget sur l'input de recherche WordPress
  new FranceMinerauxSearchWidget(".search-field");
</script>
```

## 🎨 Configuration personnalisée

Vous pouvez personnaliser le widget :

```javascript
new FranceMinerauxSearchWidget(".search-field", {
  theme: "light", // 'light' ou 'dark'
  minChars: 3, // Nombre minimum de caractères
  debounceDelay: 300, // Délai avant recherche (ms)
  maxResults: 10, // Nombre max de résultats
  placeholder: "Rechercher une pierre...",
});
```

## 🔧 Méthodes d'intégration WordPress

### Méthode 1: Plugin "Insert Headers and Footers" (Recommandé)

✅ **Avantages :**

- Pas besoin de modifier les fichiers du thème
- Survit aux mises à jour du thème
- Interface simple

**Installation :**

1. Allez dans **Extensions > Ajouter**
2. Recherchez "Insert Headers and Footers"
3. Installez et activez
4. Allez dans **Réglages > Insert Headers and Footers**
5. Collez le code CSS dans "Scripts in Header"
6. Collez le code JS dans "Scripts in Footer"

### Méthode 2: Fichier functions.php

Ajoutez ce code dans le fichier `functions.php` de votre thème :

```php
function france_mineraux_search_widget() {
    ?>
    <link rel="stylesheet" href="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.css">
    <?php
}
add_action('wp_head', 'france_mineraux_search_widget');

function france_mineraux_search_widget_js() {
    ?>
    <script src="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.js"></script>
    <script>
        new FranceMinerauxSearchWidget('.search-field');
    </script>
    <?php
}
add_action('wp_footer', 'france_mineraux_search_widget_js');
```

### Méthode 3: Thème enfant (Child Theme)

Si vous utilisez un thème enfant, modifiez directement `header.php` :

```html
<!-- Avant </head> -->
<link
  rel="stylesheet"
  href="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.css"
/>

<!-- Avant </body> -->
<script src="https://VOTRE-SITE-NETLIFY.netlify.app/france-mineraux-search-widget.js"></script>
<script>
  new FranceMinerauxSearchWidget(".search-field");
</script>
```

## 🎯 Sélecteurs par thème WordPress

### Thème Astra

```javascript
new FranceMinerauxSearchWidget(".search-field");
```

### Thème OceanWP

```javascript
new FranceMinerauxSearchWidget("#oceanwp-mobile-menu-search input");
```

### Thème Divi

```javascript
new FranceMinerauxSearchWidget(".et-search-field");
```

### Thème Avada

```javascript
new FranceMinerauxSearchWidget(".fusion-search-form-content input");
```

### Thème GeneratePress

```javascript
new FranceMinerauxSearchWidget(".search-field");
```

## 🔍 Tester l'intégration

1. Videz le cache de votre site (si vous utilisez un plugin de cache)
2. Ouvrez votre site en navigation privée
3. Tapez au moins 3 caractères dans la barre de recherche
4. Les résultats devraient apparaître automatiquement

## 🐛 Dépannage

### Le widget ne s'affiche pas

1. **Vérifiez la console du navigateur** (F12 > Console)
2. **Vérifiez que les fichiers sont chargés** (F12 > Network)
3. **Vérifiez le sélecteur CSS** de votre input de recherche
4. **Videz le cache** de votre site et du navigateur

### Les résultats ne s'affichent pas

1. **Vérifiez la console** pour les erreurs
2. **Testez le webhook** directement dans votre navigateur
3. **Vérifiez que vous tapez au moins 3 caractères**

### Le positionnement est incorrect

Ajoutez ce CSS personnalisé dans **Apparence > Personnaliser > CSS additionnel** :

```css
.search-form {
  position: relative;
}
```

## 📱 Responsive

Le widget est automatiquement responsive et fonctionne sur :

- 📱 Mobile
- 📱 Tablette
- 💻 Desktop

## 🎨 Personnalisation des couleurs

Pour adapter les couleurs à votre charte graphique, ajoutez ce CSS dans **Apparence > Personnaliser > CSS additionnel** :

```css
/* Couleur de la marque */
.fm-product-brand {
  color: #VOTRE-COULEUR !important;
}

/* Couleur du prix */
.fm-product-price {
  color: #VOTRE-COULEUR !important;
}

/* Couleur de la barre de score */
.fm-score-fill {
  background: linear-gradient(90deg, #COULEUR1, #COULEUR2) !important;
}
```

## ⚡ Performance

- **CDN Netlify** : Fichiers servis rapidement
- **Cache navigateur** : Chargement instantané après la première visite
- **Debounce** : Évite les requêtes excessives
- **Lazy loading** : Résultats chargés à la demande

## 📞 Support

Pour toute question, contactez Guillaume Gonano.

---

**Version:** 1.0.0  
**Dernière mise à jour:** Décembre 2025
