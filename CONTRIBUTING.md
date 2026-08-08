# Contributing

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh.md)

Thanks for contributing to LanTai（兰台）.

## Prerequisites

- [Node.js](https://nodejs.org/) matching [`.node-version`](.node-version)
- npm (ships with Node.js)

## Setup

```bash
git clone https://github.com/windily-cloud/obsidian-LanTai.git
cd obsidian-LanTai
npm install
```

## Development workflow

### Build

```bash
npm run build
```

### Dev mode

Create a local `.env` (see `.env.example`):

```bash
cp .env.example .env
```

Set `OBSIDIAN_CONFIG_FOLDER` to a vault’s `.obsidian` path (default: `demo-vault/.obsidian`), then:

```bash
npm run dev
```

`npm run dev` watches and copies the plugin into that folder. It does **not** launch Obsidian.

1. In Obsidian: **Open folder as vault** → select `demo-vault/`
2. Trust the author and enable community plugins once
3. Enable **Hot Reload** and **LanTai**
   (Hot Reload is under `demo-vault/.obsidian/plugins/hot-reload/` for local dev; install from Community plugins if missing)
4. Edit `src/` — rebuilds copy automatically; Hot Reload shows a brief notice on reload

If changes do not reload: confirm both plugins are enabled, and that `npm run dev` prints `Copied build → ...`.

### Lint / format / spellcheck

```bash
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run spellcheck
```

### Test

```bash
npm run test
npm run test:coverage
```

Domain logic is developed test-first where practical. Prefer unit tests next to the module (`*.test.ts`) at the public seams.

## Pull requests

- Base PRs on `main`.
- Prefer conventional commits (`npm run commit` helps).
- Before opening a PR, run locally and ensure they pass:

  ```bash
  npm run lint
  npm run format:check
  npm run spellcheck
  npm run test
  ```

  There may be no mandatory PR CI yet; **local green checks + review** are the gate.

### Unit tests are required for behavioral changes

Any change that alters runtime behavior—new features, bug fixes, domain or adapter logic—**must** add or update unit tests (`*.test.ts`) and pass `npm run test` **before** you open (and before we merge) the PR.

Documentation-only, comment-only, or pure non-behavioral edits may omit new tests; say so explicitly in the PR description.

PRs that change behavior without tests will be asked to add them before merge.

## Further reading

- Product domain language: [`CONTEXT.md`](CONTEXT.md) (Chinese)
- User docs: [`README.md`](README.md)
- Maintainer releases: [`RELEASE.md`](RELEASE.md)
