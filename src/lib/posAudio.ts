/**
 * Audio synthesizer for POS sound effects using Web Audio API.
 * Works natively in all modern browsers without external asset dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Subtle pop/blip sound when tapping (+) on a product to add to cart.
 */
export function playAddToCartSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.05); // A5

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch (e) {
    // Ignore audio playback errors if audio context blocked
  }
}

/**
 * Classic cash register "ka-ching!" chime when completing a sale.
 */
export function playCashRegisterSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Bell chime 1 (High tone)
    const bell1 = ctx.createOscillator();
    const bell1Gain = ctx.createGain();
    bell1.type = 'sine';
    bell1.frequency.setValueAtTime(1567.98, now); // G6
    bell1Gain.gain.setValueAtTime(0.2, now);
    bell1Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    bell1.connect(bell1Gain);
    bell1Gain.connect(ctx.destination);
    bell1.start(now);
    bell1.stop(now + 0.5);

    // Bell chime 2 (Major third harmonic)
    const bell2 = ctx.createOscillator();
    const bell2Gain = ctx.createGain();
    bell2.type = 'sine';
    bell2.frequency.setValueAtTime(1975.53, now); // B6
    bell2Gain.gain.setValueAtTime(0.15, now);
    bell2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    bell2.connect(bell2Gain);
    bell2Gain.connect(ctx.destination);
    bell2.start(now);
    bell2.stop(now + 0.6);

    // "Ching" metallic coin burst 1
    const coin1 = ctx.createOscillator();
    const coin1Gain = ctx.createGain();
    coin1.type = 'triangle';
    coin1.frequency.setValueAtTime(3200, now + 0.07);
    coin1.frequency.exponentialRampToValueAtTime(1800, now + 0.16);
    coin1Gain.gain.setValueAtTime(0.001, now);
    coin1Gain.gain.setValueAtTime(0.12, now + 0.07);
    coin1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    coin1.connect(coin1Gain);
    coin1Gain.connect(ctx.destination);
    coin1.start(now + 0.07);
    coin1.stop(now + 0.23);

    // "Ching" metallic coin burst 2 (drawer slide / coin rattle)
    const coin2 = ctx.createOscillator();
    const coin2Gain = ctx.createGain();
    coin2.type = 'sine';
    coin2.frequency.setValueAtTime(2600, now + 0.14);
    coin2.frequency.exponentialRampToValueAtTime(2200, now + 0.32);
    coin2Gain.gain.setValueAtTime(0.001, now);
    coin2Gain.gain.setValueAtTime(0.1, now + 0.14);
    coin2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    coin2.connect(coin2Gain);
    coin2Gain.connect(ctx.destination);
    coin2.start(now + 0.14);
    coin2.stop(now + 0.42);
  } catch (e) {
    // Ignore audio playback errors if audio context blocked
  }
}
