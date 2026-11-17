/** Short WebAudio stings. Silent until the player turns sound on. */

export function createJungleAudio() {
  let ctx = null;
  let tickTimer = 0;
  let muted = true;
  let lastStep = 0;
  let alive = true;

  function context() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function tone(freq, dur, type, gainValue) {
    if (muted || !alive) return;
    const audio = context();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  }

  return {
    isMuted: () => muted,
    async toggle() {
      muted = !muted;
      if (!muted) {
        const audio = context();
        if (audio.state === "suspended") await audio.resume();
      }
      return muted;
    },
    step(now) {
      if (muted || now - lastStep < 0.32) return;
      lastStep = now;
      tone(55 + Math.random() * 18, 0.06, "sine", 0.032);
      tone(120 + Math.random() * 30, 0.04, "triangle", 0.018);
    },
    ambience(now) {
      if (muted || now < tickTimer) return;
      tickTimer = now + 1.4;
      tone(220, 0.05, "sine", 0.014);
      tone(165, 0.08, "triangle", 0.016);
      tone(90, 0.12, "sine", 0.022);
    },
    take() {
      tone(320, 0.08, "square", 0.034);
      tone(480, 0.1, "triangle", 0.028);
    },
    success() {
      tone(294, 0.14, "sine", 0.048);
      setTimeout(() => tone(392, 0.14, "sine", 0.045), 120);
      setTimeout(() => tone(523, 0.22, "triangle", 0.042), 240);
    },
    stop() {
      alive = false;
      ctx?.close();
      ctx = null;
    },
  };
}
