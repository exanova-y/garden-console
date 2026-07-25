# Garden Console Style

This project follows the virtues in `../garden/STYLE.md`.

- Be locally precise and globally playful.
- Prefer mutually exclusive, collectively exhaustive domain boundaries.
- Keep the smallest correct structure; do not add architecture in anticipation.
- Use `pnpm add` for TypeScript dependencies and `uv add` for Python dependencies.
- Use oxlint and Prettier for TypeScript and Ruff for future Python research.
- Run Python through `uv run`, never bare `python` or `python3`.
- Track model-fitting runs in Weights & Biases; use Cloudflare observability for runtime operations.
- Put representative visual output in `examples`; keep scratch output untracked.
- Never commit plaintext secrets. Use committed `.env.op` references after the
  1Password CLI is installed and the relevant vault items exist.
- Pause after a stage and update the README with minimal edits.

The 1Password CLI is not currently installed on this machine, so secret-bearing
deployment work must wait until that prerequisite is available. Do not replace
the intended `op://` flow with plaintext environment files.
