// Browser-side access to the Fairy-Stockfish worker. Replaces the original
// /api/move and /api/evaluate calls; returns the same data shapes.
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error("Motor no disponible"));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function call(type, payload, signal) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("El motor ha tardado demasiado."));
    }, 20000);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    signal?.addEventListener("abort", () => {
      if (pending.delete(id)) {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }
    });
    getWorker().postMessage({ id, type, payload });
  });
}

export const engineMove = (state, level, signal) => call("move", { state, level }, signal);
export const engineEvaluate = (fen, variant) => call("evaluate", { fen, variant });
