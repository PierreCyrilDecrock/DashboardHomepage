// Seul point d'entrée vers les bibliothèques copiées dans vendor/.
// Le cœur et les widgets importent Preact, Zod et SortableJS UNIQUEMENT d'ici.
// (GridStack fait exception : seul src/core/dashboard/Dashboard.js l'importe,
// directement depuis vendor/gridstack.js.)

export {
  h,
  html,
  render,
  Fragment,
  Component,
  createContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
} from '../../vendor/preact.js';

export { z } from '../../vendor/zod.js';
export { Sortable } from '../../vendor/sortable.js';
