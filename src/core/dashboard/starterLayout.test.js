import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_LAYOUT, applyStarterLayout } from './starterLayout.js';

test('la disposition tient dans les 12 colonnes, sans chevauchement', () => {
  const taken = new Set();
  for (const { type, layout } of STARTER_LAYOUT) {
    assert.ok(layout.x >= 0 && layout.x + layout.w <= 12, `${type} dépasse la grille`);
    for (let x = layout.x; x < layout.x + layout.w; x++) {
      for (let y = layout.y; y < layout.y + layout.h; y++) {
        const cell = `${x},${y}`;
        assert.ok(!taken.has(cell), `${type} chevauche un autre widget en ${cell}`);
        taken.add(cell);
      }
    }
  }
});

test('Heure, À faire (à droite, deux rangées), Minuteur, Notes et Raccourcis, sans démo', () => {
  assert.deepEqual(STARTER_LAYOUT.map((e) => e.type).sort(), ['clock', 'notes', 'shortcuts', 'timer', 'todo']);
  const todo = STARTER_LAYOUT.find((e) => e.type === 'todo').layout;
  assert.equal(todo.x + todo.w, 12, 'À faire est collé au bord droit');
  const others = STARTER_LAYOUT.filter((e) => e.type !== 'todo').map((e) => e.layout.y + e.layout.h);
  assert.ok(todo.h >= Math.max(...others) - todo.y, 'À faire couvre les deux rangées');
});

function fakes(registered) {
  let n = 0;
  const added = [];
  const placed = [];
  return {
    added,
    placed,
    deps: {
      isRegistered: (type) => registered.includes(type),
      actions: { addWidget: (type) => (added.push(type), `id${++n}`) },
      store: { updateLayouts: (layouts) => placed.push(layouts) },
    },
  };
}

test('applyStarterLayout ajoute chaque type et place toutes les instances en un seul appel', () => {
  const f = fakes(['clock', 'timer', 'todo', 'notes', 'shortcuts']);
  const ids = applyStarterLayout(f.deps);
  assert.deepEqual(f.added, ['clock', 'timer', 'todo', 'notes', 'shortcuts']);
  assert.equal(ids.length, 5);
  assert.equal(f.placed.length, 1);
  assert.deepEqual(f.placed[0].id1, { x: 0, y: 0, w: 4, h: 3 });
  assert.deepEqual(f.placed[0].id3, { x: 8, y: 0, w: 4, h: 6 });
});

test('les types absents du registre sont ignorés', () => {
  const f = fakes(['clock', 'todo']);
  const ids = applyStarterLayout(f.deps);
  assert.deepEqual(f.added, ['clock', 'todo']);
  assert.equal(ids.length, 2);
  assert.deepEqual(Object.keys(f.placed[0]), ['id1', 'id2']);
});

test('aucun type enregistré : rien n\'est ajouté', () => {
  const f = fakes([]);
  assert.deepEqual(applyStarterLayout(f.deps), []);
  assert.deepEqual(f.added, []);
});
