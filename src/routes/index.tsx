import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import Cinematic from "../nexo/Cinematic.jsx";
import { INTRO } from "../nexo/scenes";
import OfflineBadge from "../nexo/OfflineBadge";

const NexoGame = lazy(() => import("../nexo/Game.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Evolution Chess — Ajedrez, sin límites" },
      {
        name: "description",
        content:
          "Cinco variantes de ajedrez: Come-come, Correlativo, Azar, Renacer y El suelo es lava, con NYX, KAIRO, VEGA, IRIS e IGNIS.",
      },
      { property: "og:title", content: "Evolution Chess — Ajedrez, sin límites" },
      {
        property: "og:description",
        content: "Juega Come-come, Correlativo, Azar, Renacer y El suelo es lava en un mismo tablero.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Boot() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-center text-foreground">
      <div>
        <h1 className="text-3xl font-bold">Evolution Chess.</h1>
        <p className="mt-2 text-muted-foreground">Preparando el tablero…</p>
      </div>
    </div>
  );
}

function Index() {
  // Shown on every document load; state lives here so tab switches, rotation or variant changes never replay it.
  const [introDone, setIntroDone] = useState(false);
  return (
    <ClientOnly fallback={<Boot />}>
      {introDone ? (
        <Suspense fallback={<Boot />}>
          <NexoGame />
        </Suspense>
      ) : (
        <Cinematic {...INTRO} onDone={() => setIntroDone(true)} />
      )}
      <OfflineBadge />
    </ClientOnly>
  );
}
