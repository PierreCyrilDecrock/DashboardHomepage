// La grille du dashboard. GridStack gère le DOM de la grille (positions, glisser, redimensionner) ;
// Preact dessine le contenu de chaque widget à l'intérieur (un WidgetFrame par élément).
// C'est le seul fichier autorisé à importer vendor/gridstack.js : aucun widget ne touche au DOM
// de GridStack.
//
// Principes :
//  - le dashboardStore reste la source de vérité de la disposition (12 colonnes) ;
//  - la disposition n'est enregistrée qu'à la FIN d'un geste (dragstop, resizestop) ou d'une
//    action au clavier, jamais pendant le mouvement ;
//  - en mode une colonne (écran étroit), pas de glisser, pas de redimensionnement et aucune
//    écriture de disposition : la disposition à 12 colonnes n'est jamais écrasée.

import { GridStack } from '../../../vendor/gridstack.js';
import { html, render, useEffect, useRef } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { getDefinition } from '../../widgets/registry.js';
import { dashboardStore, selectInstances } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { NEW_INSTANCE_Y } from './createInstance.js';
import { focusWidgetSoon } from './focusWidget.js';
import { GRID_COLUMNS, fromGridNodes, moveBy, resizeBy, toGridItems } from './layoutUtils.js';
import { applyStarterLayout } from './starterLayout.js';
import { WidgetFrame } from './WidgetFrame.js';

/** Largeur (px) sous laquelle la grille passe à une colonne. */
export const SINGLE_COLUMN_BELOW = 700;
/** Hauteur d'une ligne de grille, en px. */
export const ROW_HEIGHT = 80;
/** Marge GridStack : 10 px de chaque côté, soit 20 px entre deux widgets. */
export const GRID_MARGIN = 10;

/**
 * Crée la grille dans `host` et la relie aux stores. Renvoie une fonction de nettoyage.
 * @param {HTMLElement} host élément qui recevra les éléments de la grille
 * @param {{ dashboard?: typeof dashboardStore, ui?: typeof uiStore, matchMedia?: typeof globalThis.matchMedia }} [deps]
 * @returns {() => void}
 */
