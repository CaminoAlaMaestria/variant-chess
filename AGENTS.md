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
- /api/move and /api/evaluate must return 503 until a real engine is attached — never fake Stockfish moves or scores.
