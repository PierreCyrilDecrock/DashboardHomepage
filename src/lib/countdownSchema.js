// Schéma Zod de l'état d'une minuterie (CountdownState). Lu dans le stockage, donc toujours validé.

import { z } from './vendor.js';
import { MAX_DURATION_MS, MIN_DURATION_MS } from './countdown.js';

const durationMs = z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS);
/** Un instant, en millisecondes depuis 1970. */
const instant = z.number().int().min(0);

export const countdownSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle'), durationMs }),
  z.object({ status: z.literal('running'), durationMs, endsAt: instant }),
  z.object({ status: z.literal('paused'), durationMs, remainingMs: z.number().int().min(0).max(MAX_DURATION_MS) }),
  z.object({ status: z.literal('done'), durationMs, finishedAt: instant }),
]);
