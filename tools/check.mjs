#!/usr/bin/env node
// Contrôle des règles du projet (remplace ESLint). Node seul, aucune dépendance.
//
//   node tools/check.mjs          sort avec le code 1 à la première violation trouvée
//
// Fichiers parcourus : index.html, theme-init.js et tout src/ (.js, .mjs, .html).
// Règles (voir RULES.md) :
//   storage-api     localStorage / sessionStorage hors de src/core/storage et de theme-init.js
//   inline-script   un <script> sans src (dans un .html)
//   eval            eval(...) ou new Function
//   absolute-path   adresse absolue commençant par « / » dans un import, un src ou un href
//   chrome-api      chrome.* hors de src/platform/extension
//   dialog          alert, confirm ou prompt
//   widget-import   un widget qui importe un autre widget ou src/core
//   vendor-import   une bibliothèque importée autrement que par src/lib/vendor.js
//                   (exception : GridStack, importé par src/core/dashboard/Dashboard.js)
//
// Les commentaires sont ignorés : on peut y citer localStorage ou chrome.storage.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {Object} Violation
 * @property {string} file  chemin relatif, avec des /
 * @property {number} line
 * @property {string} rule
 * @property {string} message
 */

/**
 * Remplace les commentaires JS par des espaces (les retours à la ligne sont gardés).
 * Gère les chaînes et les gabarits `...${ ... }...` imbriqués (htm en utilise beaucoup).
 */
