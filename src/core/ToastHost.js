// Affiche les notifications du toastStore, en bas de l'écran.

import { html } from '../lib/vendor.js';
import { Toast } from '../ui/Toast.js';
import { toastStore } from './store/toastStore.js';
import { useStore } from './store/useStore.js';

export function ToastHost() {
  const { toasts } = useStore(toastStore);
  if (toasts.length === 0) return null;
  return html`
    <div class="toasts">
      ${toasts.map(
        (t) => html`<${Toast}
          key=${t.id}
          message=${t.message}
          actionLabel=${t.actionLabel}
          focusAction=${t.focusAction}
          onAction=${() => toastStore.runAction(t.id)}
          onDismiss=${() => toastStore.dismiss(t.id)}
        />`,
      )}
    </div>
  `;
}
