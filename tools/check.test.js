import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkFile, checkProject, stripJsComments } from './check.mjs';

const rules = (file, text) => checkFile(file, text).map((v) => v.rule);

test('stripJsComments : retire les commentaires, garde les chaînes et les lignes', () => {
  const src = "const a = 'http://x'; // localStorage\n/* chrome.x\n eval( */ const b = `${'//'}`;\n";
  const out = stripJsComments(src);
  assert.ok(out.includes("'http://x'"));
  assert.ok(!out.includes('localStorage'));
  assert.ok(!out.includes('eval'));
  assert.equal(out.split('\n').length, src.split('\n').length);
});

test('stripJsComments : gabarits imbriqués (html dans html)', () => {
  const src = 'const v = html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`; // fin\nlocalStorage.x';
  const out = stripJsComments(src);
  assert.ok(!out.includes('fin'));
  assert.ok(out.includes('localStorage.x'));
});

test('storage-api : fautif hors de src/core/storage, correct dedans et dans theme-init.js', () => {
  assert.deepEqual(rules('src/widgets/todo/TodoWidget.js', 'localStorage.setItem("a", "b")'), ['storage-api']);
  assert.deepEqual(rules('src/lib/x.js', 'sessionStorage.getItem("a")'), ['storage-api']);
  assert.deepEqual(rules('src/core/storage/localStorageAdapter.js', 'localStorage.setItem("a", "b")'), []);
  assert.deepEqual(rules('theme-init.js', 'localStorage.getItem("dash:theme-mirror")'), []);
  assert.deepEqual(rules('src/lib/x.js', '// on n\'appelle jamais localStorage ici\nconst a = 1;'), []);
});

test('inline-script : un <script> sans src est refusé', () => {
  assert.deepEqual(rules('index.html', '<script>alert(1)</script>'), ['inline-script', 'dialog']);
  assert.deepEqual(rules('index.html', '<script type="module">import("./x.js")</script>'), ['inline-script']);
  assert.deepEqual(rules('index.html', '<script src="./theme-init.js"></script><script type="module" src="./src/main.js"></script>'), []);
});

test('eval : eval et new Function sont refusés', () => {
  assert.deepEqual(rules('src/lib/x.js', 'eval("1")'), ['eval']);
  assert.deepEqual(rules('src/lib/x.js', 'const f = new Function("return 1")'), ['eval']);
  assert.deepEqual(rules('src/lib/x.js', 'const medieval = 1; evaluate(2)'), []);
});

test('absolute-path : adresse absolue refusée dans import, src et href', () => {
  assert.deepEqual(rules('src/main.js', "import { a } from '/src/a.js';"), ['absolute-path']);
  assert.deepEqual(rules('src/main.js', "const m = import('/src/a.js');"), ['absolute-path']);
  assert.deepEqual(rules('index.html', '<link rel="stylesheet" href="/styles/theme.css">'), ['absolute-path']);
  assert.deepEqual(rules('index.html', '<script type="module" src="//cdn.example.com/x.js"></script>'), ['absolute-path']);
  assert.deepEqual(rules('index.html', '<link rel="stylesheet" href="./styles/theme.css">'), []);
  assert.deepEqual(rules('src/main.js', "import { a } from './a.js';"), []);
});

test('chrome-api : chrome.* seulement dans src/platform/extension', () => {
  assert.deepEqual(rules('src/lib/x.js', 'chrome.storage.local.get("a")'), ['chrome-api']);
  assert.deepEqual(rules('src/widgets/timer/TimerWidget.js', 'chrome.alarms.create("a")'), ['chrome-api']);
  assert.deepEqual(rules('src/platform/extension/alarmService.js', 'chrome.alarms.create("a")'), []);
  assert.deepEqual(rules('src/lib/x.js', 'const chromeless = 1; // chrome.storage plus tard'), []);
});

test('dialog : alert, confirm et prompt sont refusés', () => {
  assert.deepEqual(rules('src/lib/x.js', 'alert("a")'), ['dialog']);
  assert.deepEqual(rules('src/lib/x.js', 'if (confirm("sûr ?")) {}'), ['dialog']);
  assert.deepEqual(rules('src/lib/x.js', 'const t = window.prompt("nom")'), ['dialog']);
  assert.deepEqual(rules('src/lib/x.js', 'dialog.confirm(); onAlert(1); const prompted = 2;'), []);
});

