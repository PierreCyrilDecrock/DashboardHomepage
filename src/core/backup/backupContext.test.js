import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupSession, configureBackup, getBackupDeps } from './backupContext.js';

test('getBackupDeps refuse de servir tant que la sauvegarde n\'est pas branchée', () => {
  configureBackup(null);
  assert.throws(() => getBackupDeps(), /configureBackup/);
});

test('configureBackup branche les dépendances et efface l\'annulation de la session', () => {
  const deps = /** @type {any} */ ({ marker: 1 });
  backupSession.setState({ undo: /** @type {any} */ ({ label: 'x', snapshot: {} }) });
  configureBackup(deps);
  assert.equal(getBackupDeps(), deps);
  assert.equal(backupSession.getState().undo, null);
  configureBackup(null);
});
