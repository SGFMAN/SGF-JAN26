/** Short WebAudio stings. Silent until the player turns sound on. */

export function createIslandAudio() {
  let ctx = null;
  let ocean = null;
  let muted = true;
  let lastStep = 0;

  function context() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function startOcean() {
    const audio = context();
    if (ocean) return;
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.98;
      data[i] = brown * 3.2;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = audio.createGain();
    gain.gain.value = 0.045;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start();
    ocean = { source, gain };
  }

  function tone(freq, dur, type, gainValue) {
    if (muted) return;
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
        startOcean();
        if (audio.state === "suspended") await audio.resume();
        if (ocean) ocean.gain.gain.value = 0.045;
      } else if (ocean) {
        ocean.gain.gain.value = 0;
      }
      return muted;
    },
    step(now) {
      if (muted || now - lastStep < 0.32) return;
      lastStep = now;
      tone(90 + Math.random() * 30, 0.05, "triangle", 0.03);
    },
    take() {
      tone(520, 0.08, "square", 0.04);
      tone(740, 0.1, "square", 0.03);
    },
    success() {
      tone(523, 0.12, "triangle", 0.05);
      setTimeout(() => tone(659, 0.12, "triangle", 0.05), 90);
      setTimeout(() => tone(784, 0.18, "triangle", 0.05), 180);
    },
    stop() {
      try {
        ocean?.source.stop();
      } catch {
        /* already stopped */
      }
      ocean = null;
      ctx?.close();
      ctx = null;
    },
  };
}
