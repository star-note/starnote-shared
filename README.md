# @starnote/shared · 各端共享代码（starnote-shared）

辰记网页端、手机端、桌面端共用的 TypeScript 代码：API 类型与客户端、状态、发布转换与预览、封面生成、风格、排版工具、i18n。没有构建步骤——使用方通过 `link:../starnote-shared` 直接引用源码，由各自的 Vite 编译。

## 使用

```json
{ "dependencies": { "@starnote/shared": "link:../starnote-shared" } }
```

```ts
import { useAiStatus } from '@starnote/shared/stores/ai';
import { convertArticle } from '@starnote/shared/publish/article';
import { PublishPreview } from '@starnote/shared/preview';
```

子路径即目录名（`@starnote/shared/<目录>/<文件>`）。本包自身依赖编辑器 SDK（`ai-sparkwrite-editor`）与发布 SDK 的 `@starnote/publish-core`、`@starnote/publish-chenji`，也是 `link:`，所以三者要在同一个父目录里，并先构建那两个 SDK。

## 目录

| 目录 | 内容 |
|---|---|
| `api/` | 接口类型（`types.ts`）、各域的 API 封装（official、me、versions…） |
| `stores/` | 跨端共享的 zustand store（如 `ai.ts`：`serverAvailable / activated / balance / enabled`） |
| `publish/` | Tiptap JSON → 博客 HTML / 公众号 HTML 的转换（`article.ts`）、发布相关纯函数 |
| `preview/` | 发布预览组件：各平台文章页在隔离 iframe 里按设备尺寸渲染 |
| `cover/` | 封面生成器：canvas 风格与杂志模板（fashion / journal / xhs / scenic / geo）、素材选择、地名提取 |
| `styles/` | 风格 = 版式 + 皮肤：官方风格、`applyStyle`、规则推荐、AI 推荐提示词 |
| `templates/` | 版式套用（`layout.ts`） |
| `typeset/` | 编辑器 AI 排版工具的纯逻辑：拆段、标重点、排版体检、信息图卡数据 |
| `versions/` | 一稿多版（小红书图集、英文版、精简版）的数据与规则 |
| `editor/` · `materials/` · `sheet/` · `viewport/` · `react/` | 编辑器接入、素材、底部弹层、视口与通用 React 工具 |
| `brand/` · `landing/` · `home/` · `inspiration/` · `i18n/` | 品牌组件、落地页与首页数据、灵感、文案 |

## 命令

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint
```

## 约定

- 这里只放纯逻辑与可跨端复用的组件；带路由、壳、平台 API（Electron、PWA）的代码放各端仓库。
- 对外形状的改动要同时看 web、mobile、desktop 三个使用方的 tsc。
- 契约文档在 starnote-docs（`CONTRACTS-r9-versions.md` 记录了风格与多版的接口）。
