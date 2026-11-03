import { createFileRoute } from "@tanstack/react-router";

// The native Fairy-Stockfish binary cannot run on this hosting. Report that honestly.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          engine: null,
          engineAvailable: false,
          version: "0.2.1",
          variants: ["comecome", "correlativo", "azar"],
        }),
    },
  },
});
