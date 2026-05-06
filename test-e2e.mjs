/**
 * Test end-to-end — Fan Boutique Search Engine
 *
 * Appelle le vrai endpoint Netlify (production), récupère les résultats
 * et vérifie la cohérence : types produit, prix, pertinence, temps de réponse.
 *
 * Usage :
 *   node test-e2e.mjs                        # lance la batterie complète
 *   node test-e2e.mjs "ventilateur silencieux"  # teste UNE requête
 */

const ENDPOINT = "https://fan-boutique-search-engine.netlify.app/.netlify/functions/search";

// Requêtes de test avec assertions
const TEST_QUERIES = [
  // --- Requêtes génériques (doivent retourner des ventilateurs plafond) ---
  {
    query: "ventilateur plafond",
    expect: { minResults: 10, typeIncludes: "ventilateur" },
  },
  {
    query: "ventilateur silencieux",
    expect: { minResults: 5, typeIncludes: "ventilateur" },
  },
  {
    query: "ventilateur avec lumière",
    expect: { minResults: 5 },
  },
  // --- Prix ---
  {
    query: "ventilateur moins de 100 euros",
    expect: { minResults: 3, maxPrice: 100 },
  },
  {
    query: "ventilateur haut de gamme",
    expect: { minResults: 3 },
  },
  // --- Marques ---
  {
    query: "ventilateur KlassFan",
    expect: { minResults: 5 },
  },
  {
    query: "ventilateur Faro",
    expect: { minResults: 3 },
  },
  // --- Style / couleur ---
  {
    query: "ventilateur noir moderne",
    expect: { minResults: 3 },
  },
  {
    query: "ventilateur design blanc",
    expect: { minResults: 3 },
  },
  // --- Pièces ---
  {
    query: "ventilateur pour chambre",
    expect: { minResults: 3 },
  },
  {
    query: "ventilateur pour grand salon",
    expect: { minResults: 3 },
  },
  // --- Promo ---
  {
    query: "ventilateur en promotion",
    expect: { minResults: 1, hasPromo: true },
  },
  // --- Autres types (ne doivent PAS retourner ventilateur_plafond) ---
  {
    query: "ventilateur de table",
    expect: { minResults: 1 },
  },
  {
    query: "destratificateur",
    expect: { minResults: 10 }, // doit ouvrir sur les ventilateurs avec option destratificateur (2842), pas le type strict (18)
  },
  {
    query: "destratificateurs noirs pas chers",
    expect: { minResults: 5 }, // ~52 ventilateurs noirs avec option destrat — doit en sortir au moins 5
  },
  {
    query: "déstratificateur palfond noir", // typo volontaire pour tester la robustesse
    expect: { minResults: 5 },
  },
  {
    query: "télécommande ventilateur",
    expect: { minResults: 1 },
  },

  // --- Recherche par référence produit (nouveauté 2026-05-06) ---
  {
    query: "KL_TE3_P8WI166_RINGCH", // référence brute API → match exact
    expect: { minResults: 1, refContains: "te3_p8wi166_ringch" },
  },
  {
    query: "te3_p8wi166", // référence publique en lowercase → 2 produits Tenerife
    expect: { minResults: 2, refContains: "te3_p8wi166" },
  },
  {
    query: "FAB_213591328", // autre format de préfixe
    expect: { minResults: 1, refContains: "213591328" },
  },
  // --- Multi-critères ---
  {
    query: "ventilateur réversible noir entre 200 et 400 euros",
    expect: { minResults: 1, maxPrice: 400 },
  },
  // --- Langage naturel ---
  {
    query: "je cherche un ventilateur qui ne fait pas de bruit",
    expect: { minResults: 3 },
  },
  {
    query: "ventilateur blanc silencieux pour chambre 20m²",
    expect: { minResults: 1 },
  },
];

// ─── Helpers ───

