# 发布流程

[English](RELEASE.md) | [中文](RELEASE.zh.md)

维护者发布兰台（LanTai）版本的说明。普通贡献者一般不执行此流程。

## 前置条件

- `main`（或拟发版分支）干净，无未提交改动
- 本地检查通过（发版脚本默认会再跑一遍）：

  ```bash
  npm run format:check
  npm run spellcheck
  npm run lint
  npm run test
  ```

- 已安装 [Git](https://git-scm.com/) 与 [GitHub CLI](https://cli.github.com/)（`gh`），并已登录（`gh auth status`）
- 对 GitHub 仓库有推送权限

## 一键发版

本仓库通过 `npm run version` 调用 `obsidian-dev-utils` 的 `updateVersion`（见 [`scripts/version.ts`](scripts/version.ts)）。

```bash
npm run version -- <patch|minor|major|x.y.z> [flags]
```

示例：

```bash
npm run version -- patch
npm run version -- minor --no-changelog-editing
npm run version -- 0.2.0 --no-release
```

默认会：

1. 检查 Git / `gh`，并确认工作区干净
2. 运行 format check、spellcheck
3. 执行 `npm run build`
4. 运行 lint，以及仓库中存在的 over-exposure / 单元测试脚本（发版不跑集成测试与 coverage 门槛）
5. 更新 `package.json`（及存在的 lockfile）、`manifest.json`、`versions.json`（`version` → `minAppVersion`）
6. 根据提交生成/更新 `CHANGELOG.md`，并打开编辑器审阅（除非 `--no-changelog-editing`）
7. 提交（`chore: release <version>`）、打 annotated tag 并推送
8. 用 `gh release create` 创建 GitHub Release（标题 `v<version>`），上传插件构建目录下的全部产物（通常为 `dist/build/`，例如存在的 `main.js`、`manifest.json`、`styles.css`），并可附带 demo-vault 压缩包
9. 若版本为 semver 预发布（如 `1.2.4-beta.0`），则标记为 prerelease

常用开关（功能默认开启，`--no-*` 关闭）：

| 开关 | 作用 |
|------|------|
| `--no-build` | 跳过构建（仅当产物已与当前提交一致时） |
| `--no-checks` | 跳过干净仓库 / format / spellcheck / lint / 测试（除非同时 `--no-build`，构建仍会执行） |
| `--no-changelog-editing` | 生成 changelog 但不打开编辑器 |
| `--no-commit-verification` | 发版提交使用 `--no-verify` |
| `--no-demo-vault` | 不把 `demo-vault/` 打成发布附件 |
| `--no-release` | 完成本地步骤，但不推送、不创建 GitHub Release |

## 发布之后

创建 GitHub Release 后会触发 [`.github/workflows/attest-release-assets.yml`](.github/workflows/attest-release-assets.yml)，下载 release assets 并生成 artifact attestation。

## Obsidian 社区插件目录（可选）

若 / 当插件进入官方社区目录时，按 Obsidian 提交流程操作，并保证每次发版的 `versions.json` 与 `manifest.json` 的 `minAppVersion` 一致。在此之前，用户可从 GitHub Releases 安装。

## 演练（不真正发布）

```bash
npm run version -- patch --no-release
```

检查本地提交、changelog 与 tag；若不打算发该版本，自行删除或回退。
