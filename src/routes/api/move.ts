import { createFileRoute } from "@tanstack/react-router";

// No engine is attached yet; never return invented moves.
export const Route = createFileRoute("/api/move")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { error: "El motor se ejecuta en el navegador; este punto de acceso no se usa." },
          { status: 503 },
        ),
    },
  },
});
