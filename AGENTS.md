<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The NEXO game lives in src/nexo (ported verbatim, client-only via ClientOnly + lazy) — keep game rules there and ask the owner before changing any rule.
- The bot engine is real Fairy-Stockfish 14 compiled to single-threaded WebAssembly (public/wasm, glue+worker in src/nexo/engine; source patch in licenses/fairy-stockfish-wasm.patch) because the hosting cannot run native binaries; the worker mirrors the original server.js logic. Never fake moves or scores; /api/move and /api/evaluate stay 503 stubs.
- Campaign progress (seals/crew) lives in src/nexo/campaign.js under its own versioned localStorage key, never inside the saved game, so either can fail or reset without touching the other.
- Videos in public/videos are runtime-cached by the service worker (CacheFirst + rangeRequests) and fetched whole by offline.ts; when a video file changes, rename it or bump the cache name so old and new never mix.
