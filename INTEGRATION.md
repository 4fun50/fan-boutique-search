# 📖 Documentation d'intégration - Widget de recherche France Minéraux

## 🎯 Vue d'ensemble

Ce widget de recherche permet d'intégrer un moteur de recherche intelligent sur le site WooCommerce de France Minéraux. Il utilise l'IA pour comprendre les requêtes en langage naturel et afficher des résultats pertinents.

**Démo en ligne :** https://france-mineraux-search.netlify.app/demo.html

---

## 📦 Fichiers nécessaires

Vous aurez besoin de 2 fichiers :

1. **france-mineraux-search-widget.css** - Styles du widget
2. **france-mineraux-search-widget.js** - Logique du widget

Ces fichiers sont disponibles sur :

- **Netlify (CDN)** : https://france-mineraux-search.netlify.app/
- **Fichiers locaux** : À uploader sur le serveur

---

## 🚀 Méthode d'intégration recommandée

### Option 1 : Via CDN Netlify (Recommandé)

Cette méthode est la plus simple et ne nécessite pas d'uploader de fichiers.

#### Étape 1 : Ajouter le code dans `functions.php`

Ajoutez ce code dans le fichier `functions.php` de votre thème WordPress (ou via un plugin comme "Code Snippets") :

```php
<?php
/**
 * Intégration du widget de recherche France Minéraux
 */

// Charger les fichiers CSS et JS du widget depuis Netlify
function fm_enqueue_search_widget() {
    // CSS du widget
    wp_enqueue_style(
        'fm-search-widget',
        'https://france-mineraux-search.netlify.app/france-mineraux-search-widget.css',
        array(),
        '20251228'
    );

    // JS du widget
    wp_enqueue_script(
        'fm-search-widget',
        'https://france-mineraux-search.netlify.app/france-mineraux-search-widget.js',
        array(),
        '20251228',
        true
    );
}
add_action('wp_enqueue_scripts', 'fm_enqueue_search_widget');

// Initialiser le widget sur la barre de recherche existante
function fm_init_search_widget() {
    ?>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // IMPORTANT : Remplacer '.search-field' par le sélecteur CSS de votre barre de recherche
            // Voir section "Comment trouver le bon sélecteur" ci-dessous
            new FranceMinerauxSearchWidget('.search-field');
        });
    </script>
    <?php
}
add_action('wp_footer', 'fm_init_search_widget');
?>
```

---

### Option 2 : Fichiers hébergés localement

Si vous préférez héberger les fichiers sur votre serveur :

#### Étape 1 : Uploader les fichiers

Uploadez les 2 fichiers dans ce répertoire :

```
/wp-content/uploads/france-mineraux-widget/
```

#### Étape 2 : Ajouter le code dans `functions.php`

```php
<?php
/**
 * Intégration du widget de recherche France Minéraux (fichiers locaux)
 */

function fm_enqueue_search_widget() {
    $upload_dir = wp_upload_dir();
    $widget_url = $upload_dir['baseurl'] . '/france-mineraux-widget/';

    // CSS du widget
    wp_enqueue_style(
        'fm-search-widget',
        $widget_url . 'france-mineraux-search-widget.css',
        array(),
        '20251228'
    );

    // JS du widget
    wp_enqueue_script(
        'fm-search-widget',
        $widget_url . 'france-mineraux-search-widget.js',
        array(),
        '20251228',
        true
    );
}
add_action('wp_enqueue_scripts', 'fm_enqueue_search_widget');

function fm_init_search_widget() {
    ?>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            new FranceMinerauxSearchWidget('.search-field');
        });
    </script>
    <?php
}
add_action('wp_footer', 'fm_init_search_widget');
?>
```

---

## 🔍 Comment trouver le bon sélecteur CSS

**C'est l'étape la plus importante !** Le widget doit savoir quel champ de recherche utiliser.

### Méthode 1 : Inspecteur du navigateur

1. Allez sur le site staging
2. **Clic droit** sur le champ de recherche → **"Inspecter"**
3. Vous verrez le code HTML, par exemple :
   ```html
   <input type="search" class="search-field" id="s" name="s" />
   ```
4. Notez la **classe** (`.search-field`) ou l'**ID** (`#s`)

### Méthode 2 : Console JavaScript

1. Ouvrez la console du navigateur (F12)
2. Testez ces commandes :
   ```javascript
   document.querySelector(".search-field");
   document.querySelector("#s");
   document.querySelector("#woocommerce-product-search-field-0");
   ```
3. Si la commande retourne un élément (pas `null`), c'est le bon sélecteur !

### Sélecteurs courants selon les thèmes

| Thème        | Sélecteur probable                                       |
| ------------ | -------------------------------------------------------- |
| Storefront   | `.search-field`                                          |
| Astra        | `.search-field` ou `#woocommerce-product-search-field-0` |
| Divi         | `.et-search-field`                                       |
| OceanWP      | `.search-field`                                          |
| Thème custom | À identifier avec l'inspecteur                           |

