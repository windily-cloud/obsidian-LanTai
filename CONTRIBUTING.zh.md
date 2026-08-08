# 贡献指南

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh.md)

感谢参与兰台（LanTai）的贡献。

## 环境要求

- [Node.js](https://nodejs.org/) 版本见 [`.node-version`](.node-version)
- npm（随 Node.js 提供）

## 初始化

```bash
git clone https://github.com/windily-cloud/obsidian-LanTai.git
cd obsidian-LanTai
npm install
```

## 开发流程

### 构建

```bash
npm run build
```

### 开发模式

创建本地 `.env`（参考 `.env.example`）：

```bash
cp .env.example .env
```

将 `OBSIDIAN_CONFIG_FOLDER` 设为某个库的 `.obsidian` 路径（默认：`demo-vault/.obsidian`），然后：

```bash
npm run dev
```

`npm run dev` 会监视并复制插件到该目录，**不会**自动启动 Obsidian。

1. 在 Obsidian 中：**打开文件夹作为库** → 选择 `demo-vault/`
2. 信任作者并启用社区插件
3. 启用 **Hot Reload** 与 **LanTai**
   （本地开发用的 Hot Reload 已在 `demo-vault/.obsidian/plugins/hot-reload/`；若缺失请从社区插件安装）
4. 编辑 `src/` — 会自动重建并复制；Hot Reload 会在重载时提示

若未热重载：确认两个插件均已启用，且 `npm run dev` 输出含 `Copied build → ...`。

### Lint / 格式化 / 拼写检查

```bash
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run spellcheck
```

### 测试

```bash
npm run test
npm run test:coverage
```

领域逻辑宜测试驱动。单测放在模块旁（`*.test.ts`），打在对外 seam 上。

## Pull Request

- 基于 `main` 开 PR。
- 提交信息建议遵循 Conventional Commits（可用 `npm run commit`）。
- 开 PR 前请在本地跑通：

  ```bash
  npm run lint
  npm run format:check
  npm run spellcheck
  npm run test
  ```

  目前可能尚无强制 PR CI；**以本地检查通过 + 代码审阅为准**。

### 行为变更必须附带单元测试

凡改变运行时行为的改动——新功能、缺陷修复、领域或适配器逻辑——**必须**新增或更新单元测试（`*.test.ts`），且 `npm run test` 通过后，才能开 PR（合并前同样须通过）。

纯文档、纯注释、或确认无行为影响的改动可不新增测试，但须在 PR 说明中写明原因。

缺少测试的行为变更 PR 会被要求补测后再合并。

## 相关文档

- 领域用语：[`CONTEXT.md`](CONTEXT.md)
- 用户文档：[`README.zh.md`](README.zh.md)
- 维护者发版：[`RELEASE.zh.md`](RELEASE.zh.md)
