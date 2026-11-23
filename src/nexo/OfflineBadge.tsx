import { useEffect, useState } from "react";
import { prepareOffline, subscribe, type OfflineStatus } from "./offline";

export default function OfflineBadge() {
  const [s, setS] = useState<OfflineStatus>("unsupported");
  const [d, setD] = useState("");
  useEffect(() => {
    const off = subscribe((x, y) => (setS(x), setD(y || "")));
    prepareOffline();
    return () => void off();
  }, []);
  if (s === "unsupported") return null;
  const text =
    s === "ready"
      ? "Disponible sin conexión"
      : s === "partial"
        ? `Juego disponible sin conexión · ${d}`
        : s === "preparing" ? "Preparando modo sin conexión…" : `Sin conexión no disponible (${d})`;
  return (
    <div role="status" className="fixed bottom-2 right-2 z-50 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-card-foreground shadow">
      <span>{text}</span>
      {(s === "error" || s === "partial") && (
        <button className="rounded bg-primary px-2 py-0.5 text-primary-foreground" onClick={() => prepareOffline()}>
          Reintentar
        </button>
      )}
    </div>
  );
}
