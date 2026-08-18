# CHANGELOG

## 0.0.7

- fix: 收紧仅文件内使用的 export，通过 find-overexposed
- feat: 画廊拖拽插入笔记，并兼容 1.11.4 与移动端设置布局

## 0.0.6

- fix: 收紧仅文件内使用的 export，通过 find-overexposed
- docs: 更新 README 覆盖桌面/移动端，并规范 JSON 缩进
- feat: 上传冲突按内容分流确认覆盖，换链保留 layout/size
- feat: 自研 S3 协议栈，并修复桌面特殊文件名签名与移动端上传

## 0.0.5

- fix: 收紧仅文件内使用的 export，通过 find-overexposed
- feat: 增强画廊多数据源、上传历史与连接测试

## 0.0.4

- fix: 生产构建产物输出到 dist/ 而非 dist/build
- fix: 用浏览器下载与 Obsidian API 去掉 fs/child_process

## 0.0.3

- fix: unexport settings definition params used only locally
- chore: normalize JSON indentation to tabs for dprint
- fix: restore S3 profile settings to a compact one-per-row layout
- fix: address Obsidian review blockers for release install and settings

## 0.0.2

- chore: 用 dprint 统一 JSON 缩进为 tab

## 0.0.2

- feat: 接管图片新建落盘并修正删除确认顺序
- feat: 补全插件 en/zh 双语 i18n
- dev: 添加布局样式

## 0.0.1

- fix: 发版不要求100%测试覆盖率
- fix: 发版不跑集成测试
- fix: find-overexposed
- fix: find-overexposed
- fix: lint error
- fix: markdown lint still running
- build: remove markdown lint
- fix: wrong version
- docs: add docs
- dev: init project
