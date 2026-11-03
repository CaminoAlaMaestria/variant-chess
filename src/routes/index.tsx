import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const NexoGame = lazy(() => import("../nexo/Game.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXO — Ajedrez, sin límites" },
      {
        name: "description",
        content: "Tres variantes de ajedrez: Come-come, Correlativo y Azar, con NYX, KAIRO y VEGA.",
      },
      { property: "og:title", content: "NEXO — Ajedrez, sin límites" },
      {
        property: "og:description",
        content: "Juega Come-come, Correlativo y Azar en un mismo tablero.",
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
        <h1 className="text-3xl font-bold">NEXO.</h1>
        <p className="mt-2 text-muted-foreground">Preparando el tablero…</p>
      </div>
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Boot />}>
      <Suspense fallback={<Boot />}>
        <NexoGame />
      </Suspense>
    </ClientOnly>
  );
}
