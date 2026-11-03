import { createFileRoute } from "@tanstack/react-router";

// The engine runs in the player's browser (WebAssembly), not on this server.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          engine: "Fairy-Stockfish 14 (WebAssembly, navegador)",
          version: "0.2.1",
          variants: ["comecome", "correlativo", "azar"],
        }),
    },
  },
});
