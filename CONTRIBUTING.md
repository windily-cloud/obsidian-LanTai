# Contributing

Contributions are welcome! Here's how to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) (see `.node-version`)
- npm (comes with Node.js)

## Setup

```bash
git clone https://github.com/windily-cloud/obsidian-LanTai.git
cd obsidian-LanTai
npm install
```

## Development Workflow

### Build

```bash
npm run build
```

### Dev Mode

Create a local `.env` (see `.env.example`):

```bash
cp .env.example .env
```

Set `OBSIDIAN_CONFIG_FOLDER` to a vault's `.obsidian` path (default: `demo-vault/.obsidian`), then:

```bash
npm run dev
```

`npm run dev` watches and copies the plugin into that folder. It does **not** auto-launch Obsidian.

1. In Obsidian: **Open folder as vault** → select `demo-vault/`
2. Click **Trust author and enable plugins** once
3. Enable community plugins **Hot Reload** and **LanTai**
   (Hot Reload is already present under `demo-vault/.obsidian/plugins/hot-reload/` for local dev; if missing, install it from Community plugins)
4. Edit `src/` — rebuilds copy automatically; Hot Reload shows a brief notice when the plugin reloads

If changes don't reload: confirm Settings → Community plugins shows both enabled, and that `npm run dev` prints `Copied build → ...`.

### Lint

```bash
npm run lint
npm run lint:fix
```

### Format

```bash
npm run format:check
npm run format
```

### Spellcheck

```bash
npm run spellcheck
```

### Test

```bash
npm run test
npm run test:coverage
```

## Pull Requests

- Base your PR on the `main` branch.
- Ensure all checks pass (`lint`, `format:check`, `spellcheck`, `test`).