### Exemple de code final

Une fois le sélecteur trouvé, remplacez dans le code :

```javascript
// Si le sélecteur est '.search-field'
new FranceMinerauxSearchWidget(".search-field");

// Si le sélecteur est '#s'
new FranceMinerauxSearchWidget("#s");

// Si le sélecteur est '#woocommerce-product-search-field-0'
new FranceMinerauxSearchWidget("#woocommerce-product-search-field-0");
```

---

## ✅ Vérification de l'installation

### 1. Vérifier que les fichiers sont chargés

Ouvrez la console du navigateur (F12) et vérifiez :

```javascript
// Vérifier que le widget est disponible
typeof FranceMinerauxSearchWidget;
// Doit retourner : "function"
```

### 2. Tester la recherche

1. Tapez au moins **4 caractères** dans la barre de recherche
2. Vous devriez voir :
   - Un spinner de chargement violet
   - Les résultats s'afficher en dessous du champ de recherche

### 3. Vérifier les requêtes réseau

Dans l'onglet **Network** (Réseau) de la console :

- Cherchez une requête vers : `https://n8n.guillaume-gonano.com/webhook/search-engine-france-mineraux`
- Status doit être : **200 OK**

---

## 🎨 Design et couleurs

Le widget utilise automatiquement les couleurs de France Minéraux :

- **Violet** : `#45293F` (titres, étoiles, spinner)
- **Or** : `rgb(215, 185, 132)` (prix)
- **Police** : Jost, sans-serif

Aucune personnalisation CSS n'est nécessaire, le widget est déjà stylisé.

---

## 🔧 Fonctionnalités du widget

### Recherche intelligente

- Comprend le langage naturel (ex: "pierre pour le stress")
- Recherche par nom de produit, vertus, signes astrologiques
- Minimum 4 caractères pour lancer la recherche
- Debounce de 500ms pour éviter trop de requêtes

### Affichage des résultats

- Image du produit
- Titre du produit (violet)
- Vertus et signes astrologiques (avec ellipsis si trop long)
- Prix (or)
- Note en étoiles (uniquement si avis > 0)
- Lien direct vers la page produit

### États

- **Chargement** : Spinner violet animé
- **Résultats** : Liste des produits
- **Aucun résultat** : Message informatif
- **Erreur** : Message d'erreur

---

## 🐛 Dépannage

### Le widget ne s'affiche pas

1. **Vérifier que les fichiers sont chargés**

   - Ouvrez la console (F12) → Onglet Network
   - Cherchez `france-mineraux-search-widget.css` et `.js`
   - Vérifiez qu'ils ont un status **200**

2. **Vérifier le sélecteur CSS**

   ```javascript
   // Dans la console
   document.querySelector(".search-field");
   // Doit retourner l'élément input, pas null
   ```

3. **Vérifier qu'il n'y a pas d'erreurs JavaScript**
   - Ouvrez la console (F12) → Onglet Console
   - Cherchez des erreurs en rouge

### Les résultats ne s'affichent pas

1. **Vérifier la requête API**

   - Onglet Network → Cherchez la requête vers n8n
   - Vérifiez le status (doit être 200)
   - Vérifiez la réponse (doit contenir un JSON avec `results`)

2. **Vérifier la longueur de la recherche**
   - Il faut au moins **4 caractères** pour lancer la recherche

### Conflit CSS avec le thème

Si le design du widget est cassé :

1. Vérifiez qu'il n'y a pas de CSS du thème qui écrase les styles
2. Augmentez la spécificité si nécessaire :
   ```css
   /* Ajoutez dans votre CSS custom si besoin */
   .fm-search-widget .fm-product-result {
     /* Vos ajustements */
   }
   ```

---

## 📞 Support technique

**Webhook API :** https://n8n.guillaume-gonano.com/webhook/search-engine-france-mineraux

**Format de la requête :**

```json
{
  "query": "améthyste"
}
```

**Format de la réponse :**

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

- [ ] Fichiers CSS et JS uploadés (ou CDN configuré)
- [ ] Code ajouté dans `functions.php`
- [ ] Sélecteur CSS identifié et configuré
- [ ] Test sur staging : recherche fonctionne
- [ ] Vérification : résultats s'affichent correctement
- [ ] Vérification : design cohérent avec le site
- [ ] Test sur mobile : responsive OK
- [ ] Validation finale avant mise en production

---

## 🎯 Résumé rapide

**Pour intégrer le widget :**

1. Ajoutez le code dans `functions.php`
2. Trouvez le sélecteur CSS de votre barre de recherche (ex: `.search-field`)
3. Remplacez le sélecteur dans le code JavaScript
4. Testez avec au moins 4 caractères

**C'est tout !** Le widget se charge automatiquement et transforme votre barre de recherche en moteur de recherche intelligent.

---

_Documentation créée le 28 décembre 2024_
_Version du widget : 1.0.0_
