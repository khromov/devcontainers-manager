# devcontainers-manager

A web UI for spinning up isolated devcontainer instances from any local folder for multiple simultaneous Claude Code workflows using the web version VS Code.

Pick a project folder → the app copies it, injects code-server into its `devcontainer.json`, runs `devcontainer up`, and publishes the editor on a unique host port. It also copies your host's Claude Code and GitHub CLI credentials into each container so `claude`, `gh`, and git-over-HTTPS work out of the box.

## Requirements

- [Bun](https://bun.sh) >= 1.3.13 (Node.js is not supported)
- Docker (eg. Docker Desktop or Colima)

## Setup

```sh
bun install
```

## Commands

```sh
bun run dev        # dev server (local DATA_DIR, no browser launch)
bun run start      # run the app
bun run build      # production build → .mochi/
bun run typecheck  # svelte-check + tsc --noEmit
bun test           # run tests
```

## Configuration

- `PORT` — server port (default `3333`)
- `DATA_DIR` — where state lives (default `~/.devcontainers-manager`)
- `DOCKER_HOST` — Docker daemon socket/URL to connect to (e.g. `unix://$HOME/.colima/default/docker.sock` or `tcp://1.2.3.4:2375`); defaults to your active Docker context
- `BASIC_AUTH_PASSWORD` — enables HTTP Basic Auth over the whole UI (disabled when unset)
- `DCM_CLAUDE_CODE_TOKEN` — inject this Claude Code OAuth token into every container instead of discovering the host's credentials (e.g. from `claude setup-token`)
- `DCM_GITHUB_TOKEN` — inject this GitHub token into every container instead of reading `gh auth token` from the host
- `DISABLE_OPEN_BROWSER=1` — skip opening the browser on startup
