// Le son d'alarme : trois courts bips synthétisés (aucun fichier audio).
//
// La fonction reçoit un AudioContext déjà créé (et « amorcé » par un clic) : elle ne touche à aucune
// API globale, donc l'extension navigateur pourra la rappeler telle quelle depuis son document hors écran.

/** Réglages du son : trois bips de 150 ms, sinus à 880 Hz, séparés par 150 ms de silence. */
export const BEEP_COUNT = 3;
export const BEEP_FREQUENCY_HZ = 880;
export const BEEP_DURATION_MS = 150;
export const BEEP_GAP_MS = 150;
/** Volume maximal d'un bip (0 à 1), volontairement modéré. */
export const BEEP_VOLUME = 0.25;
/** Durée de la montée et de la descente du volume, pour éviter les claquements. */
const RAMP_SECONDS = 0.01;

/**
 * Durée totale du son, en millisecondes.
 * @returns {number}
 */
export function getBeepsDurationMs() {
  return BEEP_COUNT * BEEP_DURATION_MS + (BEEP_COUNT - 1) * BEEP_GAP_MS;
}

/**
 * Programme trois bips à partir de l'instant courant du contexte audio.
 * @param {{
 *   currentTime: number,
 *   destination: unknown,
 *   createOscillator: () => any,
 *   createGain: () => any,
 * }} audioContext
 * @returns {number} durée totale du son, en millisecondes
 */
export function playBeeps(audioContext) {
  const length = BEEP_DURATION_MS / 1000;
  const period = (BEEP_DURATION_MS + BEEP_GAP_MS) / 1000;
  // Un léger retard de départ évite de programmer un bip dans le passé.
  const origin = audioContext.currentTime + 0.02;
  for (let i = 0; i < BEEP_COUNT; i++) {
    const startAt = origin + i * period;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = BEEP_FREQUENCY_HZ;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(BEEP_VOLUME, startAt + RAMP_SECONDS);
    gain.gain.setValueAtTime(BEEP_VOLUME, startAt + length - RAMP_SECONDS);
    gain.gain.linearRampToValueAtTime(0, startAt + length);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + length);
  }
  return getBeepsDurationMs();
}
