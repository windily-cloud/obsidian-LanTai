# Releasing

[English](RELEASE.md) | [中文](RELEASE.zh.md)

Maintainer guide for publishing LanTai（兰台）releases. Contributors normally do not run this flow.

## Prerequisites

- Clean `main` (or the branch you intend to release), with no uncommitted changes
- Local checks green (the release script re-runs them by default):

  ```bash
  npm run format:check
  npm run spellcheck
  npm run lint
  npm run test
  ```

- [Git](https://git-scm.com/) and [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (`gh auth status`)
- Push access to the GitHub repository

## One-command release

This repo uses `npm run version`, which wraps `obsidian-dev-utils` `updateVersion` (see [`scripts/version.ts`](scripts/version.ts)).

```bash
npm run version -- <patch|minor|major|x.y.z> [flags]
```

Examples:

```bash
npm run version -- patch
npm run version -- minor --no-changelog-editing
npm run version -- 0.2.0 --no-release
```

By default the script will:

1. Verify Git / `gh`, and that the working tree is clean
2. Run format check, spellcheck
3. Run `npm run build`
4. Run lint, optional over-exposure analysis, and unit tests when those scripts exist (integration tests and coverage gates are not part of release)
5. Bump versions in `package.json` (and lockfiles if present), `manifest.json`, and `versions.json` (`version` → `minAppVersion`)
6. Generate or update `CHANGELOG.md` from commits and open it for review (unless `--no-changelog-editing`)
7. Commit (`chore: release <version>`), annotated tag, and push
8. Create a GitHub Release (`gh release create`) titled `v<version>`, attach everything under the plugin build output folder (typically `dist/build/`, e.g. `main.js`, `manifest.json`, `styles.css` when present), and optionally a demo-vault archive
9. Mark the release as a prerelease when the version is a semver prerelease (e.g. `1.2.4-beta.0`)

Useful flags (each feature is **on** by default; `--no-*` turns it off):

| Flag | Effect |
|------|--------|
| `--no-build` | Skip build (only if artifacts already match this commit) |
| `--no-checks` | Skip clean-tree / format / spellcheck / lint / tests (build still runs unless `--no-build`) |
| `--no-changelog-editing` | Write changelog without opening an editor |
| `--no-commit-verification` | Pass `--no-verify` on the release commit |
| `--no-demo-vault` | Do not archive `demo-vault/` as a release asset |
| `--no-release` | Do all local steps but skip push and GitHub Release |

## After publish

Publishing a GitHub Release triggers [`.github/workflows/attest-release-assets.yml`](.github/workflows/attest-release-assets.yml), which downloads the release assets and generates artifact attestations.

## Obsidian Community Plugins (optional)

If / when the plugin is listed in the official community catalog, follow Obsidian’s submission process and keep `versions.json` aligned with each released `manifest.json` `minAppVersion`. Until then, users install from GitHub Releases.

## Dry run

To practice without publishing:

```bash
npm run version -- patch --no-release
```

Inspect the local commit, changelog, and tags; delete or reset them if you do not intend to ship that version.
