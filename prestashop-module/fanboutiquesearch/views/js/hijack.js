/**
 * Fan Boutique Search — Hijack de l'autocomplete natif PrestaShop
 *
 * Détecte les inputs <input name="s" class="ui-autocomplete-input"> rendus
 * par le module ps_searchbar (desktop + mobile), désactive jQuery UI Autocomplete,
 * et branche le widget FanBoutiqueSearchWidget à leur place.
 *
 * Dépendances :
 *   - window.FanBoutiqueSearchWidget (chargé depuis Netlify avant ce script)
 *   - window.fbsConfig (injecté par le module via Media::addJsDef)
 *   - window.jQuery (présent par défaut sur PrestaShop)
 */
(function () {
  'use strict';

  var INPUT_SELECTOR = 'input[name="s"].ui-autocomplete-input';
  var DEBUG = false;

  function log() {
    if (DEBUG && window.console) {
      console.log.apply(console, ['[FBS]'].concat([].slice.call(arguments)));
    }
  }

  function ready() {
    if (!window.FanBoutiqueSearchWidget) {
      log('Widget non chargé — abandon');
      return;
    }
    if (!window.jQuery) {
      log('jQuery non chargé — abandon');
      return;
    }
    if (!window.fbsConfig || !window.fbsConfig.webhookUrl) {
      log('fbsConfig manquant — abandon');
      return;
    }

    var $inputs = window.jQuery(INPUT_SELECTOR);
    if (!$inputs.length) {
      log('Aucun input trouvé');
      return;
    }

    $inputs.each(function () {
      attachWidget(this);
    });
  }

  function attachWidget(input) {
    if (input._fbsAttached) return;
    input._fbsAttached = true;

    // 1. Désactiver jQuery UI Autocomplete natif sur cet input
    try {
      var $input = window.jQuery(input);
      if ($input.data('uiAutocomplete') || $input.data('autocomplete')) {
        $input.autocomplete('destroy');
        log('Autocomplete natif désactivé');
      }
    } catch (e) {
      log('Erreur destroy autocomplete', e);
    }

    // 2. Construire un sélecteur unique pour cet input (le widget en a besoin)
    if (!input.id) {
      input.id = 'fbs-input-' + Math.random().toString(36).slice(2, 9);
    }

    // 3. Décider si on active Fan Boutique sur cet input ou pas
    if (!shouldActivateFanBoutique(input)) {
      log('Fan Boutique non activé pour cet input', input);
      return;
    }

    // 4. Instancier le widget
    try {
      input._fbsWidget = new window.FanBoutiqueSearchWidget('#' + input.id, {
        webhookUrl: window.fbsConfig.webhookUrl,
        minChars: window.fbsConfig.minChars || 3,
        debounceDelay: window.fbsConfig.debounceDelay || 500,
        chipMode: 'always',
      });
      log('Widget instancié sur', '#' + input.id);
    } catch (e) {
      log('Erreur instanciation widget', e);
    }
  }

  /**
   * Décide si le widget Fan Boutique doit s'activer sur cet input.
   *
   * Le widget Fan Boutique est plus puissant (LLM + filtres typés) mais plus lent
   * (~500-800 ms par requête). L'autocomplete natif PrestaShop est instantané mais
   * fait juste du keyword matching basique.
   *
   * Selon le retour utilisateur, on peut vouloir :
   *  - L'activer toujours (cohérence d'expérience)
   *  - L'activer uniquement sur certaines pages (ex: pas en checkout)
   *  - L'activer seulement si l'input est dans le header desktop, pas dans la barre mobile
   *  - Le désactiver si l'utilisateur a un device très lent (navigator.connection)
   *  - L'activer toujours, mais log un événement analytics
   *
   * @param {HTMLInputElement} input - L'input <input name="s"> ciblé
   * @returns {boolean} true pour activer Fan Boutique, false pour laisser l'input nu (=> form natif au submit)
   */
  function shouldActivateFanBoutique(input) {
    var path = window.location.pathname || '';

    // Désactivation dans le tunnel d'achat : pas de risque d'interférer avec le checkout
    if (/\/(panier|commande|order|cart|checkout)/i.test(path)) {
      return false;
    }

    // Désactivation sur connexion très dégradée : éviter de bloquer l'utilisateur
    var conn = navigator.connection;
    if (conn && (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')) {
      return false;
    }

    // Activé partout ailleurs (home, catégories, fiches produit, page /recherche, etc.)
    return true;
  }

  // Démarrage : on attend le DOM + un délai pour que ps_searchbar ait branché son autocomplete
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(ready, 50);
    });
  } else {
    setTimeout(ready, 50);
  }
})();
