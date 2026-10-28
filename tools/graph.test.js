import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { findImports, firstDisplayGraph } from './graph.mjs';

test('findImports : statiques, dynamiques, commentaires ignorés', () => {
  const source = `
    import { a } from './a.js';
    import './side.js';
    export { b } from "./b.js";
    import x from 'externe';
    // import { c } from './commentaire.js';
    /* import { d } from './bloc.js'; */
    const lazy = () => import('./lazy.js');
    const url = 'http://example.org//x';
  `;
  assert.deepEqual(findImports(source), { statics: ['./a.js', './side.js', './b.js'], dynamics: ['./lazy.js'] });
});

test('firstDisplayGraph : imports statiques et widgets du manifeste, panneaux à la demande, plus longue chaîne', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dash-graph-'));
  const files = {
    'src/main.js': "import { App } from './App.js'; import './widgets/registry.js';",
    'src/App.js': "import { deep } from './lib/deep.js'; export const load = () => import('./panel.js');",
    'src/lib/deep.js': "import { leaf } from './leaf.js'; export const deep = 1;",
    'src/lib/leaf.js': 'export const leaf = 1;',
    'src/panel.js': 'export const panel = 1;',
    'src/widgets/registry.js': 'export const load = (n) => import("./" + n + "/index.js");',
    'src/widgets/manifest.js': "export default [\n  'clock', // Heure\n  'todo', // Tâches\n];\n",
    'src/widgets/clock/index.js': "import { c } from './Clock.js';",
    'src/widgets/clock/Clock.js': 'export const c = 1;',
    'src/widgets/todo/index.js': 'export const t = 1;',
  };
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), text);
  }
  try {
    const g = await firstDisplayGraph(dir);
    assert.deepEqual([...g.modules].sort(), [
      'src/App.js', 'src/lib/deep.js', 'src/lib/leaf.js', 'src/main.js', 'src/widgets/clock/Clock.js',
      'src/widgets/clock/index.js', 'src/widgets/registry.js', 'src/widgets/todo/index.js',
    ]);
    assert.ok(!g.modules.includes('src/panel.js'), 'le panneau est à la demande');
    assert.deepEqual(g.onDemand, [{ module: 'src/panel.js', from: 'src/App.js' }]);
    assert.deepEqual(g.longestChain, ['src/main.js', 'src/App.js', 'src/lib/deep.js', 'src/lib/leaf.js']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('firstDisplayGraph : un cycle d\'imports est signalé', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dash-graph-cycle-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src/main.js'), "import './a.js';");
  await writeFile(join(dir, 'src/a.js'), "import './main.js';");
  try {
    await assert.rejects(firstDisplayGraph(dir), /Cycle d'imports/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
