/** Short WebAudio stings. Silent until the player turns sound on. */

export function createTownAudio() {
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
      tone(70 + Math.random() * 24, 0.05, "triangle", 0.028);
    },
    ambience(now) {
      if (muted || now < tickTimer) return;
      tickTimer = now + 1;
      tone(180, 0.03, "square", 0.012);
      tone(90, 0.05, "sine", 0.02);
    },
    take() {
      tone(480, 0.07, "square", 0.035);
      tone(720, 0.09, "square", 0.025);
    },
    success() {
      tone(392, 0.12, "triangle", 0.05);
      setTimeout(() => tone(523, 0.12, "triangle", 0.05), 110);
      setTimeout(() => tone(659, 0.2, "triangle", 0.05), 220);
    },
    stop() {
      alive = false;
      ctx?.close();
      ctx = null;
    },
  };
}
