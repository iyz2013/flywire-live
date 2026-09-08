export class NeuralRuntime {
  constructor(view, status, isLive) {
    this.view = view; this.status = status; this.isLive = isLive; this.ready = false; this.pending = false; this.generation = 0; this.resetting = false;
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onerror = () => this.fail('Neural compute unavailable');
    this.worker.onmessage = ({ data: m }) => {
      if (m.type === 'connections') view.setConnections?.(m.pairs);
      if (m.type === 'stage') status.textContent = m.message;
      if (m.type === 'progress') status.textContent = `Loading neural weights · ${Math.round(m.value * 100)}%`;
      if (m.type === 'ready') {
        this.ready = true; this.backend = m.backend;
        status.textContent = `${m.backend === 'gpu' ? 'WebGPU' : 'CPU'} neural simulation · ready`;
        this.step();
      }
      if (m.type === 'reset' && m.generation === this.generation) { this.resetting=false; this.pending=false; this.step(); }
      if (m.type === 'result' && m.generation === this.generation) {
        this.pending = false;
        if (isLive()) {
          view.result(m.firing, m.counts, m.tick);
          status.textContent = `${this.backend === 'gpu' ? 'WebGPU' : 'CPU'} · ${m.firing.length.toLocaleString()} firing neurons`;
        }
        this.timer = setTimeout(() => this.step(), document.hidden ? 500 : 50);
      }
      if (m.type === 'error') this.fail(m.message);
    };
    this.worker.postMessage({ type: 'init', backend: 'gpu', assetBase: new URL(import.meta.env.BASE_URL, document.baseURI).href });
  }
  step() { if (!this.ready || this.pending || this.resetting) return; this.pending = true; this.worker.postMessage({ type: 'step', generation: this.generation, silenced: false }); }
  pulse(indices, gain) {
    if (this.ready && !this.resetting && indices.length) this.worker.postMessage({ type: 'pulse', indices: Uint32Array.from(indices), strength: gain * 180, profile: 'paint', replace: false });
  }
  reset() {
    this.view.reset();
    if (!this.ready) return;
    clearTimeout(this.timer); this.generation++; this.resetting=true;
    this.worker.postMessage({type:'reset',generation:this.generation});
  }
  fail(message) { this.ready = false; this.worker.terminate(); clearTimeout(this.timer); this.status.textContent = `Neural compute stopped · ${message}`; }
}
