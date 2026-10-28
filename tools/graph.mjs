// Graphe d'imports du site : sert au rapport de poids (tools/report.mjs) et à l'export, qui
// ajoute un <link rel="modulepreload"> par module du premier affichage pour que le navigateur
// les demande tous en même temps au lieu de les découvrir de niveau en niveau.
//
// Aucune dépendance : les imports sont repérés par expression régulière, ce qui suffit ici
// (imports relatifs avec extension .js, règle de RULES.md).

import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Imports relatifs d'un module : statiques (chargés avec lui) et dynamiques (chargés à la demande).
 * @param {string} source
 * @returns {{ statics: string[], dynamics: string[] }}
 */
export function findImports(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const pick = (re) => [...code.matchAll(re)].map((m) => m[1]).filter((s) => s.startsWith('.'));
  return { statics: pick(STATIC_IMPORT), dynamics: pick(DYNAMIC_IMPORT) };
}

const posix = (p) => p.split(sep).join('/');

/**
 * Modules chargés au premier affichage : tout ce qu'atteint `src/main.js` par imports statiques, plus
 * le dossier de chaque widget du manifeste (le registre les charge au démarrage par import()).
 * Les autres import() (panneaux, réglages) sont à la demande et ne comptent pas.
 *
 * @param {string} root racine du projet (ou du site exporté)
 * @returns {Promise<{
 *   modules: string[],
 *   onDemand: { module: string, from: string }[],
 *   longestChain: string[],
 * }>} chemins relatifs à `root`, avec des « / »
 */
export async function firstDisplayGraph(root) {
  const entry = join(root, 'src/main.js');
  /** @type {Map<string, string[]>} module → modules qu'il charge au démarrage */
  const edges = new Map();
  /** @type {Map<string, string[]>} */
  const dynamicOf = new Map();

  let widgetFolders = [];
  try {
    const manifest = await readFile(join(root, 'src/widgets/manifest.js'), 'utf8');
    widgetFolders = [...manifest.matchAll(/^\s*'([a-z0-9-]+)'\s*,/gm)].map((m) => m[1]);
  } catch {
    /* pas de manifeste : pas de widgets */
  }
  const registry = resolve(root, 'src/widgets/registry.js');
  const widgetEntries = widgetFolders.map((name) => resolve(root, 'src/widgets', name, 'index.js'));

  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (edges.has(file)) continue;
    const { statics, dynamics } = findImports(await readFile(file, 'utf8'));
    const next = statics.map((s) => resolve(dirname(file), s));
    // Le registre charge les widgets du manifeste au démarrage.
    if (file === registry) next.push(...widgetEntries);
    edges.set(file, next);
    dynamicOf.set(file, dynamics.map((s) => resolve(dirname(file), s)));
    queue.push(...next);
  }

  // Plus longue chaîne (le graphe n'a pas de cycle : un cycle déclencherait une erreur claire).
  /** @type {Map<string, string[]>} */
  const memo = new Map();
  const visiting = new Set();
  const longest = (file) => {
    const known = memo.get(file);
    if (known) return known;
    if (visiting.has(file)) throw new Error(`Cycle d'imports autour de ${relative(root, file)}`);
    visiting.add(file);
    let best = [];
    for (const next of edges.get(file) ?? []) {
      const chain = longest(next);
      if (chain.length > best.length) best = chain;
    }
    visiting.delete(file);
    const result = [file, ...best];
    memo.set(file, result);
    return result;
  };

  const modules = [...edges.keys()].map((f) => posix(relative(root, f)));
  const onDemand = [];
  for (const [file, list] of dynamicOf) {
    for (const target of list) {
      if (!edges.has(target)) onDemand.push({ module: posix(relative(root, target)), from: posix(relative(root, file)) });
    }
  }
  const seen = new Set();
  const uniqueOnDemand = onDemand.filter((d) => !seen.has(`${d.module}|${d.from}`) && seen.add(`${d.module}|${d.from}`));
  return { modules, onDemand: uniqueOnDemand, longestChain: longest(resolve(entry)).map((f) => posix(relative(root, f))) };
}
