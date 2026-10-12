/* groovesmaxxing scan capture worklet (site review build, 2026-10-11).
   runs off the main thread and posts raw float samples to the page in blocks of 2048.
   the page writes the wav. scan.html falls back to ScriptProcessorNode where worklets are missing. */
class GmxCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      let i = 0;
      while (i < ch.length) {
        const take = Math.min(ch.length - i, this.buf.length - this.n);
        this.buf.set(ch.subarray(i, i + take), this.n); this.n += take; i += take;
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('gmx-capture', GmxCapture);
