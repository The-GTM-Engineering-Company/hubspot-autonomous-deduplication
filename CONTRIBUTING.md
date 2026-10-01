# Contributing

Use a branch and pull request for changes. Describe the behavior changed, tests performed, and whether a new live pilot is required. Keep production authorization and client-specific matching overrides in the generated client's configuration.

Run `npm ci` and `npm test` from `assets/worker/` with Node.js 22+ and Google Chrome installed. The suite uses synthetic data. Never point tests or CI at a real client's browser session. For changes affecting mutations, validate a separately authorized live pilot before deploying to a client.

Do not commit client configs, browser profiles, tokens, exports, screenshots of client records, logs, checkpoints, or exception CSVs. Use invented fixtures in bug reports and tests. Check `git diff --cached` before pushing. The synthetic `assets/worker/test/config.json` is deliberately tracked; actual client `config.json` files are ignored.

Preserve existing checkpoints during upgrades. Do not replace a running worker from the template blindly. Pause it, inspect compatibility, apply the reviewed code changes, and follow the recovery guide.
