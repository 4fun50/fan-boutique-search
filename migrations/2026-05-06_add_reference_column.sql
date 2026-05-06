-- Migration : ajouter la colonne `reference` à fan_boutique_products_v2
-- Date : 2026-05-06
-- Contexte : permettre la recherche par référence produit dans le widget
--
-- À exécuter dans Supabase Studio → SQL Editor → New query

-- 1. Ajouter la colonne
ALTER TABLE public.fan_boutique_products_v2
  ADD COLUMN IF NOT EXISTS reference TEXT;

-- 2. Activer l'extension pg_trgm (si pas déjà fait)
-- Permet l'indexation efficace des recherches ILIKE '%xxx%'
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Index GIN trigram sur reference (insensible à la casse)
-- Sans cet index, ILIKE '%query%' fait un full scan = lent sur 3812 lignes.
-- Avec cet index, la recherche reste rapide (< 5 ms) même avec wildcard à gauche.
CREATE INDEX IF NOT EXISTS idx_fan_boutique_products_v2_reference_trgm
  ON public.fan_boutique_products_v2
  USING gin (LOWER(reference) gin_trgm_ops);

-- 4. (optionnel) Vérifier que tout est bon
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'fan_boutique_products_v2' AND column_name = 'reference';

SELECT indexname FROM pg_indexes
WHERE tablename = 'fan_boutique_products_v2' AND indexname LIKE '%reference%';
