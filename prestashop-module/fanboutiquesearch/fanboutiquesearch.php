<?php
/**
 * Fan Boutique Search — Module PrestaShop
 *
 * Remplace l'autocomplete natif de la barre de recherche par le moteur sémantique
 * Fan Boutique (LLM + filtres structurés via Supabase).
 *
 * Hook : displayHeader (injection sur toutes les pages front)
 * Stratégie : hijack — l'input natif PrestaShop est conservé, seul son comportement change.
 */

if (!defined('_PS_VERSION_')) {
    exit;
}

class FanBoutiqueSearch extends Module
{
    const CONFIG_ENABLED = 'FBS_ENABLED';
    const CONFIG_WIDGET_BASE = 'FBS_WIDGET_BASE';
    const CONFIG_MIN_CHARS = 'FBS_MIN_CHARS';
    const CONFIG_DEBOUNCE = 'FBS_DEBOUNCE';

    const DEFAULT_WIDGET_BASE = 'https://fan-boutique-search-engine.netlify.app';

    public function __construct()
    {
        $this->name = 'fanboutiquesearch';
        $this->tab = 'front_office_features';
        $this->version = '1.0.4';
        $this->author = 'Semzen';
        $this->need_instance = 0;
        $this->ps_versions_compliancy = ['min' => '1.7.0.0', 'max' => _PS_VERSION_];
        $this->bootstrap = true;

        parent::__construct();

        $this->displayName = $this->l('Fan Boutique — Recherche IA');
        $this->description = $this->l('Remplace l\'autocomplete natif par le moteur de recherche sémantique Fan Boutique (LLM + filtres typés).');
        $this->confirmUninstall = $this->l('Êtes-vous sûr de vouloir désinstaller le moteur Fan Boutique ?');
    }

    public function install()
    {
        return parent::install()
            && $this->registerHook('displayHeader')
            && Configuration::updateValue(self::CONFIG_ENABLED, '1')
            && Configuration::updateValue(self::CONFIG_WIDGET_BASE, self::DEFAULT_WIDGET_BASE)
            && Configuration::updateValue(self::CONFIG_MIN_CHARS, '3')
            && Configuration::updateValue(self::CONFIG_DEBOUNCE, '500');
    }

    public function uninstall()
    {
        return Configuration::deleteByName(self::CONFIG_ENABLED)
            && Configuration::deleteByName(self::CONFIG_WIDGET_BASE)
            && Configuration::deleteByName(self::CONFIG_MIN_CHARS)
            && Configuration::deleteByName(self::CONFIG_DEBOUNCE)
            && parent::uninstall();
    }

    public function hookDisplayHeader()
    {
        if (Configuration::get(self::CONFIG_ENABLED) !== '1') {
            return '';
        }

        $widgetBase = rtrim(
            (string) Configuration::get(self::CONFIG_WIDGET_BASE) ?: self::DEFAULT_WIDGET_BASE,
            '/'
        );

        // Charger le widget depuis Netlify (CDN)
        $this->context->controller->registerStylesheet(
            'fbs-widget-css',
            $widgetBase . '/fb-search-widget.css',
            ['server' => 'remote', 'priority' => 200]
        );
        $this->context->controller->registerJavascript(
            'fbs-widget-js',
            $widgetBase . '/fan-boutique-search-widget.js',
            ['server' => 'remote', 'priority' => 200, 'attributes' => 'defer']
        );

        // Charger le hijack local (après le widget)
        $this->context->controller->registerJavascript(
            'fbs-hijack',
            'modules/' . $this->name . '/views/js/hijack.js',
            ['priority' => 210]
        );

        // Charger les overrides CSS locaux
        $this->context->controller->registerStylesheet(
            'fbs-overrides',
            'modules/' . $this->name . '/views/css/overrides.css',
            ['priority' => 220]
        );

        // Passer la config au front
        Media::addJsDef([
            'fbsConfig' => [
                'webhookUrl' => $widgetBase . '/.netlify/functions/search',
                'minChars' => (int) Configuration::get(self::CONFIG_MIN_CHARS) ?: 3,
                'debounceDelay' => (int) Configuration::get(self::CONFIG_DEBOUNCE) ?: 500,
            ],
        ]);

        return '';
    }

