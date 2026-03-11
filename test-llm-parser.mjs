/**
 * Test direct du LLM Parser — Fan Boutique Search Engine
 *
 * Appelle GPT-4.1-mini avec le prompt v5 et affiche le JSON retourné.
 * Permet d'itérer sur le prompt sans passer par n8n.
 *
 * Usage :
 *   node test-llm-parser.mjs                          # lance la batterie complète
 *   node test-llm-parser.mjs "ventilateur noir 5 pales"  # teste UNE requête
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Charger la clé API depuis .env ---
const envPath = join(__dirname, ".env");
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^OPENAI_API_KEY=(.+)$/);
    if (match) OPENAI_API_KEY = match[1].trim();
  }
} catch {}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante. Mets-la dans .env");
  process.exit(1);
}

// --- Charger le prompt depuis le fichier ---
const promptPath = join(__dirname, "prompts", "llm-parser-v6-v2db.md");
let systemPrompt;
try {
  const raw = readFileSync(promptPath, "utf-8");
  // Enlever les lignes de commentaire en-tête (# Prompt LLM Parser...)
  systemPrompt = raw.replace(/^#[^\n]*\n/gm, "").trim();
} catch (e) {
  console.error("❌ Impossible de lire le prompt:", e.message);
  process.exit(1);
}

// --- Requêtes de test ---
const TEST_QUERIES = [
  // Couleurs + filtres combinés
  "ventilateur noir 5 pales",
  "ventilateur blanc silencieux avec lumière",
  "ventilateur DC noir moderne",
  // Extérieur / IP
  "ventilateur extérieur IP44",
  // Prix
  "ventilateur moins de 100 euros",
  "ventilateur réversible noir moderne entre 200 et 400 euros",
  // Promo
  "ventilateur en promotion",
  // Style tropical
  "grand ventilateur tropique avec télécommande",
  // Catégorie
  "accessoires ventilateur",
  "prolongateur blanc 60cm",
  // Diamètre
  "ventilateur 130 cm",
  // Tri
  "meilleures ventes",
  // Destratificateur
  "déstratificateur pour pièce 50m2",
  // Enfants
  "ventilateur moins de 100 euros pour chambre enfant",
  // Matière pales
  "ventilateur pales aluminium",
  // Surface (m²)
  "ventilateur noir 30 m²",
  "ventilateur pour petite chambre",
  "ventilateur pour grand salon open space",
  // Type produit
  "ventilateur de table silencieux",
  "ventilateur sur pied noir",
  "ventilateur mural extérieur",
  "climatiseur mobile",
  "humidificateur d'air",
  // Pièces
  "ventilateur pour chambre d'enfant",
  "ventilateur pour salon et cuisine",
  "ventilateur pour terrasse",
  "ventilateur pour mezzanine",
  // Combinés (multi-filtres)
  "ventilateur blanc silencieux pour chambre 20 m²",
  "ventilateur de table pour cuisine moins de 50 euros",
  // Cas limites
  "ventilateur silencieux pas cher",
  "ventilateur KlassFan",
  "ventilateur sans lumière",
  "ventilateur plafond en pente",
  "ventilateur dimmable connecté",
];

// --- Appeler GPT-4.1-mini ---
async function callLLM(query) {
  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Requête utilisateur: ${query}` },
      ],
    }),
  });

  const elapsed = Date.now() - start;

  if (!res.ok) {
    const err = await res.text();
    return { error: `HTTP ${res.status}: ${err}`, elapsed };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const usage = data.usage || {};

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { _raw: content };
  }

  return { parsed, elapsed, usage };
}

// --- Affichage ---
function displayResult(query, result) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  "${query}"`);
  console.log(`  ⏱ ${result.elapsed}ms | tokens: ${result.usage?.prompt_tokens || "?"}→${result.usage?.completion_tokens || "?"}`);
  console.log(`${"─".repeat(70)}`);

  if (result.error) {
    console.log(`  ❌ ${result.error}`);
    return;
  }

  const p = result.parsed;

  // Filtres actifs (tout sauf refined_query et p_sort_column)
  const filters = Object.entries(p)
    .filter(([k]) => !["refined_query", "p_sort_column"].includes(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" | ");

  console.log(`  refined_query: "${p.refined_query || ""}"`);
  console.log(`  sort: ${p.p_sort_column || "null"}`);
  console.log(`  filtres: ${filters || "(aucun)"}`);
}

// --- Main ---
const singleQuery = process.argv.slice(2).join(" ");

if (singleQuery) {
  console.log("🔍 Test unitaire LLM Parser\n");
  const result = await callLLM(singleQuery);
  displayResult(singleQuery, result);
  console.log(`\n  JSON complet:`);
  console.log(JSON.stringify(result.parsed, null, 2));
} else {
  console.log(`🔍 Batterie de tests LLM Parser (${TEST_QUERIES.length} requêtes)\n`);

  const results = [];
  for (const q of TEST_QUERIES) {
    const result = await callLLM(q);
    displayResult(q, result);
    results.push({ query: q, ...result });
  }

  // Résumé
  const times = results.filter((r) => !r.error).map((r) => r.elapsed);
  const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const totalTokensIn = results.reduce((s, r) => s + (r.usage?.prompt_tokens || 0), 0);
  const totalTokensOut = results.reduce((s, r) => s + (r.usage?.completion_tokens || 0), 0);

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  RÉSUMÉ: ${results.length} tests | Temps moyen: ${avgTime}ms`);
  console.log(`  Tokens totaux: ${totalTokensIn} in + ${totalTokensOut} out`);
  console.log(`  Tokens moyens par requête: ${Math.round(totalTokensIn / results.length)} in + ${Math.round(totalTokensOut / results.length)} out`);
  console.log(`${"═".repeat(70)}`);
}
