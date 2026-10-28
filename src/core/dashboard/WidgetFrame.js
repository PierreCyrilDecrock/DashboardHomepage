// Cadre d'un widget : retrouve la définition du type, valide les réglages et les données,
// fournit ses props au composant, et l'isole dans une barrière d'erreur.
//
// Le cadre s'abonne à SON instance et à SES données seulement (sélecteurs fins) : modifier
// un widget ne redessine pas les autres.

import { Component, html, useCallback, useLayoutEffect, useEffect, useMemo, useRef, useState } from '../../lib/vendor.js';
import { countRender } from '../../lib/devMode.js';
import { loadStyle } from '../../lib/loadStyle.js';
import { Icon } from '../../ui/icons.js';
import { getDefinition } from '../../widgets/registry.js';
import { dashboardStore, selectInstance } from '../store/dashboardStore.js';
import { dataStore } from '../store/dataStore.js';
import { useStore } from '../store/useStore.js';
import { applyDataUpdate, resolveValue } from './frameLogic.js';
import { backupInstance } from './instanceBackup.js';
import { UnknownWidget } from './UnknownWidget.js';
import { dashboardActions } from './actions.js';
import { WidgetMenu } from './WidgetMenu.js';

/**
 * Barrière d'erreur : si le widget plante au rendu, seul son cadre affiche le bloc de secours.
 */
class WidgetErrorBoundary extends Component {
  /** @param {any} props */
  constructor(props) {
    super(props);
    /** @type {{ error: Error | null }} */
    this.state = { error: null };
  }

  /** @param {Error} error */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /** @param {Error} error */
  componentDidCatch(error) {
    console.error(`Le widget « ${this.props.type} » (${this.props.instanceId}) a planté :`, error);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return html`
      <div class="widget__error" role="alert">
        <p class="widget__error-title">Ce widget a rencontré une erreur.</p>
        <p class="widget__error-message">${error.message || String(error)}</p>
        <button
          type="button"
          class="widget__button"
          onClick=${() => {
            this.props.onReset();
            this.setState({ error: null });
          }}
        >
          Réinitialiser ce widget
        </button>
      </div>
    `;
  }
}

/** Touches fléchées de la poignée : déplacement (ou, avec Maj, redimensionnement) d'une case. */
const ARROWS = /** @type {Record<string, [number, number]>} */ ({
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
});

/**
 * Phrase annoncée aux lecteurs d'écran après un déplacement ou un redimensionnement.
 * @param {string} title
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} rect
 */
export function describePlacement(title, rect) {
  if (!rect) return `${title} : la disposition ne peut pas être modifiée dans cet affichage.`;
  return `${title} : colonne ${rect.x + 1}, ligne ${rect.y + 1}, ${rect.w} ${rect.w > 1 ? 'colonnes' : 'colonne'} sur ${rect.h} ${rect.h > 1 ? 'lignes' : 'ligne'}`;
}

/**
 * @typedef {Object} FrameChrome
 * @property {boolean} [isEditing]
 * @property {(dx: number, dy: number) => ({ x: number, y: number, w: number, h: number } | null)} [onMove] fournie par Dashboard.js
 * @property {(dw: number, dh: number) => ({ x: number, y: number, w: number, h: number } | null)} [onResize] fournie par Dashboard.js
 */

/**
 * Enveloppe commune des cadres (widget connu ou indisponible) : barre de titre, poignée de
 * déplacement (mode édition), zone d'annonce et corps (inerte en mode édition).
 * @param {FrameChrome & { instanceId: string, type: string, title: string, icon: string, className?: string, hasSettings?: boolean, children: any }} props
 */
function FrameShell({ instanceId, type, title, icon, className = '', isEditing = false, hasSettings = false, onMove, onResize, children }) {
  const [announcement, setAnnouncement] = useState('');
  const titleId = `widget-title-${instanceId}`;

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    const direction = ARROWS[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    const rect = event.shiftKey ? onResize?.(direction[0], direction[1]) : onMove?.(direction[0], direction[1]);
    // Un texte identique ne serait pas relu : on alterne une espace insécable en fin de phrase.
    setAnnouncement((previous) => describePlacement(title, rect) + (previous.endsWith('\u00a0') ? '' : '\u00a0'));
  };

  return html`
    <section
      class=${`widget ${isEditing ? 'widget--editing' : ''} ${className}`.trim()}
      data-widget-type=${type}
      data-instance-id=${instanceId}
      aria-labelledby=${titleId}
      tabindex="-1"
    >
      <header class="widget__bar widget-drag-handle">
        <${Icon} name=${icon} size=${18} />
        <h2 class="widget__title" id=${titleId}>${title}</h2>
        <${WidgetMenu} instanceId=${instanceId} title=${title} hasSettings=${hasSettings} />
        <button
          type="button"
          class="widget__grip widget-drag-handle"
          hidden=${!isEditing}
          aria-label=${`Déplacer ${title} : flèches pour déplacer, Maj et flèches pour redimensionner`}
          onKeyDown=${onKeyDown}
        >
          <${Icon} name="grip-vertical" size=${20} />
        </button>
      </header>
      <p class="visually-hidden" role="status" aria-live="polite" data-testid="placement">${announcement}</p>
      <div class="widget__body" inert=${isEditing}>${children}</div>
    </section>
  `;
}

