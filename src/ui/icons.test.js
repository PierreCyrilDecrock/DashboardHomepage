import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Icon, ICON_NAMES } from './icons.js';

const EXPECTED = [
  'clock', 'square-check', 'file-text', 'link', 'hourglass', 'plus', 'x', 'settings',
  'grip-vertical', 'copy', 'trash-2', 'pencil', 'ellipsis', 'sun', 'moon', 'monitor',
  'download', 'upload', 'chevron-up', 'chevron-down', 'keyboard', 'layout-grid', 'undo-2',
];

test('les 23 icônes demandées sont présentes', () => {
  for (const name of EXPECTED) assert.ok(ICON_NAMES.includes(name), `icône manquante : ${name}`);
});

test('Icon produit un SVG aria-hidden en currentColor', () => {
  const vnode = Icon({ name: 'plus', size: 16 });
  assert.equal(vnode.type, 'svg');
  assert.equal(vnode.props['aria-hidden'], 'true');
  assert.equal(vnode.props.stroke, 'currentColor');
  assert.equal(vnode.props.width, 16);
});

test('Icon renvoie null pour un nom inconnu', () => {
  assert.equal(Icon({ name: 'inexistante' }), null);
});
