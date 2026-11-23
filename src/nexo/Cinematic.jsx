import { useEffect, useRef, useState } from "react";

// Full-screen video scene. The skip button is HTML, visible from the first instant,
// and works while loading, on error and offline. Orientation is chosen once at mount.
export default function Cinematic({ name, skipLabel, playLabel, fallback, onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(false);
  const [vertical] = useState(() => window.innerHeight > window.innerWidth);
  const reduced = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)[0];
  const [state, setState] = useState(reduced ? "idle" : "loading"); // loading|playing|paused|idle|error
  const [muted, setMuted] = useState(false);
  const src = `/videos/${name}-${vertical ? "vertical" : "horizontal"}.mp4`;
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    ref.current?.pause();
    onDone();
  };
  async function play() {
    const v = ref.current;
    if (!v) return;
    try {
      v.muted = false;
      await v.play();
      setMuted(false);
    } catch {
      try {
        v.muted = true;
        await v.play();
        setMuted(true);
      } catch {
        setState((st) => (v.error || st === "error" ? "error" : "idle"));
      }
    }
  }
  useEffect(() => {
    if (!reduced) play();
    const t = setTimeout(() => setState((s) => (s === "loading" ? "error" : s)), 10000);
    const key = (e) => e.key === "Escape" && finish();
    window.addEventListener("keydown", key);
    return () => (clearTimeout(t), window.removeEventListener("keydown", key));
  }, []);
  const btn = "rounded-md border border-border bg-card/80 px-4 py-2.5 text-sm font-semibold text-card-foreground backdrop-blur hover:bg-card";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background" role="dialog" aria-modal="true" aria-label={fallback.title}>
      <video
        ref={ref}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        aria-describedby="cinematic-text"
        onPlaying={() => setState("playing")}
        onPause={() => !doneRef.current && setState((s) => (s === "playing" ? "paused" : s))}
        onEnded={finish}
        onError={() => setState("error")}
      />
      <p id="cinematic-text" className="sr-only">{fallback.text}</p>
      <button
        autoFocus
        onClick={finish}
        className={btn + " absolute"}
        style={{ top: "max(12px, env(safe-area-inset-top))", right: "max(12px, env(safe-area-inset-right))" }}
      >
        {skipLabel}
      </button>
      {(state === "playing" || state === "paused") && (
        <div className="absolute flex gap-2" style={{ bottom: "max(12px, env(safe-area-inset-bottom))", left: "max(12px, env(safe-area-inset-left))" }}>
          <button className={btn} onClick={() => (state === "playing" ? ref.current?.pause() : ref.current?.play())}>
            {state === "playing" ? "Pausar" : "Reanudar"}
          </button>
          <button
            className={btn}
            onClick={() => {
              const v = ref.current;
              if (v) (v.muted = !v.muted), setMuted(v.muted);
            }}
          >
            {muted ? "Activar sonido" : "Silenciar"}
          </button>
        </div>
      )}
      {state === "idle" && (
        <div className="absolute flex flex-col items-center gap-3">
          <button className={btn} onClick={play}>{playLabel}</button>
          <button className={btn} onClick={finish}>{skipLabel}</button>
        </div>
      )}
      {state === "error" && (
        <div className="absolute mx-4 max-w-md rounded-lg border border-border bg-card p-5 text-center text-card-foreground">
          <p className="font-semibold">{fallback.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">No se pudo cargar el vídeo. {fallback.text}</p>
          <button className={btn + " mt-4"} onClick={finish}>Continuar</button>
        </div>
      )}
    </div>
  );
}
