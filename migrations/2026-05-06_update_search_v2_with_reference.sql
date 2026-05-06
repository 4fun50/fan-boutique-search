-- Migration : ajouter le paramètre p_reference à fan_boutique_search_v2
-- Date : 2026-05-06
-- Contexte : permettre la recherche par référence produit (insensible à la casse,
--            avec wildcards pour gérer les préfixes type KL_, FAB_, FA_)
--
-- ⚠️ RETURNS TABLE ne peut pas être modifié avec CREATE OR REPLACE
--    → on DROP puis CREATE. Court downtime possible (< 1 sec).
-- ⚠️ Après le CREATE, restart PostgREST :
--    docker restart supabase-rest-koc4w8ocsgs8kwwsggkwwkkc

DROP FUNCTION IF EXISTS public.fan_boutique_search_v2(text, text[], text[], text[], text, boolean, boolean, boolean, boolean, boolean, boolean, integer, integer, integer, numeric, numeric, boolean, boolean, boolean, boolean, boolean, text[], boolean, boolean, boolean, boolean, integer, integer, numeric, numeric, integer, integer, integer, text[], text, text, integer);

CREATE OR REPLACE FUNCTION public.fan_boutique_search_v2(
    p_type_produit text DEFAULT NULL::text,
    p_style text[] DEFAULT NULL::text[],
    p_couleur_moteur text[] DEFAULT NULL::text[],
    p_couleur_pales text[] DEFAULT NULL::text[],
    p_type_moteur text DEFAULT NULL::text,
    p_silencieux boolean DEFAULT NULL::boolean,
    p_avec_lumiere boolean DEFAULT NULL::boolean,
    p_wifi boolean DEFAULT NULL::boolean,
    p_usage_exterieur boolean DEFAULT NULL::boolean,
    p_destratificateur boolean DEFAULT NULL::boolean,
    p_reversible boolean DEFAULT NULL::boolean,
    p_nombre_pales integer DEFAULT NULL::integer,
    p_diametre_min integer DEFAULT NULL::integer,
    p_diametre_max integer DEFAULT NULL::integer,
    p_prix_min numeric DEFAULT NULL::numeric,
    p_prix_max numeric DEFAULT NULL::numeric,
    p_promo_only boolean DEFAULT NULL::boolean,
    p_avec_telecommande boolean DEFAULT NULL::boolean,
    p_plafond_en_pente boolean DEFAULT NULL::boolean,
    p_commande_vocale boolean DEFAULT NULL::boolean,
    p_app_telephone boolean DEFAULT NULL::boolean,
    p_matiere_pales text[] DEFAULT NULL::text[],
    p_lumiere_dimmable boolean DEFAULT NULL::boolean,
    p_sonde_thermostatique boolean DEFAULT NULL::boolean,
    p_prolongateur_dispo boolean DEFAULT NULL::boolean,
    p_boitier_mural_adaptable boolean DEFAULT NULL::boolean,
    p_distance_plafond_max integer DEFAULT NULL::integer,
    p_garantie_min integer DEFAULT NULL::integer,
    p_score_reparabilite_min numeric DEFAULT NULL::numeric,
    p_hauteur_destrat_min numeric DEFAULT NULL::numeric,
    p_surface_destrat_min integer DEFAULT NULL::integer,
    p_longueur_prolongateur_min integer DEFAULT NULL::integer,
    p_surface_max integer DEFAULT NULL::integer,
    p_pieces text[] DEFAULT NULL::text[],
    p_marque text DEFAULT NULL::text,
    p_sort_column text DEFAULT 'sales_desc'::text,
    p_match_count integer DEFAULT 500,
    p_reference text DEFAULT NULL::text  -- ⭐ NOUVEAU
)
RETURNS TABLE(
    id bigint, prestashop_id integer, nom text,
    reference text,  -- ⭐ NOUVEAU
    prix_ttc numeric, prix_promo numeric, en_stock boolean,
    image_url text, product_url text, description_courte text,
    style text, marque text, gamme text, couleur_moteur text, couleur_pales text,
    type_moteur text, silencieux boolean, diametre_cm integer, nombre_pales integer,
    avec_lumiere boolean, avec_telecommande boolean, wifi boolean, reversible boolean,
    option_destratificateur boolean, garantie text, score_reparabilite numeric,
    type_produit text, pieces text[], surface_max_m2 integer,
    usage_exterieur boolean, indice_protection text, puissance_watts integer, classe_energetique text,
    matiere_pales text, commande_vocale boolean, app_telephone boolean, lumiere_dimmable boolean,
    sonde_thermostatique boolean, prolongateur_dispo boolean, longueur_max_prolongateur text,
    plafond_en_pente boolean, boitier_mural_adaptable boolean, distance_plafond_pales_cm integer,
    surface_min_m2 integer, surface_destrat_m2 integer, hauteur_max_destrat text,
    pales_reversibles_bicolores boolean, kit_lumiere_option boolean, telecommande_adaptable boolean,
    type_source_lumineuse text, sous_type text
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      p.prestashop_id,
      p.nom,
      p.reference,  -- ⭐ NOUVEAU
      p.prix_ttc,
      p.prix_promo,
      p.en_stock,
      p.image_url,
      p.product_url,
      p.description_courte,
      p.style,
      p.marque,
      p.gamme,
      p.couleur_moteur,
      p.couleur_pales,
      p.type_moteur,
      p.silencieux,
      p.diametre_cm,
      p.nombre_pales,
      p.avec_lumiere,
      p.avec_telecommande,
      p.wifi,
      p.reversible,
      p.option_destratificateur,
      p.garantie,
      p.score_reparabilite,
      p.type_produit,
      p.pieces,
      p.surface_max_m2,
      p.usage_exterieur,
      p.indice_protection,
      p.puissance_watts,
      p.classe_energetique,
      p.matiere_pales,
      p.commande_vocale,
      p.app_telephone,
      p.lumiere_dimmable,
      p.sonde_thermostatique,
      p.prolongateur_dispo,
      p.longueur_max_prolongateur,
      p.plafond_en_pente,
      p.boitier_mural_adaptable,
      p.distance_plafond_pales_cm,
      p.surface_min_m2,
      p.surface_destrat_m2,
      p.hauteur_max_destrat,
      p.pales_reversibles_bicolores,
      p.kit_lumiere_option,
      p.telecommande_adaptable,
      p.type_source_lumineuse,
      p.sous_type,
      COALESCE(p.prix_promo, p.prix_ttc) AS effective_price,
      COALESCE(p.stock, 0) AS stock_value,
      COALESCE(p.total_sales, 0) AS total_sales_value
    FROM fan_boutique_products_v2 p
    WHERE
      (p_type_produit IS NULL OR p.type_produit = p_type_produit)
      AND (p_style IS NULL OR cardinality(p_style) = 0 OR p.style = ANY(p_style))
      AND (p_couleur_moteur IS NULL OR cardinality(p_couleur_moteur) = 0 OR p.couleur_moteur = ANY(p_couleur_moteur))
      AND (p_couleur_pales IS NULL OR cardinality(p_couleur_pales) = 0 OR p.couleur_pales = ANY(p_couleur_pales))
      AND (p_type_moteur IS NULL OR p.type_moteur = p_type_moteur)
      AND (p_silencieux IS NULL OR p.silencieux = p_silencieux)
      AND (p_avec_lumiere IS NULL OR p.avec_lumiere = p_avec_lumiere)
      AND (p_wifi IS NULL OR p.wifi = p_wifi)
      AND (p_usage_exterieur IS NULL OR p.usage_exterieur = p_usage_exterieur)
      AND (p_destratificateur IS NULL OR p.option_destratificateur = p_destratificateur)
      AND (p_reversible IS NULL OR p.reversible = p_reversible)
      AND (p_avec_telecommande IS NULL OR p.avec_telecommande = p_avec_telecommande)
      AND (p_plafond_en_pente IS NULL OR p.plafond_en_pente = p_plafond_en_pente)
      AND (p_commande_vocale IS NULL OR p.commande_vocale = p_commande_vocale)
      AND (p_app_telephone IS NULL OR p.app_telephone = p_app_telephone)
      AND (p_lumiere_dimmable IS NULL OR p.lumiere_dimmable = p_lumiere_dimmable)
      AND (p_sonde_thermostatique IS NULL OR p.sonde_thermostatique = p_sonde_thermostatique)
      AND (p_prolongateur_dispo IS NULL OR p.prolongateur_dispo = p_prolongateur_dispo)
      AND (p_boitier_mural_adaptable IS NULL OR p.boitier_mural_adaptable = p_boitier_mural_adaptable)
      AND (p_nombre_pales IS NULL OR p.nombre_pales = p_nombre_pales)
      AND (p_diametre_min IS NULL OR p.diametre_cm >= p_diametre_min)
      AND (p_diametre_max IS NULL OR p.diametre_cm <= p_diametre_max)
      AND (p_prix_min IS NULL OR COALESCE(p.prix_promo, p.prix_ttc) >= p_prix_min)
      AND (p_prix_max IS NULL OR COALESCE(p.prix_promo, p.prix_ttc) <= p_prix_max)
      AND (p_promo_only IS NULL OR NOT p_promo_only OR p.prix_promo IS NOT NULL)
      AND (p_matiere_pales IS NULL OR cardinality(p_matiere_pales) = 0 OR p.matiere_pales = ANY(p_matiere_pales))
      AND (p_distance_plafond_max IS NULL OR p.distance_plafond_pales_cm <= p_distance_plafond_max)
      AND (p_garantie_min IS NULL OR NULLIF(regexp_replace(COALESCE(p.garantie, ''), '[^0-9]', '', 'g'), '')::integer >= p_garantie_min)
      AND (p_score_reparabilite_min IS NULL OR p.score_reparabilite >= p_score_reparabilite_min)
      AND (p_hauteur_destrat_min IS NULL OR NULLIF(regexp_replace(COALESCE(p.hauteur_max_destrat, ''), '[^0-9]', '', 'g'), '')::numeric >= p_hauteur_destrat_min)
      AND (p_surface_destrat_min IS NULL OR p.surface_destrat_m2 >= p_surface_destrat_min)
      AND (p_longueur_prolongateur_min IS NULL OR NULLIF(regexp_replace(COALESCE(p.longueur_max_prolongateur, ''), '[^0-9]', '', 'g'), '')::integer >= p_longueur_prolongateur_min)
      AND (p_surface_max IS NULL OR p.surface_max_m2 >= p_surface_max)
      AND (p_pieces IS NULL OR cardinality(p_pieces) = 0 OR p.pieces && p_pieces)
      AND (p_marque IS NULL OR p.marque ILIKE '%' || p_marque || '%')
      -- ⭐ NOUVEAU : recherche par référence (insensible casse, contains via trigram)
      AND (p_reference IS NULL OR LOWER(p.reference) LIKE '%' || LOWER(p_reference) || '%')
  )
  SELECT
    b.id, b.prestashop_id, b.nom,
    b.reference,  -- ⭐ NOUVEAU
    b.prix_ttc, b.prix_promo, b.en_stock,
    b.image_url, b.product_url, b.description_courte,
    b.style, b.marque, b.gamme, b.couleur_moteur, b.couleur_pales,
    b.type_moteur, b.silencieux, b.diametre_cm, b.nombre_pales,
    b.avec_lumiere, b.avec_telecommande, b.wifi, b.reversible,
    b.option_destratificateur, b.garantie, b.score_reparabilite,
    b.type_produit, b.pieces, b.surface_max_m2,
    b.usage_exterieur, b.indice_protection, b.puissance_watts, b.classe_energetique,
    b.matiere_pales, b.commande_vocale, b.app_telephone, b.lumiere_dimmable,
    b.sonde_thermostatique, b.prolongateur_dispo, b.longueur_max_prolongateur,
    b.plafond_en_pente, b.boitier_mural_adaptable, b.distance_plafond_pales_cm,
    b.surface_min_m2, b.surface_destrat_m2, b.hauteur_max_destrat,
    b.pales_reversibles_bicolores, b.kit_lumiere_option, b.telecommande_adaptable,
    b.type_source_lumineuse, b.sous_type
  FROM base b
  ORDER BY
    CASE WHEN b.stock_value > 0 THEN 0 ELSE 1 END,
    CASE WHEN p_sort_column = 'price_asc' THEN b.effective_price END ASC NULLS LAST,
    CASE WHEN p_sort_column = 'price_desc' THEN b.effective_price END DESC NULLS LAST,
    CASE WHEN p_sort_column = 'sales_desc' THEN b.total_sales_value END DESC NULLS LAST,
    b.effective_price ASC NULLS LAST
  LIMIT p_match_count;
END;
$function$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
