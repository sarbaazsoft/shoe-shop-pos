// Physical Counter Audio Feedback using Web Audio API

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Auto-unlock AudioContext on first user interaction in browser
if (typeof window !== 'undefined') {
  const unlock = () => {
    getAudioContext();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('keydown', unlock, { once: true, passive: true });
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
}

// LocalStorage key for persisting terminal mute state
const MUTE_STORAGE_KEY = 'pos_audio_muted';

let isMutedState = false;

if (typeof window !== 'undefined') {
  try {
    isMutedState = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    isMutedState = false;
  }
}

export const isAudioMuted = (): boolean => isMutedState;

export const setAudioMuted = (muted: boolean): void => {
  isMutedState = muted;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
    window.dispatchEvent(new CustomEvent('pos_audio_mute_changed', { detail: { muted } }));
  } catch {}
};

export const toggleAudioMuted = (): boolean => {
  const next = !isMutedState;
  setAudioMuted(next);
  return next;
};

export const playAudioFeedback = {
  isMuted: isAudioMuted,
  setMuted: setAudioMuted,
  toggleMute: toggleAudioMuted,

  // Crisp scanner beep on barcode recognition (Zebra / Honeywell laser beep)
  barcodeScan: () => {
    if (isMutedState) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1900, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // Ignore audio errors if blocked
    }
  },

  // Pleasant two-tone chime when barcode is accepted and added to the invoice/order
  invoiceItemAdded: () => {
    if (isMutedState) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      // Tone 1: 1400 Hz
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1400, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.06);

      // Tone 2: 1880 Hz
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1880, now + 0.05);
      gain2.gain.setValueAtTime(0.16, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.14);
    } catch {
      // Ignore
    }
  },

  saleSuccess: () => {
    if (isMutedState) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        gain.gain.setValueAtTime(0.1, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.2);
      });
    } catch {
      // Ignore
    }
  },

  success: () => {
    playAudioFeedback.saleSuccess();
  },

  // Warning tone for minimum price violation or insufficient stock
  warning: () => {
    if (isMutedState) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [350, 280].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.09, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.1);
      });
    } catch {
      // Ignore
    }
  },
};