test('widget-import : un widget n\'importe ni un autre widget ni src/core', () => {
  assert.deepEqual(rules('src/widgets/todo/TodoWidget.js', "import { x } from '../notes/schema.js';"), ['widget-import']);
  assert.deepEqual(rules('src/widgets/todo/TodoWidget.js', "import { s } from '../../core/store/dataStore.js';"), ['widget-import']);
  assert.deepEqual(rules('src/widgets/todo/TodoWidget.js', "const m = import('../clock/index.js');"), ['widget-import']);
  assert.deepEqual(rules('src/widgets/todo/index.js', "import { defineWidget } from '../types.js';\nimport { Todo } from './TodoWidget.js';\nimport { Icon } from '../../ui/icons.js';\nimport { html } from '../../lib/vendor.js';"), []);
  // Hors dossier de widget : le registre peut charger les widgets.
  assert.deepEqual(rules('src/widgets/registry.js', "import { x } from './todo/index.js';"), []);
  assert.deepEqual(rules('src/core/dashboard/WidgetFrame.js', "import { getDefinition } from '../../widgets/registry.js';"), []);
});

test('vendor-import : bibliothèques seulement par src/lib/vendor.js', () => {
  assert.deepEqual(rules('src/lib/x.js', "import { h } from 'preact';"), ['vendor-import']);
  assert.deepEqual(rules('src/lib/x.js', "import { z } from 'zod';"), ['vendor-import']);
  assert.deepEqual(rules('src/lib/x.js', "import { z } from '../../vendor/zod.js';"), ['vendor-import']);
  assert.deepEqual(rules('src/widgets/todo/TodoWidget.js', "import { Sortable } from '../../../vendor/sortable.js';"), ['vendor-import']);
  assert.deepEqual(rules('src/lib/vendor.js', "export { z } from '../../vendor/zod.js';"), []);
  assert.deepEqual(rules('src/core/dashboard/Dashboard.js', "import { GridStack } from '../../../vendor/gridstack.js';"), []);
  assert.deepEqual(rules('src/core/dashboard/Dashboard.js', "import { z } from '../../../vendor/zod.js';"), ['vendor-import']);
  assert.deepEqual(rules('src/core/store/x.js', "import { GridStack } from '../../../vendor/gridstack.js';"), ['vendor-import']);
  assert.deepEqual(rules('src/lib/x.test.js', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';"), []);
});

test('checkProject : un projet correct passe, un projet fautif échoue avec fichier et ligne', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dash-check-'));
  try {
    const put = async (rel, text) => {
      await mkdir(dirname(join(dir, rel)), { recursive: true });
      await writeFile(join(dir, rel), text);
    };
    await put('index.html', '<title>x</title>\n<script type="module" src="./src/main.js"></script>\n');
    await put('theme-init.js', 'try { localStorage.getItem("a"); } catch (e) {}\n');
    await put('src/main.js', "import { html } from './lib/vendor.js';\n");
    assert.deepEqual(await checkProject(dir), []);

    await put('src/widgets/todo/TodoWidget.js', 'const a = 1;\nlocalStorage.clear();\n');
    const v = await checkProject(dir);
    assert.equal(v.length, 1);
    assert.equal(v[0].file, 'src/widgets/todo/TodoWidget.js');
    assert.equal(v[0].line, 2);
    assert.equal(v[0].rule, 'storage-api');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('platform-api : Notification et AudioContext seulement dans src/lib/platform', () => {
  assert.deepEqual(rules('src/widgets/timer/TimerWidget.js', 'new Notification("a")'), ['platform-api']);
  assert.deepEqual(rules('src/lib/alarmSound.js', 'const ctx = new AudioContext();'), ['platform-api']);
  assert.deepEqual(rules('src/core/x.js', 'if (window.Notification) {}'), ['platform-api']);
  assert.deepEqual(rules('src/lib/platform/webAlarmService.js', 'new window.AudioContext(); Notification.requestPermission();'), []);
  assert.deepEqual(rules('src/lib/alarmSound.test.js', 'globalThis.AudioContext = class {}'), []);
  assert.deepEqual(rules('src/widgets/x/X.js', '// on n\'appelle pas Notification ici\nconst a = 1;'), []);
  assert.deepEqual(rules('src/core/toast.js', 'const toastNotification = 1;'), [], 'un nom qui contient le mot ne compte pas');
  assert.deepEqual(rules('src/widgets/timer/TimerSettings.js', 'html`<${Toggle} label="Notification à la fin" />`'), [], 'un libellé d\'interface ne compte pas');
});