export function stripJsComments(code) {
  let out = '';
  let i = 0;
  /** @type {string|null} */
  let quote = null;
  /** @type {Array<'tpl' | { depth: number }>} */
  const stack = [];
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    const top = stack[stack.length - 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote || c === '\n') quote = null;
      i++;
    } else if (top === 'tpl') {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === '`') {
        stack.pop();
      } else if (c === '$' && n === '{') {
        out += n;
        stack.push({ depth: 0 });
        i += 2;
        continue;
      }
      i++;
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i++;
    } else if (c === '`') {
      stack.push('tpl');
      out += c;
      i++;
    } else if (c === '/' && n === '/') {
      while (i < code.length && code[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else {
      if (top && typeof top === 'object') {
        if (c === '{') top.depth++;
        else if (c === '}') {
          if (top.depth === 0) stack.pop();
          else top.depth--;
        }
      }
      out += c;
      i++;
    }
  }
  return out;
}

/** Remplace les commentaires HTML par des retours à la ligne équivalents. */
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const ABSOLUTE_IN_CODE = [
  /\bfrom\s*["']\//g,
  /\bimport\s*\(\s*["'`]\//g,
  /\bimport\s*["']\//g,
  /\b(?:src|href)\s*=\s*["'`]\//g,
];

/** Extrait les adresses importées (statiques et dynamiques à chaîne littérale). */
function extractImports(code) {
  const found = [];
  const statics = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamics = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const re of [statics, dynamics]) {
    for (const m of code.matchAll(re)) found.push({ spec: m[1], index: m.index });
  }
  return found;
}

/**
 * Contrôle un fichier.
 * @param {string} file  chemin relatif au projet, avec des /
 * @param {string} text
 * @returns {Violation[]}
 */
export function checkFile(file, text) {
  /** @type {Violation[]} */
  const v = [];
  const add = (index, rule, message, source) => v.push({ file, line: lineOf(source, index), rule, message });
  const isHtml = file.endsWith('.html');
  const code = isHtml ? stripHtmlComments(text) : stripJsComments(text);

  // Scripts en ligne (HTML), et code JS contenu dans un HTML (analysé tel quel).
  if (isHtml) {
    for (const m of code.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi)) {
      add(m.index, 'inline-script', 'Script en ligne interdit : utilise un fichier externe.', code);
    }
  }

  if (!file.startsWith('src/core/storage/') && file !== 'theme-init.js') {
    for (const m of code.matchAll(/\b(localStorage|sessionStorage)\b/g)) {
      add(m.index, 'storage-api', `${m[1]} hors de src/core/storage : passe par le StorageAdapter.`, code);
    }
  }

  for (const m of code.matchAll(/(?<![\w$.])eval\s*\(|\bnew\s+Function\b/g)) {
    add(m.index, 'eval', 'eval et new Function sont interdits.', code);
  }

  for (const re of ABSOLUTE_IN_CODE) {
    for (const m of code.matchAll(re)) {
      add(m.index, 'absolute-path', 'Adresse absolue interdite (le site est servi sous un sous-dossier) : utilise un chemin relatif.', code);
    }
  }

  // Notifications et son : seulement derrière src/lib/platform (alarmService), pour que l'extension (phase 12)
  // puisse les remplacer. Les tests peuvent fabriquer des doubles.
  if (!file.startsWith('src/lib/platform/') && !file.startsWith('src/platform/') && !/\.test\.m?js$/.test(file)) {
    for (const m of code.matchAll(/(?<![\w$])(?:(?:window|globalThis)\s*\.\s*(Notification)\b|new\s+(Notification)\b|typeof\s+(Notification)\b|(Notification)\s*\.\s*\w|(AudioContext|webkitAudioContext)\b)/g)) {
      add(m.index, 'platform-api', `${m.slice(1).find(Boolean)} hors de src/lib/platform : passe par le service de la plateforme (getAlarmService).`, code);
    }
  }

  if (!file.startsWith('src/platform/extension/')) {
    for (const m of code.matchAll(/(?<![\w$.])chrome\s*\??\./g)) {
      add(m.index, 'chrome-api', 'chrome.* est interdit hors de src/platform/extension (phase 12).', code);
    }
  }

  for (const m of code.matchAll(/(?<![\w$.])(?:window\s*\.\s*|globalThis\s*\.\s*)?(alert|confirm|prompt)\s*\(/g)) {
    add(m.index, 'dialog', `${m[1]}() ne s'affiche pas dans un artefact : fais la confirmation dans la page.`, code);
  }

  if (!isHtml) {
    const widgetMatch = file.match(/^src\/widgets\/([^/]+)\/.+/);
    for (const { spec, index } of extractImports(code)) {
      if (spec.startsWith('node:')) continue;

      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        add(index, 'vendor-import', `Bibliothèque « ${spec} » importée par son nom : passe par src/lib/vendor.js.`, code);
        continue;
      }
      if (spec.startsWith('/')) continue; // déjà signalé par absolute-path

      const target = posix.normalize(posix.join(posix.dirname(file), spec));

      if (target.startsWith('vendor/')) {
        const allowed =
          file === 'src/lib/vendor.js' ||
          (file === 'src/core/dashboard/Dashboard.js' && target === 'vendor/gridstack.js');
        if (!allowed) {
          add(index, 'vendor-import', `${target} importé directement : passe par src/lib/vendor.js (GridStack : seulement dans Dashboard.js).`, code);
        }
      }

      if (widgetMatch) {
        const type = widgetMatch[1];
        if (target.startsWith('src/core/') || target === 'src/core') {
          add(index, 'widget-import', `Le widget « ${type} » importe src/core : il ne reçoit que ses props.`, code);
        } else if (target.startsWith('src/widgets/')) {
          const rest = target.slice('src/widgets/'.length);
          if (rest.includes('/')) {
            const other = rest.split('/')[0];
            if (other !== type) {
              add(index, 'widget-import', `Le widget « ${type} » importe le widget « ${other} » : interdit.`, code);
            }
          }
        }
      }
    }
  }
  return v;
}

async function listSources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listSources(p)));
    else if (/\.(m?js|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * Contrôle tout le projet.
 * @param {string} [root]
 * @returns {Promise<Violation[]>}
 */
export async function checkProject(root = ROOT) {
  root = resolve(root);
  const files = [];
  for (const name of ['index.html', 'theme-init.js']) {
    if (await stat(join(root, name)).catch(() => null)) files.push(join(root, name));
  }
  const srcDir = join(root, 'src');
  if (await stat(srcDir).catch(() => null)) files.push(...(await listSources(srcDir)));

  /** @type {Violation[]} */
  const all = [];
  for (const abs of files.sort()) {
    const rel = abs.slice(root.length + 1).split(sep).join('/');
    all.push(...checkFile(rel, await readFile(abs, 'utf8')));
  }
  return all;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await checkProject(process.argv[2] ? resolve(process.argv[2]) : ROOT);
  if (violations.length === 0) {
    console.log('check : aucune violation.');
  } else {
    for (const x of violations) console.error(`${x.file}:${x.line}  [${x.rule}]  ${x.message}`);
    console.error(`\ncheck : ${violations.length} violation(s).`);
    process.exit(1);
  }
}