    /**
     * Page de configuration dans le BO PrestaShop.
     */
    public function getContent()
    {
        $output = '';

        if (Tools::isSubmit('submitFbsConfig')) {
            $widgetBase = trim((string) Tools::getValue(self::CONFIG_WIDGET_BASE));
            $widgetBaseValid = $widgetBase === ''
                || (filter_var($widgetBase, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $widgetBase));

            if (!$widgetBaseValid) {
                $output .= $this->displayError($this->l('URL du widget invalide (doit commencer par http:// ou https://).'));
            } else {
                Configuration::updateValue(self::CONFIG_ENABLED, (bool) Tools::getValue(self::CONFIG_ENABLED) ? '1' : '0');
                Configuration::updateValue(self::CONFIG_WIDGET_BASE, $widgetBase);
                Configuration::updateValue(self::CONFIG_MIN_CHARS, max(1, min(20, (int) Tools::getValue(self::CONFIG_MIN_CHARS))));
                Configuration::updateValue(self::CONFIG_DEBOUNCE, max(0, min(5000, (int) Tools::getValue(self::CONFIG_DEBOUNCE))));
                $output .= $this->displayConfirmation($this->l('Configuration enregistrée.'));
            }
        }

        return $output . $this->renderForm();
    }

    protected function renderForm()
    {
        $helper = new HelperForm();
        $helper->module = $this;
        $helper->name_controller = $this->name;
        $helper->token = Tools::getAdminTokenLite('AdminModules');
        $helper->currentIndex = AdminController::$currentIndex . '&configure=' . $this->name;
        $helper->submit_action = 'submitFbsConfig';
        $helper->title = $this->displayName;
        $helper->show_toolbar = false;
        $helper->fields_value = [
            self::CONFIG_ENABLED => (int) Configuration::get(self::CONFIG_ENABLED),
            self::CONFIG_WIDGET_BASE => Configuration::get(self::CONFIG_WIDGET_BASE) ?: self::DEFAULT_WIDGET_BASE,
            self::CONFIG_MIN_CHARS => (int) Configuration::get(self::CONFIG_MIN_CHARS) ?: 3,
            self::CONFIG_DEBOUNCE => (int) Configuration::get(self::CONFIG_DEBOUNCE) ?: 500,
        ];

        $form = [
            'form' => [
                'legend' => ['title' => $this->l('Paramètres'), 'icon' => 'icon-cogs'],
                'input' => [
                    [
                        'type' => 'switch',
                        'label' => $this->l('Activer le widget'),
                        'name' => self::CONFIG_ENABLED,
                        'is_bool' => true,
                        'values' => [
                            ['id' => 'on', 'value' => 1, 'label' => $this->l('Oui')],
                            ['id' => 'off', 'value' => 0, 'label' => $this->l('Non')],
                        ],
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('URL de base du widget (Netlify)'),
                        'name' => self::CONFIG_WIDGET_BASE,
                        'desc' => $this->l('Ex: https://fan-boutique-search-engine.netlify.app'),
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('Nombre minimum de caractères'),
                        'name' => self::CONFIG_MIN_CHARS,
                        'desc' => $this->l('Active le widget Fan Boutique à partir de N caractères tapés.'),
                    ],
                    [
                        'type' => 'text',
                        'label' => $this->l('Délai debounce (ms)'),
                        'name' => self::CONFIG_DEBOUNCE,
                        'desc' => $this->l('Temps d\'attente après la frappe avant de lancer la recherche.'),
                    ],
                ],
                'submit' => ['title' => $this->l('Enregistrer')],
            ],
        ];

        return $helper->generateForm([$form]);
    }
}