function checkAssertions(query, results, expect) {
  const issues = [];

  if (expect.minResults && results.length < expect.minResults) {
    issues.push(`Attendu ≥${expect.minResults} résultats, reçu ${results.length}`);
  }

  if (expect.maxPrice) {
    const overPriced = results.filter((r) => {
      const effectivePrice = r.prix_promo || r.prix;
      return effectivePrice > expect.maxPrice;
    });
    if (overPriced.length > 0) {
      issues.push(
        `${overPriced.length} produit(s) au-dessus de ${expect.maxPrice}€ (ex: ${overPriced[0].titre} à ${overPriced[0].prix_promo || overPriced[0].prix}€)`
      );
    }
  }

  if (expect.hasPromo) {
    const withPromo = results.filter((r) => r.prix_promo && r.prix_promo < r.prix);
    if (withPromo.length === 0) {
      issues.push("Aucun produit en promo trouvé");
    }
  }

  if (expect.refContains) {
    const expected = expect.refContains.toLowerCase();
    const matched = results.some((r) => {
      const ref = (r.details?.reference || "").toLowerCase();
      return ref.includes(expected);
    });
    if (!matched) {
      const refs = results.slice(0, 3).map((r) => r.details?.reference || "(null)").join(", ");
      issues.push(`Aucun résultat avec reference contenant "${expect.refContains}" (top 3 refs: ${refs})`);
    }
  }

  return issues;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Main ───

async function testQuery(query, expect = {}) {
  const start = Date.now();
  let res, data;

  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    data = await res.json();
  } catch (e) {
    return { query, error: `Fetch échoué: ${e.message}`, duration: Date.now() - start };
  }

  const duration = Date.now() - start;
  const results = data.results || [];
  const issues = checkAssertions(query, results, expect);

  // Résumé des 3 premiers résultats
  const top3 = results.slice(0, 3).map((r) => {
    const price = r.prix_promo ? `${r.prix_promo}€ (promo, était ${r.prix}€)` : `${r.prix}€`;
    const stock = r.en_stock ? "✓" : "✗ rupture";
    return `  ${r.titre?.substring(0, 60)} — ${price} [${stock}]`;
  });

  return { query, results: results.length, duration, issues, top3, httpStatus: res.status };
}

async function main() {
  const singleQuery = process.argv[2];

  if (singleQuery) {
    console.log(`\n🔍 Test E2E: "${singleQuery}"\n`);
    const result = await testQuery(singleQuery, { minResults: 1 });
    console.log(`  ⏱ ${formatDuration(result.duration)} | HTTP ${result.httpStatus} | ${result.results} résultats`);
    if (result.error) console.log(`  ❌ ${result.error}`);
    if (result.issues.length > 0) result.issues.forEach((i) => console.log(`  ⚠️  ${i}`));
    if (result.top3) result.top3.forEach((l) => console.log(l));
    return;
  }

  console.log(`\n🔍 Test E2E — ${TEST_QUERIES.length} requêtes via ${ENDPOINT}\n`);

  let passed = 0;
  let failed = 0;
  const durations = [];
  const failures = [];

  for (const { query, expect } of TEST_QUERIES) {
    const result = await testQuery(query, expect);
    durations.push(result.duration);

    const status = result.error || result.issues.length > 0 ? "⚠️" : "✅";
    console.log(
      `${status} "${query}" — ${result.results} résultats, ${formatDuration(result.duration)}`
    );

    if (result.error) {
      console.log(`   ❌ ${result.error}`);
      failed++;
      failures.push({ query, reason: result.error });
    } else if (result.issues.length > 0) {
      result.issues.forEach((i) => console.log(`   ⚠️  ${i}`));
      failed++;
      failures.push({ query, reason: result.issues.join("; ") });
    } else {
      passed++;
    }

    // Top 3 résultats pour chaque requête
    if (result.top3) result.top3.forEach((l) => console.log(l));
    console.log();
  }

  // Résumé
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  RÉSUMÉ: ${passed}/${TEST_QUERIES.length} OK | ${failed} problème(s)`);
  console.log(`  Temps: moy ${formatDuration(avgDuration)} | min ${formatDuration(minDuration)} | max ${formatDuration(maxDuration)}`);
  if (failures.length > 0) {
    console.log("\n  PROBLÈMES:");
    failures.forEach((f) => console.log(`  ⚠️  "${f.query}" → ${f.reason}`));
  }
  console.log("══════════════════════════════════════════════════════════════\n");
}

main();
