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
  // ═══════════════════════════════════════════════════════
  // RECHERCHES GOOGLE TYPIQUES (requêtes réelles utilisateurs)
  // ═══════════════════════════════════════════════════════

  // --- Top recherches génériques (doit → ventilateur_plafond) ---
  "ventilateur plafond",
  "ventilateur de plafond silencieux",
  "ventilateur plafond avec lumière",
  "ventilateur plafond télécommande",
  "ventilateur plafond pas cher",
  "ventilateur plafond design",
  "ventilateur plafond reversible",

  // --- Recherches SANS le mot "plafond" (doit QUAND MÊME → ventilateur_plafond) ---
  "ventilateur silencieux",
  "ventilateur blanc",
  "ventilateur noir moderne",
  "ventilateur avec lumière",
  "ventilateur pas cher",
  "ventilateur télécommande",

  // --- Pièces (recherches fréquentes) ---
  "ventilateur pour chambre",
  "ventilateur pour salon",
  "ventilateur pour chambre d'enfant",
  "ventilateur pour terrasse",
  "ventilateur extérieur",
  "ventilateur pour grand salon",

  // --- Prix (comportement acheteur) ---
  "ventilateur moins de 100 euros",
  "ventilateur moins de 200 euros",
  "ventilateur haut de gamme",
  "ventilateur en promotion",
  "ventilateur réversible noir entre 200 et 400 euros",

  // --- Marques (recherches brandées) ---
  "ventilateur KlassFan",
  "ventilateur Faro",
  "ventilateur Hunter",
  "ventilateur Westinghouse",

  // --- Styles ---
  "ventilateur industriel",
  "ventilateur tropical",
  "ventilateur moderne blanc",
  "ventilateur rustique bois",
  "ventilateur design noir",

  // --- Technique / specs ---
  "ventilateur DC",
  "ventilateur 132 cm",
  "ventilateur 5 pales",
  "ventilateur plafond bas",
  "ventilateur plafond en pente",
  "ventilateur sans lumière",

  // --- Destratificateur / hiver ---
  "destratificateur",
  "ventilateur réversible été hiver",
  "redistribuer la chaleur",

  // --- Types produit AUTRES que plafond (doivent PAS être ventilateur_plafond) ---
  "ventilateur de table",
  "ventilateur sur pied",
  "ventilateur mural",
  "ventilateur colonne silencieux",
  "climatiseur mobile",
  "humidificateur d'air",

  // --- Accessoires ---
  "télécommande ventilateur",
  "prolongateur ventilateur 60cm",
  "accessoire ventilateur",

  // --- Combinées (multi-critères réalistes) ---
  "ventilateur blanc silencieux pour chambre 20m²",
  "grand ventilateur noir DC avec lumière pour salon",
  "ventilateur extérieur IP44 avec télécommande",
  "petit ventilateur pour bureau pas cher",

  // --- Recherches néophytes / langage naturel ---
  "je cherche un ventilateur qui ne fait pas de bruit",
  "ventilateur pour plafond incliné",
  "un truc pour brasser l'air dans le salon",
  "ventilateur connecté alexa",
  "ventilateur avec variateur de lumière",
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
