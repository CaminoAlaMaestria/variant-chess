import { createFileRoute } from "@tanstack/react-router";

// No engine is attached yet; never return invented moves.
export const Route = createFileRoute("/api/move")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { error: "Motor no disponible en este alojamiento. El juego local sigue funcionando." },
          { status: 503 },
        ),
    },
  },
});
