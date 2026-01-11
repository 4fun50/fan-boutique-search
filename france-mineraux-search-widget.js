/**
 * France Minéraux Search Widget
 * Widget de recherche vectorielle intégrable facilement
 * Version: 1.0.0
 */

(function () {
  "use strict";

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    webhookUrl:
      "https://france-mineraux-search.netlify.app/.netlify/functions/search",
    minChars: 4,
    debounceDelay: 800,
    maxResults: 400,
    initialResults: 100,
    loadMoreStep: 50,
    placeholder: "Décrivez ce que vous recherchez en langage naturel...",
    theme: "light", // 'light' ou 'dark'
    chipMode: "always", // 'always' | 'auto' | 'never'
    placeholderExamples: [
      "Bracelets pour le stress et la fatigue",
      "Collier vert",
      "Pendentifs en améthyste",
      "Bague à moins de 30€",
      "Boucles d'oreilles les mieux notées",
    ],
    placeholderRotationDelay: 3000, // 3 secondes
  };

  class FranceMinerauxSearchWidget {
    constructor(inputSelector, config = {}) {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.inputElement = document.querySelector(inputSelector);

      if (!this.inputElement) {
        console.error(
          `France Minéraux Search Widget: Element "${inputSelector}" not found`
        );
        return;
      }

      this.searchTimeout = null;
      this.resultsContainer = null;
      this.inlineSpinner = null;
      this.clearButton = null;
      this.queryChip = null;
      this.inputRevision = 0;
      this.inFlightInputRevision = -1;
      this.suppressAutoChipWhileEditing = false;
      this.useChipMode = (() => {
        const mode = this.config.chipMode;
        if (mode === "always") return true;
        if (mode === "never") return false;
        return (
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 768px)").matches
        );
      })();
      this.abortController = null;
      this.requestSeq = 0;
      this.lastQueryNormalized = "";
      this.inFlightQueryNormalized = "";
      this.pendingQueryNormalized = "";
      this.lastResults = [];
      this.visibleResultsCount = 0;
      this.isInitialized = false;
      this.placeholderInterval = null;
      this.currentPlaceholderIndex = 0;
      this.typingInterval = null;
      this.currentTypingText = "";
      this.typingCharIndex = 0;
      this.isDeleting = false;
      this.currentQuery = "";
      this.historyKey = "fm_search_history";
      this.maxHistoryItems = 3;

      this.init();
    }

    init() {
      if (this.isInitialized) return;

      // Créer le conteneur de résultats
      this.createResultsContainer();

      // Ajouter les événements
      this.attachEvents();

      // Démarrer le placeholder rotatif
      this.startPlaceholderRotation();

      // Marquer comme initialisé
      this.isInitialized = true;
    }

    createResultsContainer() {
      // Créer le conteneur de résultats
      this.resultsContainer = document.createElement("div");
      this.resultsContainer.className = "fm-search-results";
      this.resultsContainer.setAttribute("data-theme", this.config.theme);

      // Positionner le conteneur par rapport à l'input
      const inputParent = this.inputElement.parentElement;
      inputParent.style.position = "relative";
      inputParent.style.overflow = "visible";
      inputParent.setAttribute("data-fm-theme", this.config.theme);
      inputParent.setAttribute("data-fm-chip", this.useChipMode ? "1" : "0");
      inputParent.appendChild(this.resultsContainer);

      this.inputElement.classList.add("fm-search-input");
      this.createInlineSpinner(inputParent);
      if (this.useChipMode) {
        this.createQueryChip(inputParent);
      } else {
        this.createClearButton(inputParent);
      }
    }

    createInlineSpinner(inputParent) {
      if (this.inlineSpinner) return;

      this.inlineSpinner = document.createElement("div");
      this.inlineSpinner.className = "fm-input-spinner";
      this.inlineSpinner.innerHTML = `<div class="fm-input-spinner-circle"></div>`;

      inputParent.appendChild(this.inlineSpinner);
    }

    createQueryChip(inputParent) {
      if (this.queryChip) return;

      this.queryChip = document.createElement("div");
      this.queryChip.className = "fm-query-chip";
      this.queryChip.setAttribute("aria-hidden", "true");
      this.queryChip.innerHTML = `
        <span class="fm-query-chip-text"></span>
        <button type="button" class="fm-query-chip-clear" aria-label="Effacer la recherche">
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 3c-4.963 0-9 4.038-9 9s4.037 9 9 9s9-4.038 9-9s-4.037-9-9-9m0 16c-3.859 0-7-3.14-7-7s3.141-7 7-7s7 3.14 7 7s-3.141 7-7 7m.707-7l2.646-2.646a.5.5 0 0 0 0-.707a.5.5 0 0 0-.707 0L12 11.293L9.354 8.646a.5.5 0 0 0-.707.707L11.293 12l-2.646 2.646a.5.5 0 0 0 .707.708L12 12.707l2.646 2.646a.5.5 0 1 0 .708-.706z"/>
          </svg>
        </button>
      `;

      const clearBtn = this.queryChip.querySelector(".fm-query-chip-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.inputElement.value = "";
          this.currentQuery = "";
          this.lastQueryNormalized = "";
          this.pendingQueryNormalized = "";
          this.cancelInFlight();
          this.hideQueryChip();
          this.hideResults();
          this.startPlaceholderRotation();
          try {
            this.inputElement.focus();
          } catch {
            // ignore
          }
        });
      }

      // Tap/clic sur la pastille = permettre l'édition (on cache la pastille et focus input)
      this.queryChip.addEventListener("click", (e) => {
        if (
          e.target &&
          e.target.closest &&
          e.target.closest(".fm-query-chip-clear")
        ) {
          return;
        }
        this.hideQueryChip();
        try {
          this.inputElement.focus();
          this.focusInputAtEnd();
        } catch {
          // ignore
        }
      });

      inputParent.appendChild(this.queryChip);
      this.hideQueryChip();
    }

    focusInputAtEnd() {
      if (!this.inputElement) return;
      try {
        const len = this.inputElement.value
          ? this.inputElement.value.length
          : 0;
        if (typeof this.inputElement.setSelectionRange === "function") {
          this.inputElement.setSelectionRange(len, len);
        }
      } catch {
        // ignore (certains navigateurs mobiles peuvent refuser selon l'état)
      }
    }

    createClearButton(inputParent) {
      if (this.clearButton) return;

      this.clearButton = document.createElement("button");
      this.clearButton.type = "button";
      this.clearButton.className = "fm-input-clear";
      this.clearButton.setAttribute("aria-label", "Effacer la recherche");
      this.clearButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M12 3c-4.963 0-9 4.038-9 9s4.037 9 9 9s9-4.038 9-9s-4.037-9-9-9m0 16c-3.859 0-7-3.14-7-7s3.141-7 7-7s7 3.14 7 7s-3.141 7-7 7m.707-7l2.646-2.646a.5.5 0 0 0 0-.707a.5.5 0 0 0-.707 0L12 11.293L9.354 8.646a.5.5 0 0 0-.707.707L11.293 12l-2.646 2.646a.5.5 0 0 0 .707.708L12 12.707l2.646 2.646a.5.5 0 1 0 .708-.706z"/>
        </svg>
      `;

      this.clearButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.inputElement.value = "";
        this.currentQuery = "";
        this.lastQueryNormalized = "";
        this.pendingQueryNormalized = "";
        this.cancelInFlight();
        this.hideResults();
        this.updateClearButtonVisibility();
        this.startPlaceholderRotation();
        try {
          this.inputElement.focus();
        } catch {
          // ignore
        }
      });

      inputParent.appendChild(this.clearButton);
      this.updateClearButtonVisibility();
    }

    setInlineLoading(isLoading) {
      if (!this.inlineSpinner) return;
      this.inlineSpinner.classList.toggle("fm-active", Boolean(isLoading));
      if (this.clearButton) {
        this.clearButton.classList.toggle("fm-hidden", Boolean(isLoading));
        if (!isLoading) {
          this.updateClearButtonVisibility();
        }
      }
    }

    updateQueryChip(text) {
      if (!this.queryChip) return;
      const label =
        typeof text === "string" && text.trim()
          ? text.trim()
          : this.inputElement?.value?.trim() || "";
      const textEl = this.queryChip.querySelector(".fm-query-chip-text");
      if (textEl) textEl.textContent = label;
    }

    showQueryChip(text) {
      if (!this.useChipMode || !this.queryChip) return;
      this.updateQueryChip(text);
      this.queryChip.classList.add("fm-active");
      this.inputElement.classList.add("fm-chip-active");
    }

    blurInputForChip() {
      if (!this.useChipMode || !this.inputElement) return;
      if (typeof document === "undefined") return;
      if (document.activeElement !== this.inputElement) return;
      try {
        this.inputElement.blur();
      } catch {
        // ignore
      }
    }

    maybeShowChipAfterResults() {
      if (!this.useChipMode || !this.queryChip || !this.inputElement) return;
      if (typeof document === "undefined") return;

      // Si l'utilisateur a retapé depuis le lancement de la recherche, ne pas interrompre son édition.
      // (dans ce cas, on ne blur pas et on ne remet pas le chip)
      if (document.activeElement === this.inputElement) {
        if (
          this.inFlightInputRevision !== -1 &&
          this.inputRevision !== this.inFlightInputRevision
        ) {
          return;
        }
      }

      // Si l'input est encore focus au retour des résultats et que l'utilisateur n'a pas retapé,
      // on peut blur pour afficher le chip.
      this.blurInputForChip();
      this.forceShowChipNow(this.inputElement.value);
      this.suppressAutoChipWhileEditing = false;
    }

    forceShowChipNow(text) {
      if (!this.useChipMode || !this.queryChip || !this.inputElement) return;
      const label =
        typeof text === "string" && text.trim()
          ? text.trim()
          : this.inputElement.value?.trim() || "";
      if (!label || label.length < this.config.minChars) return;
      this.updateQueryChip(label);
      this.queryChip.classList.add("fm-active");
      this.inputElement.classList.add("fm-chip-active");
    }

    hideQueryChip() {
      if (!this.queryChip) return;
      this.queryChip.classList.remove("fm-active");
      this.inputElement.classList.remove("fm-chip-active");
    }

    syncChipVisibility() {
      if (!this.useChipMode) return;
      if (
        typeof document !== "undefined" &&
        document.activeElement === this.inputElement
      ) {
        this.hideQueryChip();
        return;
      }
      const isResultsActive =
        this.resultsContainer &&
        this.resultsContainer.classList.contains("fm-active") &&
        this.inputElement &&
        this.inputElement.value &&
        this.inputElement.value.trim().length >= this.config.minChars;

      if (isResultsActive) {
        this.showQueryChip(this.inputElement.value);
      } else {
        this.hideQueryChip();
      }
    }

    updateClearButtonVisibility() {
      if (!this.clearButton || !this.inputElement) return;
      const hasValue = Boolean(
        this.inputElement.value && this.inputElement.value.trim()
      );
      this.clearButton.classList.toggle("fm-active", hasValue);
    }

    setWideMode(isWide) {
      if (!this.resultsContainer) return;

      const isActive = this.resultsContainer.classList.contains("fm-active");
      if (isActive) {
        this.resultsContainer.classList.add("fm-no-transition");
      }

      this.resultsContainer.classList.toggle("fm-wide", Boolean(isWide));

      if (isActive) {
        void this.resultsContainer.offsetHeight;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
        raf(() => {
          if (this.resultsContainer) {
            this.resultsContainer.classList.remove("fm-no-transition");
          }
        });
      }
    }

    startPlaceholderRotation() {
      if (
        !this.config.placeholderExamples ||
        this.config.placeholderExamples.length === 0
      ) {
        return;
      }

      // Démarrer l'effet de typing
      this.currentTypingText =
        this.config.placeholderExamples[this.currentPlaceholderIndex];
      this.typingCharIndex = 0;
      this.isDeleting = false;
      this.inputElement.placeholder = "";

      this.typePlaceholder();
    }

    typePlaceholder() {
      const currentExample =
        this.config.placeholderExamples[this.currentPlaceholderIndex];

      if (!this.isDeleting) {
        // Mode écriture
        if (this.typingCharIndex < currentExample.length) {
          this.inputElement.placeholder = currentExample.substring(
            0,
            this.typingCharIndex + 1
          );
          this.typingCharIndex++;
          this.typingInterval = setTimeout(() => this.typePlaceholder(), 80);
        } else {
          // Pause avant de commencer à effacer
          this.typingInterval = setTimeout(() => {
            this.isDeleting = true;
            this.typePlaceholder();
          }, 2000);
        }
      } else {
        // Mode effacement
        if (this.typingCharIndex > 0) {
          this.typingCharIndex--;
          this.inputElement.placeholder = currentExample.substring(
            0,
            this.typingCharIndex
          );
          this.typingInterval = setTimeout(() => this.typePlaceholder(), 30);
        } else {
          // Passer au placeholder suivant
          this.isDeleting = false;
          this.currentPlaceholderIndex =
            (this.currentPlaceholderIndex + 1) %
            this.config.placeholderExamples.length;
          this.typingInterval = setTimeout(() => this.typePlaceholder(), 500);
        }
      }
    }

    stopPlaceholderRotation() {
      if (this.typingInterval) {
        clearTimeout(this.typingInterval);
        this.typingInterval = null;
      }
    }

    attachEvents() {
      // Événement input avec debounce
      this.inputElement.addEventListener("input", (e) => {
        this.inputRevision++;
        const value = e.target.value;

        // Arrêter la rotation si l'utilisateur tape
        if (value.length > 0) {
          this.stopPlaceholderRotation();
        } else {
          // Redémarrer la rotation si l'input est vide
          this.startPlaceholderRotation();
        }

        this.handleInput(value);
        if (this.useChipMode) {
          this.hideQueryChip();
        } else {
          this.updateClearButtonVisibility();
        }
      });

      // Événement focus
      this.inputElement.addEventListener("focus", (e) => {
        if (this.useChipMode) {
          this.hideQueryChip();
          this.focusInputAtEnd();

          // Si les résultats sont déjà ouverts, on considère que l'utilisateur est en mode édition
          // et on ne devra pas ré-afficher le chip automatiquement tant qu'il garde le focus.
          if (
            this.resultsContainer &&
            this.resultsContainer.classList.contains("fm-active")
          ) {
            this.suppressAutoChipWhileEditing = true;
          }
        }
        const raw = e.target.value;
        const normalized = this.normalizeQuery(raw);
        if (
          normalized.length >= this.config.minChars &&
          normalized === this.lastQueryNormalized
        ) {
          // Ré-ouvrir les résultats existants sans relancer une requête
          if (this.resultsContainer && this.resultsContainer.innerHTML.trim()) {
            this.resultsContainer.classList.add("fm-active");
          }
        } else if (!normalized) {
          // Afficher l'historique si l'input est vide
          this.showSearchHistory();
        }
      });

      this.inputElement.addEventListener("blur", () => {
        if (!this.useChipMode) return;
        setTimeout(() => {
          this.suppressAutoChipWhileEditing = false;
          this.syncChipVisibility();
        }, 0);
      });

      // Fermer les résultats en cliquant à l'extérieur
      document.addEventListener("click", (e) => {
        if (
          !this.inputElement.contains(e.target) &&
          !this.resultsContainer.contains(e.target)
        ) {
          this.hideResults();
        }
      });

      // Empêcher la soumission du formulaire sur Enter
      this.inputElement.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
        }
      });

      // Accordéon "infos" par produit (délégation)
      if (this.resultsContainer) {
        const blurOnResultsInteraction = () => {
          if (!this.inputElement) return;
          if (document.activeElement !== this.inputElement) return;
          if (
            window.matchMedia &&
            window.matchMedia("(max-width: 1023px)").matches
          ) {
            this.inputElement.blur();
          }
        };

        this.resultsContainer.addEventListener(
          "touchstart",
          blurOnResultsInteraction,
          { passive: true }
        );
        this.resultsContainer.addEventListener(
          "pointerdown",
          blurOnResultsInteraction,
          { passive: true }
        );

        this.resultsContainer.addEventListener("click", (e) => {
          const toggle = e.target.closest(".fm-product-accordion-toggle");
          if (!toggle) {
            if (e.target.closest(".fm-product-accordion")) {
              e.preventDefault();
              e.stopPropagation();
            }
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          const accordion = toggle.closest(".fm-product-accordion");
          const panel = accordion?.querySelector(".fm-product-accordion-panel");
          if (!accordion || !panel) return;

          const isExpanded = accordion.classList.toggle(
            "fm-product-accordion--open"
          );
          toggle.setAttribute("aria-expanded", String(isExpanded));
          panel.hidden = !isExpanded;
        });

        this.resultsContainer.addEventListener("keydown", (e) => {
          const toggle = e.target.closest(".fm-product-accordion-toggle");
          if (!toggle) return;
          if (e.key !== "Enter" && e.key !== " ") return;

          e.preventDefault();
          e.stopPropagation();
          toggle.click();
        });
      }
    }

    handleInput(value) {
      const raw = typeof value === "string" ? value : "";
      const normalized = this.normalizeQuery(raw);

      // Si la requête normalisée n'a pas changé, ne pas réinitialiser le debounce.
      // (évite de relancer / décaler une recherche juste parce que l'utilisateur ajoute un espace)
      if (normalized === this.pendingQueryNormalized) {
        return;
      }

      clearTimeout(this.searchTimeout);
      this.pendingQueryNormalized = "";

      if (normalized.length < this.config.minChars) {
        this.cancelInFlight();
        this.hideResults();
        return;
      }

      // Éviter les requêtes identiques si on a déjà des résultats en cache.
      if (
        normalized === this.lastQueryNormalized &&
        this.lastResults.length > 0
      ) {
        if (this.resultsContainer)
          this.resultsContainer.classList.add("fm-active");
        return;
      }

      // Éviter de spammer si une requête identique est déjà en cours.
      if (normalized === this.inFlightQueryNormalized) {
        return;
      }

      this.pendingQueryNormalized = normalized;
      this.searchTimeout = setTimeout(() => {
        if (this.pendingQueryNormalized === normalized) {
          this.pendingQueryNormalized = "";
        }
        this.performSearch(raw);
      }, this.config.debounceDelay);
    }

    cancelInFlight() {
      // Invalide toute requête en cours et empêche son finally/catch de modifier l'UI
      this.requestSeq++;
      this.inFlightQueryNormalized = "";

      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch {
          // ignore
        }
      }

      this.abortController = null;
    }

    normalizeQuery(query) {
      if (typeof query !== "string") return "";
      return query.trim().replace(/\s+/g, " ");
    }

    async performSearch(query) {
      const normalized = this.normalizeQuery(query);
      if (!normalized || normalized.length < this.config.minChars) {
        this.hideResults();
        return;
      }

      this.currentQuery = query.trim();
      this.pendingQueryNormalized = "";

      // Si on a déjà la même requête en cache, ne pas relancer.
      if (
        normalized === this.lastQueryNormalized &&
        this.lastResults.length > 0
      ) {
        if (this.resultsContainer)
          this.resultsContainer.classList.add("fm-active");
        this.forceShowChipNow(query);
        this.suppressAutoChipWhileEditing = false;
        return;
      }

      // Annuler la requête précédente si elle est encore en cours
      if (this.abortController) {
        try {
          this.abortController.abort();
        } catch {
          // ignore
        }
      }

      this.abortController = new AbortController();
      const controller = this.abortController;
      const seq = ++this.requestSeq;
      this.inFlightQueryNormalized = normalized;
      this.inFlightInputRevision = this.inputRevision;

      this.resetResultsScroll();
      this.showLoading();

      try {
        const timeoutId = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // ignore
          }
        }, 30000); // 30 secondes

        const response = await fetch(this.config.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: normalized }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Toujours parser le JSON, même si response.ok est false
        let data;
        try {
          data = await response.json();
        } catch (e) {
          console.error("Failed to parse JSON:", e);
          throw new Error("Erreur de recherche");
        }

        // Normaliser les données : N8n renvoie souvent un tableau [ { ... } ]
        const payload = Array.isArray(data) && data.length > 0 ? data[0] : data;

        // Ignorer les réponses qui ne sont plus les plus récentes
        if (seq !== this.requestSeq) {
          return;
        }

        // Vérifier si c'est une erreur de rate limit (plusieurs formats possibles)
        const rateLimitHeader = response.headers.get("X-Rate-Limit-Exceeded");
        const isRateLimitError =
          rateLimitHeader === "true" ||
          response.status === 429 ||
          payload.error === "Rate limit exceeded" ||
          payload.limite_depassee === true ||
          (payload.error && payload.error.includes("Rate limit")) ||
          (payload.error && payload.error.includes("rate limit")) ||
          (payload.message &&
            payload.message.toLowerCase().includes("limite")) ||
          (payload.message && payload.message === "Error in workflow");

        if (isRateLimitError) {
          this.showRateLimitError(payload, query);
          return;
        }

        if (!response.ok) {
          console.error("Response not OK, status:", response.status);
          const errorText = (() => {
            if (payload && typeof payload === "object") {
              if (
                typeof payload.message === "string" &&
                payload.message.trim()
              ) {
                return payload.message;
              }
              if (typeof payload.error === "string" && payload.error.trim()) {
                return payload.error;
              }
            }
            return "Erreur lors de la recherche";
          })();
          this.showError(errorText);
          return;
        }

        this.lastQueryNormalized = normalized;
        this.inFlightQueryNormalized = "";
        this.displayResults(payload);
      } catch (error) {
        // Ignorer un abort si une nouvelle requête a été lancée
        if (seq !== this.requestSeq) {
          return;
        }
        if (error.name === "AbortError") {
          console.error("Search timeout: La recherche a pris trop de temps");
          this.showError(
            "La recherche prend trop de temps. Veuillez réessayer."
          );
        } else {
          console.error("Search error:", error);
          this.showError();
        }
      } finally {
        if (seq === this.requestSeq) {
          this.inFlightQueryNormalized = "";
          this.setInlineLoading(false);
          this.inFlightInputRevision = -1;
        }
      }
    }

    showLoading() {
      this.resetResultsScroll();
      if (!this.resultsContainer) return;

      this.setWideMode(false);

      // Afficher un petit état de chargement dans le panneau des résultats
      // (évite le chevauchement avec la loupe/icone du site dans l'input)
      this.resultsContainer.innerHTML = `
        <div class="fm-search-loading fm-search-loading--compact">
          <div class="fm-search-spinner"></div>
          <div>Nous préparons une sélection sur mesure…</div>
        </div>
      `;
      this.resultsContainer.classList.add("fm-active");

      // Ne pas utiliser le spinner inline (peut être superposé à l'UI du site)
      this.setInlineLoading(false);
    }

    resetResultsScroll() {
      if (!this.resultsContainer) return;
      this.resultsContainer.scrollTop = 0;
    }

    getProductHTML(product) {
      const productName = product.titre || product.nom || product.name || "";

      const escapeHTML = (value) => {
        return `${value ?? ""}`
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      };

      let descriptionHTML = "";
      if (product.details && product.details.vertus) {
        descriptionHTML += `<div class="fm-product-attribute">Vertus: ${product.details.vertus}</div>`;
      }
      if (product.details && product.details.signes) {
        descriptionHTML += `<div class="fm-product-attribute">Signe astro: ${product.details.signes}</div>`;
      }

      const detailsVertus = product.details?.vertus;
      const detailsSignes = product.details?.signes;
      const detailsStone = product.details?.pierre;

      let detailsChakras = product.details?.chakras ?? product.details?.chakra;
      if (
        (detailsChakras === undefined ||
          detailsChakras === null ||
          `${detailsChakras}`.trim() === "") &&
        product.details &&
        typeof product.details === "object"
      ) {
        for (const [key, value] of Object.entries(product.details)) {
          if (!/chakra/i.test(key)) continue;
          if (value === undefined || value === null) continue;
          if (typeof value === "object") continue;
          const str = `${value}`.trim();
          if (!str) continue;
          detailsChakras = str;
          break;
        }
      }

      const detailsRows = [];
      if (detailsVertus) {
        detailsRows.push(
          `<div class="fm-product-detail-row"><span class="fm-product-detail-label">Vertus</span><span class="fm-product-detail-value">${escapeHTML(
            detailsVertus
          )}</span></div>`
        );
      }
      if (detailsSignes) {
        detailsRows.push(
          `<div class="fm-product-detail-row"><span class="fm-product-detail-label">Signe astrologique</span><span class="fm-product-detail-value">${escapeHTML(
            detailsSignes
          )}</span></div>`
        );
      }
      if (detailsChakras) {
        detailsRows.push(
          `<div class="fm-product-detail-row"><span class="fm-product-detail-label">Chakras</span><span class="fm-product-detail-value">${escapeHTML(
            detailsChakras
          )}</span></div>`
        );
      }
      if (detailsStone) {
        detailsRows.push(
          `<div class="fm-product-detail-row"><span class="fm-product-detail-label">Pierre</span><span class="fm-product-detail-value">${escapeHTML(
            detailsStone
          )}</span></div>`
        );
      }

      const accordionHTML =
        detailsRows.length > 0
          ? `
            <div class="fm-product-accordion">
              <div
                class="fm-product-accordion-toggle"
                role="button"
                tabindex="0"
                aria-expanded="false"
              >Voir les détails</div>
              <div class="fm-product-accordion-panel" hidden>
                ${detailsRows.join("")}
              </div>
            </div>
          `
          : "";

      let starsHTML = "";
      const reviewsCountCandidate =
        product.avis ??
        product.nb_avis ??
        product.nbAvis ??
        product.nombre_avis ??
        product.nombreAvis ??
        product.reviews ??
        product.reviewCount ??
        product.reviewsCount ??
        product.review_count ??
        product.reviews_count;

      const rating = Number.parseFloat(product.note);

      let parsedReviews = null;
      if (
        reviewsCountCandidate !== undefined &&
        reviewsCountCandidate !== null &&
        `${reviewsCountCandidate}`.trim() !== ""
      ) {
        const tmp = Number.parseInt(`${reviewsCountCandidate}`, 10);
        if (Number.isFinite(tmp)) parsedReviews = tmp;
      }

      if (parsedReviews === null && product && typeof product === "object") {
        let maxFound = null;
        for (const [key, value] of Object.entries(product)) {
          if (!/(avis|review)/i.test(key)) continue;
          if (value === undefined || value === null) continue;
          if (typeof value === "object") continue;

          const tmp = Number.parseInt(`${value}`, 10);
          if (!Number.isFinite(tmp)) continue;
          if (maxFound === null || tmp > maxFound) maxFound = tmp;
        }
        if (maxFound !== null) parsedReviews = maxFound;
      }

      // Règle d'affichage :
      // - si le nombre d'avis est fourni => avis > 0
      // - sinon => fallback sur note > 0
      let hasReviews = false;
      if (parsedReviews !== null) {
        hasReviews = parsedReviews > 0;
      } else {
        hasReviews = Number.isFinite(rating) && rating > 0;
      }

      if (hasReviews && Number.isFinite(rating) && rating > 0) {
        const clampedRating = Math.max(0, Math.min(5, rating));
        const uid = Math.random().toString(36).slice(2, 10);
        const starPathD =
          "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

        const starsDisplay = Array.from({ length: 5 }, (_, i) => {
          const fraction = Math.max(0, Math.min(1, clampedRating - i));
          const clipWidth = (24 * fraction).toFixed(2);
          const clipId = `fm-star-clip-${uid}-${i}`;

          return `
            <svg class="fm-star" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
              <defs>
                <clipPath id="${clipId}">
                  <rect x="0" y="0" width="${clipWidth}" height="24"></rect>
                </clipPath>
              </defs>
              <g class="fm-star-empty">
                <path d="${starPathD}"></path>
              </g>
              <g class="fm-star-filled" clip-path="url(#${clipId})">
                <path d="${starPathD}"></path>
              </g>
            </svg>
          `;
        }).join("");

        starsHTML = `
          <div class="fm-product-rating">
            <div class="fm-stars">${starsDisplay}</div>
          </div>
        `;
      }

      const parsePrice = (raw) => {
        if (raw === null || raw === undefined) return null;

        if (typeof raw === "number") {
          return Number.isFinite(raw) ? raw : null;
        }

        if (typeof raw === "string") {
          const cleaned = raw.replace(/\s/g, "").replace(/[^\d.,]/g, "");
          if (!cleaned) return null;

          const hasComma = cleaned.includes(",");
          const hasDot = cleaned.includes(".");

          let normalized = cleaned;
          if (hasComma && hasDot) {
            // Si les 2 existent, on garde le dernier comme séparateur décimal
            const lastComma = cleaned.lastIndexOf(",");
            const lastDot = cleaned.lastIndexOf(".");
            if (lastComma > lastDot) {
              // virgule décimale => supprimer les points (milliers)
              normalized = cleaned.replace(/\./g, "").replace(",", ".");
            } else {
              // point décimal => supprimer les virgules (milliers)
              normalized = cleaned.replace(/,/g, "");
            }
          } else if (hasComma) {
            normalized = cleaned.replace(/\./g, "").replace(",", ".");
          } else {
            // que des points ou que des chiffres
            normalized = cleaned.replace(/,/g, "");
          }

          const parsed = Number.parseFloat(normalized);
          return Number.isFinite(parsed) ? parsed : null;
        }

        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const pickFirstFinitePrice = (...candidates) => {
        for (const candidate of candidates) {
          const parsed = parsePrice(candidate);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return null;
      };

      const formatPrice = (raw) => {
        const parsed = typeof raw === "number" ? raw : parsePrice(raw);
        return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
      };

      const originalValue = pickFirstFinitePrice(
        product.prix,
        product.prix_normal,
        product.prixNormal,
        product.price,
        product.original_price,
        product.originalPrice
      );
      const promoValue = pickFirstFinitePrice(
        product.prixPromo,
        product.prix_promo,
        product.promo_price,
        product.promoPrice,
        product.pricePromo
      );

      const hasValidPromo =
        Number.isFinite(originalValue) &&
        Number.isFinite(promoValue) &&
        promoValue > 0 &&
        originalValue > promoValue;

      let discountBadgeImageHTML = "";
      let discountBadgeFooterHTML = "";
      if (hasValidPromo) {
        const percent = Math.round((1 - promoValue / originalValue) * 100);
        if (percent > 0) {
          discountBadgeImageHTML = `<div class="fm-product-discount-badge fm-product-discount-badge--image">-${percent}%</div>`;
          discountBadgeFooterHTML = `<div class="fm-product-discount-badge fm-product-discount-badge--footer">-${percent}%</div>`;
        }
      }

      const price = formatPrice(originalValue);
      const promo = hasValidPromo ? formatPrice(promoValue) : null;

      const priceBlockHTML = (() => {
        if (price && promo) {
          return `<div class="fm-product-prices">
            <span class="fm-product-price fm-product-price--original">${price} €</span>
            <span class="fm-product-price fm-product-price--promo">${promo} €</span>
          </div>`;
        }

        return `<span class="fm-product-price">${
          price ? `${price} €` : ""
        }</span>`;
      })();

      return `
        <a href="${product.url}" class="fm-product-result">
          <div class="fm-product-image-wrapper">
            <img src="${product.image}" alt="${productName}" class="fm-product-image" 
              onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
            ${discountBadgeImageHTML}
          </div>
          <div class="fm-product-info">
            <div class="fm-product-name">${productName}</div>
            <div class="fm-product-description">${descriptionHTML}${accordionHTML}</div>
            <div class="fm-product-footer">
              ${discountBadgeFooterHTML}
              ${starsHTML}
              ${priceBlockHTML}
            </div>
          </div>
        </a>
      `;
    }

    attachProductClickTracking() {
      if (!this.resultsContainer) return;
      const productLinks =
        this.resultsContainer.querySelectorAll(".fm-product-result");
      productLinks.forEach((link) => {
        link.addEventListener("click", () => {
          this.setSearchUsedCookie();
        });
      });
    }

    updateResultsCountDisplay(totalCount) {
      const countEl = this.resultsContainer?.querySelector(
        ".fm-search-results-count"
      );
      if (!countEl) return;

      const shown = this.visibleResultsCount;
      const total = totalCount;
      const label = shown > 1 ? "produits" : "produit";

      if (total > shown) {
        countEl.textContent = `${shown} / ${total} ${label}`;
      } else {
        countEl.textContent = `${shown} ${label}`;
      }
    }

    setSearchUsedCookie() {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie = `fm_search_used=1; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;

      try {
        localStorage.setItem("fm_search_used", "1");
        localStorage.setItem("fm_search_timestamp", Date.now().toString());
      } catch (e) {
        console.warn("localStorage non disponible pour le tracking");
      }
    }

    loadMoreResults() {
      if (!this.resultsContainer) return;
      const wrapper = this.resultsContainer.querySelector(
        ".fm-results-wrapper"
      );
      if (!wrapper) return;

      const prev = this.visibleResultsCount;
      const step = Number(this.config.loadMoreStep) || 50;
      const next = Math.min(prev + step, this.lastResults.length);

      if (next <= prev) return;

      const toAdd = this.lastResults.slice(prev, next);
      wrapper.insertAdjacentHTML(
        "beforeend",
        toAdd.map((p) => this.getProductHTML(p)).join("")
      );

      this.visibleResultsCount = next;
      this.updateResultsCountDisplay(this.lastResults.length);

      const loadMoreBtn = this.resultsContainer.querySelector(".fm-load-more");
      if (loadMoreBtn && this.visibleResultsCount >= this.lastResults.length) {
        const actions = this.resultsContainer.querySelector(
          ".fm-results-actions"
        );
        if (actions) actions.remove();
      }

      this.attachProductClickTracking();
    }

    displayResults(data) {
      // Supporte plusieurs formats:
      // - { results: [...] }
      // - [ { results: [...] } ]
      // - [...] (tableau direct de produits)
      let results = [];
      if (Array.isArray(data)) {
        if (data.length > 0 && data[0] && Array.isArray(data[0].results)) {
          results = data[0].results;
        } else {
          results = data;
        }
      } else if (data && Array.isArray(data.results)) {
        results = data.results;
      }

      if (!Array.isArray(results) || results.length === 0) {
        this.lastResults = [];
        this.visibleResultsCount = 0;
        this.resetResultsScroll();
        this.setWideMode(false);
        this.resultsContainer.innerHTML = `
                    <div class="fm-no-results">
                        <div class="fm-no-results-icon">🥺</div>
                        <div>Nous sommes désolés, aucun produit n’a été trouvé pour votre recherche.</div>
                    </div>
                `;
        this.resultsContainer.classList.add("fm-active");
        this.maybeShowChipAfterResults();
        return;
      }

      const cap = Number(this.config.maxResults) || 0;
      this.lastResults = cap > 0 ? results.slice(0, cap) : results.slice();

      const initial = Math.max(1, Number(this.config.initialResults) || 100);
      this.visibleResultsCount = Math.min(initial, this.lastResults.length);
      const visibleResults = this.lastResults.slice(
        0,
        this.visibleResultsCount
      );

      const resultsHTML = `
                <div class="fm-search-results-header">
                    <div class="fm-search-results-title"><span class="fm-results-title-desktop">Résultats classés par pertinence</span><span class="fm-results-title-mobile">Résultats par pertinence</span></div>
                    <div class="fm-search-results-count">${
                      this.visibleResultsCount
                    } produit${this.visibleResultsCount > 1 ? "s" : ""}</div>
                </div>
                <div class="fm-results-wrapper">
                ${visibleResults.map((p) => this.getProductHTML(p)).join("")}
                </div>
                ${
                  this.lastResults.length > this.visibleResultsCount
                    ? `<div class="fm-results-actions"><button type="button" class="fm-load-more">Voir plus</button></div>`
                    : ""
                }
            `;

      this.resetResultsScroll();
      this.setWideMode(true);
      this.resultsContainer.innerHTML = resultsHTML;
      this.updateResultsCountDisplay(this.lastResults.length);
      const loadMoreBtn = this.resultsContainer.querySelector(".fm-load-more");
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.loadMoreResults();
        });
      }
      this.attachProductClickTracking();
      this.resultsContainer.classList.add("fm-active");
      this.maybeShowChipAfterResults();

      // Sauvegarder dans l'historique si des résultats ont été trouvés
      if (
        this.currentQuery &&
        this.currentQuery.length >= this.config.minChars
      ) {
        this.saveToHistory(this.currentQuery);
      }
    }

    showRateLimitError(data, query) {
      // Extraire les informations du format N8n
      const details = data.details || {};
      const waitTimeFriendly = data.wait_time_friendly || "";
      const raison = data.raison || "";

      // Déterminer le titre selon la raison
      let titleMessage = "";
      if (raison === "Limite par minute dépassée") {
        titleMessage = "Limite de recherche par minute dépassée";
      } else if (raison === "Limite journalière dépassée") {
        titleMessage = "Limite journalière dépassée";
      } else {
        titleMessage = "Limite de recherche dépassée";
      }

      // Utiliser directement le message formaté par le workflow
      const retryMessage = waitTimeFriendly
        ? `Réessayez dans ${waitTimeFriendly}`
        : "";

      this.resultsContainer.innerHTML = `
        <div class="fm-rate-limit-error">
          <div class="fm-rate-limit-icon">⏳</div>
          <div class="fm-rate-limit-title">${titleMessage}</div>
          ${
            retryMessage
              ? `<div class="fm-rate-limit-retry">${retryMessage}</div>`
              : ""
          }
          <div class="fm-rate-limit-alternative">
            <p>Ou utilisez le <strong>moteur de recherche classique</strong> en tapant votre recherche, puis en cliquant sur l'icône <strong>🔍</strong>.</p>
          </div>
        </div>
      `;
      this.resetResultsScroll();
      this.setWideMode(false);
      this.resultsContainer.classList.add("fm-active");
      this.maybeShowChipAfterResults();
    }

    showError(message = "Erreur lors de la recherche") {
      const friendlyNoResults =
        "Nous sommes désolés, aucun produit n’a été trouvé pour votre recherche.";
      const msg = typeof message === "string" ? message : "";
      const isNoItemsMessage = /no item to return was found/i.test(msg);
      const icon = isNoItemsMessage ? "🥺" : "⚠️";
      const finalMessage = isNoItemsMessage ? friendlyNoResults : message;
      this.resetResultsScroll();
      this.setWideMode(false);
      this.resultsContainer.innerHTML = `
                <div class="fm-no-results">
                    <div class="fm-no-results-icon">${icon}</div>
                    <div>${finalMessage}</div>
                </div>
            `;
      this.resultsContainer.classList.add("fm-active");
      this.blurInputForChip();
      this.forceShowChipNow(this.inputElement.value);
    }

    hideResults() {
      this.resultsContainer.classList.remove("fm-active");
      if (!this.inFlightQueryNormalized) {
        this.setInlineLoading(false);
      }
      this.syncChipVisibility();
    }

    getSearchHistory() {
      try {
        const history = localStorage.getItem(this.historyKey);
        return history ? JSON.parse(history) : [];
      } catch (e) {
        return [];
      }
    }

    saveToHistory(query) {
      try {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < this.config.minChars) return;

        let history = this.getSearchHistory();
        const normalized = trimmed.toLowerCase();

        history = history.filter((q) => q.toLowerCase() !== normalized);
        history.unshift(trimmed);
        history = history.slice(0, this.maxHistoryItems);

        localStorage.setItem(this.historyKey, JSON.stringify(history));
      } catch (e) {
        console.warn("Impossible de sauvegarder l'historique");
      }
    }

    clearSearchHistory() {
      try {
        localStorage.removeItem(this.historyKey);
        this.hideResults();
      } catch (e) {}
    }

    showSearchHistory() {
      const history = this.getSearchHistory();
      if (history.length === 0) return;

      const historyHTML = `
        <div class="fm-search-history">
          <div class="fm-search-history-header">
            <span class="fm-search-history-title">Dernières recherches</span>
            <button type="button" class="fm-search-history-clear">Effacer</button>
          </div>
          <div class="fm-search-history-list">
            ${history
              .map(
                (query) => `
              <button type="button" class="fm-search-history-item" data-query="${this.escapeHtml(
                query
              )}">
                <svg class="fm-history-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l2.5 2.5"/>
                  <path fill="currentColor" d="m5.604 5.604l-.53-.53zM4.338 6.871l-.75.003a.75.75 0 0 0 .746.747zm2.542.762a.75.75 0 1 0 .007-1.5zM5.075 4.321a.75.75 0 0 0-1.5.008zM3.75 12a.75.75 0 0 0-1.5 0zm13.125 8.445a.75.75 0 1 0-.75-1.298zm2.272-4.32a.75.75 0 1 0 1.298.75zM5.14 5.07a.75.75 0 1 0 1.056 1.066zm13.722.067c-3.82-3.82-9.993-3.859-13.788-.064l1.06 1.06c3.2-3.199 8.423-3.18 11.668.065zM5.074 5.074L3.808 6.34l1.06 1.06l1.267-1.265zm-.74 2.547l2.546.012l.007-1.5l-2.545-.012zm.754-.754L5.075 4.32l-1.5.008l.013 2.545zM12 3.75A8.25 8.25 0 0 1 20.25 12h1.5A9.75 9.75 0 0 0 12 2.25zm0 16.5A8.25 8.25 0 0 1 3.75 12h-1.5A9.75 9.75 0 0 0 12 21.75zm4.125-1.103A8.2 8.2 0 0 1 12 20.25v1.5c1.775 0 3.44-.475 4.875-1.305zM20.25 12a8.2 8.2 0 0 1-1.103 4.125l1.298.75A9.7 9.7 0 0 0 21.75 12zM6.196 6.137A8.22 8.22 0 0 1 12 3.75v-1.5a9.72 9.72 0 0 0-6.86 2.821z"/>
                </svg>
                <span class="fm-history-text">${this.escapeHtml(query)}</span>
              </button>
            `
              )
              .join("")}
          </div>
        </div>
      `;

      this.resultsContainer.innerHTML = historyHTML;
      this.setWideMode(false);
      this.resultsContainer.classList.add("fm-active");

      const clearBtn = this.resultsContainer.querySelector(
        ".fm-search-history-clear"
      );
      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.clearSearchHistory();
        });
      }

      const historyItems = this.resultsContainer.querySelectorAll(
        ".fm-search-history-item"
      );
      historyItems.forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          const query = item.getAttribute("data-query");
          if (query) {
            this.inputElement.value = query;
            this.updateClearButtonVisibility();
            this.performSearch(query);
          }
        });
      });
    }

    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    destroy() {
      this.stopPlaceholderRotation();

      if (this.resultsContainer) {
        this.resultsContainer.remove();
      }
    }
  }

  // Exposer la classe globalement
  window.FranceMinerauxSearchWidget = FranceMinerauxSearchWidget;
})();