/**
 * Widget dont le type est connu.
 * @param {{ instance: import('../types.js').WidgetInstance, entry: import('../types.js').StoredData<unknown> | undefined,
 *   definition: import('../../widgets/types.js').WidgetDefinition<any, any> } & FrameChrome} props
 */
function KnownWidget({ instance, entry, definition, isEditing, onMove, onResize }) {
  const { id: instanceId } = instance;
  countRender(instanceId); // mode ?dev=1 seulement
  const settings = useMemo(
    () => resolveValue(definition.settingsSchema, instance.settings, definition.defaultSettings),
    [definition, instance.settings],
  );
  const data = useMemo(() => resolveValue(definition.dataSchema, entry?.data, definition.defaultData), [definition, entry?.data]);

  // Feuille de style propre au widget, ajoutée une seule fois.
  useLayoutEffect(() => {
    if (definition.styleUrl) loadStyle(definition.styleUrl);
  }, [definition]);

  // Contenu invalide : on garde une copie avant qu'il soit écrasé. Le widget travaille,
  // lui, avec les valeurs par défaut ; rien n'est effacé tant qu'il ne modifie pas ses données.
  const backedUp = useRef(/** @type {{ settings: unknown, data: unknown }} */ ({ settings: Symbol(), data: Symbol() }));
  useEffect(() => {
    const badSettings = !settings.valid && backedUp.current.settings !== instance.settings;
    const badData = !data.valid && backedUp.current.data !== entry?.data;
    if (!badSettings && !badData) return;
    if (badSettings) backedUp.current.settings = instance.settings;
    if (badData) backedUp.current.data = entry?.data;
    console.warn(
      `Widget ${instanceId} : contenu invalide écarté (${[!settings.valid && `réglages : ${settings.reason}`, !data.valid && `données : ${data.reason}`].filter(Boolean).join(' ; ')}).`,
    );
    backupInstance(instanceId, { settings: instance.settings, data: entry?.data, savedAt: Date.now() });
  }, [settings, data, instance.settings, entry?.data, instanceId]);

  const updateSettings = useCallback(
    /** @param {Record<string, unknown>} patch */
    (patch) => {
      const result = dashboardActions.updateInstanceSettings(instanceId, patch);
      if (!result.ok) console.warn(`Widget ${instanceId} : réglages refusés (${result.error}).`);
    },
    [instanceId],
  );

  const updateData = useCallback(
    /** @param {(current: any) => any} updater */
    (updater) => {
      const raw = dataStore.getData(instanceId)?.data;
      const current = resolveValue(definition.dataSchema, raw, definition.defaultData);
      const applied = applyDataUpdate(definition.dataSchema, current.value, updater);
      if (applied === null) return;
      if (!applied.ok) {
        console.warn(`Widget ${instanceId} : données refusées (${applied.reason}).`);
        return;
      }
      dataStore.setData(instanceId, applied.data, { version: definition.version });
    },
    [definition, instanceId],
  );

  // « Réinitialiser ce widget » : copie de l'ancien contenu, puis données par défaut.
  const reset = useCallback(() => {
    const previous = dataStore.getData(instanceId);
    backupInstance(instanceId, { settings: selectInstance(instanceId)(dashboardStore.getState())?.settings, data: previous?.data, savedAt: Date.now() });
    dataStore.setData(instanceId, structuredClone(definition.defaultData), { version: definition.version });
  }, [definition, instanceId]);

  const title = instance.title ?? definition.name;
  const WidgetComponent = definition.Component;

  return html`
    <${FrameShell}
      instanceId=${instanceId}
      type=${instance.type}
      title=${title}
      icon=${definition.icon}
      isEditing=${isEditing}
      hasSettings=${typeof definition.SettingsPanel === 'function'}
      onMove=${onMove}
      onResize=${onResize}
    >
      <${WidgetErrorBoundary} type=${instance.type} instanceId=${instanceId} onReset=${reset}>
        <${WidgetComponent}
          instanceId=${instanceId}
          settings=${settings.value}
          data=${data.value}
          isEditing=${isEditing}
          size=${{ w: instance.layout.w, h: instance.layout.h }}
          updateSettings=${updateSettings}
          updateData=${updateData}
        />
      <//>
    <//>
  `;
}

/**
 * Cadre d'une instance de widget, désignée par son identifiant. Dashboard.js fournit
 * isEditing, onMove et onResize ; le widget, lui, ne reçoit que ses props.
 * @param {{ instanceId: string } & FrameChrome} props
 */
export function WidgetFrame({ instanceId, isEditing = false, onMove, onResize }) {
  const instance = useStore(dashboardStore, selectInstance(instanceId));
  const entry = useStore(dataStore, (state) => state.byId[instanceId]);
  if (instance === undefined) return null;

  const definition = getDefinition(instance.type);
  if (definition === undefined) {
    return html`
      <${FrameShell}
        instanceId=${instanceId}
        type=${instance.type}
        title=${instance.title ?? instance.type}
        icon="layout-grid"
        className="widget--unknown"
        isEditing=${isEditing}
        onMove=${onMove}
        onResize=${onResize}
      >
        <${UnknownWidget} type=${instance.type} />
      <//>
    `;
  }
  return html`<${KnownWidget}
    instance=${instance}
    entry=${entry}
    definition=${definition}
    isEditing=${isEditing}
    onMove=${onMove}
    onResize=${onResize}
  />`;
}