export function mountGrid(host, { dashboard = dashboardStore, ui = uiStore, matchMedia = globalThis.matchMedia?.bind(globalThis) } = {}) {
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)');

  const grid = GridStack.init(
    {
      column: GRID_COLUMNS,
      cellHeight: ROW_HEIGHT,
      margin: GRID_MARGIN,
      mode: 'top', // compactage vertical, pas de chevauchement
      animate: !(reducedMotion?.matches ?? false),
      handle: '.widget-drag-handle',
      draggable: { handle: '.widget-drag-handle', cancel: 'input,textarea,select,option,button:not(.widget__grip)' },
      resizable: { handles: 'se,sw' },
      alwaysShowResizeHandle: true,
      disableDrag: true,
      disableResize: true,
    },
    host,
  );

  /** @type {Map<string, { el: HTMLElement, content: HTMLElement }>} */
  const mounted = new Map();
  let disposed = false;

  const isWide = () => grid.getColumn() === GRID_COLUMNS;
  const nodes = () => grid.getGridItems().map((el) => /** @type {any} */ (el).gridstackNode).filter(Boolean);
  const currentLayout = () => fromGridNodes(nodes());

  /** Enregistre les positions de la grille (à 12 colonnes seulement). */
  function commitLayout() {
    if (disposed || !isWide()) return;
    dashboard.updateLayouts(currentLayout());
  }

  /**
   * @param {string} id
   * @param {number} dx
   * @param {number} dy
   */
  function moveWidget(id, dx, dy) {
    const entry = mounted.get(id);
    if (!entry || !isWide()) return null;
    const next = moveBy(currentLayout(), id, dx, dy, GRID_COLUMNS);
    if (!next) return null;
    grid.update(entry.el, { x: next.x, y: next.y });
    commitLayout();
    return currentLayout()[id] ?? null;
  }

  /**
   * @param {string} id
   * @param {number} dw
   * @param {number} dh
   */
  function resizeWidget(id, dw, dh) {
    const entry = mounted.get(id);
    if (!entry || !isWide()) return null;
    const node = /** @type {any} */ (entry.el).gridstackNode;
    const next = resizeBy(currentLayout(), id, dw, dh, GRID_COLUMNS, { w: node?.minW ?? 2, h: node?.minH ?? 2 });
    if (!next) return null;
    grid.update(entry.el, { w: next.w, h: next.h });
    commitLayout();
    return currentLayout()[id] ?? null;
  }

  /** @param {string} id */
  function renderFrame(id) {
    const entry = mounted.get(id);
    if (!entry) return;
    render(
      html`<${WidgetFrame}
        instanceId=${id}
        isEditing=${ui.getState().isEditing}
        onMove=${(/** @type {number} */ dx, /** @type {number} */ dy) => moveWidget(id, dx, dy)}
        onResize=${(/** @type {number} */ dw, /** @type {number} */ dh) => resizeWidget(id, dw, dh)}
      />`,
      entry.content,
    );
  }

  /** Ajoute les instances nouvelles, retire celles qui ont disparu. */
  function syncInstances() {
    const instances = selectInstances(dashboard.getState());
    const wanted = new Set(instances.map((i) => i.id));
    let changed = false;

    grid.batchUpdate();
    for (const [id, entry] of mounted) {
      if (wanted.has(id)) continue;
      render(null, entry.content); // démonte le widget
      grid.removeWidget(entry.el, true, false);
      mounted.delete(id);
      changed = true;
    }
    const fresh = instances.filter((i) => !mounted.has(i.id));
    for (const item of toGridItems(fresh, getDefinition, grid.getColumn())) {
      // Une instance toute neuve (position très basse) se place à la première case libre.
      const { x, y, ...size } = item;
      const el = grid.addWidget(y >= NEW_INSTANCE_Y ? { ...size, autoPosition: true } : item);
      const content = el?.querySelector('.grid-stack-item-content');
      if (!el || !content) continue;
      mounted.set(item.id, { el, content: /** @type {HTMLElement} */ (content) });
      renderFrame(item.id);
      // Le cadre (barre de titre et poignée) existe maintenant : GridStack doit relire les poignées
      // de glisser, sinon c'est tout l'élément qui servirait de poignée.
      grid.prepareDragDrop(el, true);
      changed = true;
    }
    grid.batchUpdate(false);
    // Après un ajout (ou une suppression), la grille a compacté : on relit les positions.
    if (changed) commitLayout();
  }

  /** Aligne la grille sur le store quand la disposition a changé ailleurs (autre onglet, import). */
  function syncLayouts() {
    if (!isWide()) return;
    const desired = toGridItems(selectInstances(dashboard.getState()), getDefinition, GRID_COLUMNS);
    const actual = currentLayout();
    const stale = desired.filter((d) => {
      const a = actual[d.id];
      return a && (a.x !== d.x || a.y !== d.y || a.w !== d.w || a.h !== d.h);
    });
    if (stale.length === 0) return;
    // Sans gravité le temps de la mise à jour : chaque widget prend exactement sa place, au lieu
    // d'être repoussé par les autres, encore à leur ancienne position.
    grid.batchUpdate();
    grid.mode('float');
    for (const d of stale) {
      const entry = mounted.get(d.id);
      if (entry) grid.update(entry.el, { x: d.x, y: d.y, w: d.w, h: d.h });
    }
    grid.mode('top');
    grid.batchUpdate(false);
  }

  /** Glisser et redimensionner : seulement en mode édition, et seulement à 12 colonnes. */
  function applyEditing() {
    const allowed = ui.getState().isEditing && isWide();
    grid.enableMove(allowed);
    grid.enableResize(allowed);
  }

  let lastEditing = ui.getState().isEditing;
  let lastColumn = grid.getColumn();

  syncInstances();
  // Le passage à une colonne n'est armé qu'une fois les widgets en place à 12 colonnes :
  // leur disposition d'origine est ainsi mémorisée par la grille.
  grid.updateOptions({ columnOpts: { breakpoints: [{ w: SINGLE_COLUMN_BELOW, c: 1 }], columnMax: GRID_COLUMNS, layout: 'list' } });
  lastColumn = grid.getColumn();
  applyEditing();

  grid.on('dragstop', commitLayout);
  grid.on('resizestop', commitLayout);

  const unsubscribeDashboard = dashboard.subscribe(() => {
    syncInstances();
    syncLayouts();
  });

  const unsubscribeUi = ui.subscribe((state) => {
    applyEditing();
    if (state.isEditing !== lastEditing) {
      lastEditing = state.isEditing;
      for (const id of mounted.keys()) renderFrame(id);
    }
  });

  // Changement du nombre de colonnes (fenêtre redimensionnée) : on réarme le glisser, et au
  // retour à 12 colonnes on remet la disposition du store (source de vérité).
  /** @type {number} */
  let frame = 0;
  const onResize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (disposed || grid.getColumn() === lastColumn) return;
      lastColumn = grid.getColumn();
      applyEditing();
      if (isWide()) {
        syncInstances();
        syncLayouts();
      }
    });
  };
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  resizeObserver?.observe(host);
  window.addEventListener('resize', onResize);

  const onMotionChange = () => grid.setAnimation(!(reducedMotion?.matches ?? false));
  reducedMotion?.addEventListener?.('change', onMotionChange);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubscribeDashboard();
    unsubscribeUi();
    resizeObserver?.disconnect();
    window.removeEventListener('resize', onResize);
    reducedMotion?.removeEventListener?.('change', onMotionChange);
    for (const { content } of mounted.values()) render(null, content);
    mounted.clear();
    grid.destroy(false);
  };
}

/** Ajoute la disposition de départ et donne le focus au premier widget. */
function startWithStarterLayout() {
  const ids = applyStarterLayout();
  if (ids.length > 0) focusWidgetSoon(ids[0]);
}

/** Message affiché quand la page n'a aucun widget. */
function EmptyState() {
  const count = useStore(dashboardStore, (state) => selectInstances(state).length);
  if (count > 0) return null;
  return html`
    <div class="dashboard__empty">
      <h2 class="dashboard__empty-title">Ton dashboard est vide</h2>
      <p class="dashboard__empty-text">Les widgets que tu ajouteras apparaîtront ici. Tu pourras ensuite les déplacer et les redimensionner.</p>
      <p class="dashboard__empty-action">
        <${Button} variant="primary" icon="layout-grid" onClick=${startWithStarterLayout}>Commencer avec une disposition type<//>
        <${Button} variant="secondary" icon="plus" onClick=${() => uiStore.openCatalog()}>Ajouter un widget<//>
      </p>
    </div>
  `;
}

/** Grille de widgets de la page active. */
export function Dashboard() {
  const hostRef = useRef(/** @type {HTMLElement | null} */ (null));
  useEffect(() => {
    if (!hostRef.current) return undefined;
    return mountGrid(hostRef.current);
  }, []);
  return html`
    <div class="dashboard">
      <div class="grid-stack" ref=${hostRef}></div>
      <${EmptyState} />
    </div>
  `;
}
