// Les huit couleurs de tuile (--tile-1 à --tile-8) doivent offrir un contraste AA (4,5:1) avec la
// lettre (--tile-text), en clair comme en sombre, et les trois blocs du thème doivent les définir.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');

/** Extrait le corps du bloc dont le sélecteur est exactement `selector` (premier trouvé). */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `bloc ${selector} introuvable`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const [name, selector] of [
  ['clair', ':root'],
  ['sombre (préférence du système)', ':root:not([data-theme="light"])'],
  ['sombre (forcé)', ':root[data-theme="dark"]'],
]) {
  test(`thème ${name} : huit tuiles lisibles (contraste AA avec --tile-text)`, () => {
    const body = block(selector);
    const text = /--tile-text:\s*(#[0-9a-f]{6})/i.exec(body)?.[1];
    assert.ok(text, '--tile-text manquant');
    for (let n = 1; n <= 8; n++) {
      const color = new RegExp(`--tile-${n}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)?.[1];
      assert.ok(color, `--tile-${n} manquant`);
      const ratio = contrast(color, text);
      assert.ok(ratio >= 4.5, `--tile-${n} (${color}) sur ${text} : ${ratio.toFixed(2)}:1`);
    }
  });
}

test('les huit fonds de tuile sont distincts (clair et sombre)', () => {
  for (const selector of [':root', ':root[data-theme="dark"]']) {
    const body = block(selector);
    const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => new RegExp(`--tile-${n}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)[1]);
    assert.equal(new Set(colors).size, 8, selector);
  }
});

// --- Contraste AA des couleurs de l'interface (phase 10) -------------------------------------------
// Texte : 4,5:1. Éléments d'interface et poignées (contour d'un champ, barre de progression,
// anneau de focus) : 3:1. Les paires ci-dessous sont celles que les composants utilisent réellement.

/** Valeur d'une variable dans un bloc du thème. */
const token = (body, name) => {
  const hex = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)?.[1];
  assert.ok(hex, `${name} manquant`);
  return hex;
};

const TEXT_PAIRS = [
  ['--text', '--bg'], ['--text', '--surface'], ['--text', '--surface-2'],
  ['--muted', '--bg'], ['--muted', '--surface'], ['--muted', '--surface-2'],
  ['--accent-contrast', '--accent'],
  ['--accent', '--bg'], ['--accent', '--surface'], ['--accent', '--surface-2'],
  ['--danger', '--bg'], ['--danger', '--surface'], ['--danger', '--surface-2'],
  ['--accent-2', '--surface'],
];
const UI_PAIRS = [
  ['--accent', '--bg'], ['--accent', '--surface'],
  ['--accent-2', '--surface'], ['--accent-2', '--surface-2'],
];

for (const [name, selector] of [
  ['clair', ':root'],
  ['sombre (préférence du système)', ':root:not([data-theme="light"])'],
  ['sombre (forcé)', ':root[data-theme="dark"]'],
]) {
  test(`thème ${name} : texte (4,5:1) et contrôles (3:1) lisibles`, () => {
    const body = block(selector);
    for (const [fg, bg] of TEXT_PAIRS) {
      const ratio = contrast(token(body, fg), token(body, bg));
      assert.ok(ratio >= 4.5, `${fg} sur ${bg} : ${ratio.toFixed(2)}:1 (texte, 4,5 attendu)`);
    }
    for (const [fg, bg] of UI_PAIRS) {
      const ratio = contrast(token(body, fg), token(body, bg));
      assert.ok(ratio >= 3, `${fg} sur ${bg} : ${ratio.toFixed(2)}:1 (contrôle, 3 attendu)`);
    }
  });
}
