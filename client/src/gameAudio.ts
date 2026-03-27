/**
 * Оригинальный синтез (настроение synthwave / «странные дела»), без чужих записей и MP3.
 */

type Ctrl = {
  start: () => void;
  stop: () => void;
  setMuted: (m: boolean) => void;
  playClick: () => void;
  isRunning: () => boolean;
};

function createSynthAmbient(): Ctrl {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let bass: OscillatorNode | null = null;
  let arpTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let muted = false;

  const arpNotes = [130.81, 155.56, 174.61, 196.0, 233.08, 261.63];
  let arpStep = 0;

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.11;
      master.connect(ctx.destination);
    }
    return { ctx, master };
  }

  function applyMute() {
    if (master) master.gain.value = muted ? 0 : 0.11;
  }

  function playArpPluck() {
    const { ctx: c, master: m } = ensure();
    if (!c || !m || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    const f = arpNotes[arpStep % arpNotes.length];
    arpStep++;
    osc.type = 'triangle';
    osc.frequency.value = f;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.7;
    osc.connect(filt);
    filt.connect(g);
    g.connect(m);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.048, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  return {
    start() {
      const { ctx: c, master: m } = ensure();
      if (!c || !m || running) return;
      running = true;
      void c.resume();
      applyMute();

      bass = c.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = 49.0;
      const bg = c.createGain();
      bg.gain.value = 0.06;
      bass.connect(bg);
      bg.connect(m);
      bass.start();

      arpTimer = setInterval(() => playArpPluck(), 520);
    },

    stop() {
      if (arpTimer != null) {
        clearInterval(arpTimer);
        arpTimer = null;
      }
      try {
        bass?.stop();
      } catch {
        /* */
      }
      bass = null;
      running = false;
    },

    setMuted(m: boolean) {
      muted = m;
      applyMute();
    },

    playClick() {
      if (muted) return;
      const { ctx: c, master: m } = ensure();
      if (!c || !m) return;
      void c.resume();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'square';
      osc.frequency.value = 380;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      osc.connect(lp);
      lp.connect(g);
      g.connect(m);
      g.gain.setValueAtTime(0.055, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.048);
      osc.start(t);
      osc.stop(t + 0.05);
    },

    isRunning: () => running,
  };
}

let singleton: Ctrl | null = null;

export function getGameAudio(): Ctrl {
  if (!singleton) singleton = createSynthAmbient();
  return singleton;
}
