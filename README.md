# gridnexa-codingagent

这是一个使用 [Eve](https://eve.dev) 构建的 Coding Agent 项目。

## 环境与包管理

使用 Node.js 26.x 和本机已有、支持 lockfile v9 的 pnpm（9 或更新版本）。依赖安装、脚本执行和本地 CLI 调用统一使用 pnpm，仅维护并提交 `pnpm-lock.yaml`。

项目不再指定自动下载的 pnpm 版本，并关闭自动版本切换；不要求为此安装 Corepack 或其他包管理工具。

```bash
pnpm --version
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` 为迁移前已锁定的 `eve@1.5.0` 和 `@types/node@26.6.7` 设置了精确版本的发布时间例外，避免重新解析时改变既有版本；其他依赖仍使用 pnpm 的默认发布时间保护。升级这些依赖时应重新评估并移除不再需要的例外。

## 开发与验证

```bash
pnpm dev
```

当前启动的是 Eve 开发服务与终端交互界面（TUI），不是浏览器页面。编辑 `agent/instructions.md` 定义 Agent 的身份、行为和边界；`agent/agent.ts` 配置模型与运行参数；`agent/extensions/` 挂载扩展。

```bash
pnpm typecheck
pnpm build
pnpm eval
```

`eval` 脚本可用于后续行为评测；有脚本不代表已经编写了评测用例。

## Web Chat

已通过官方 `pnpm exec eve add channel/web` 安装到 `apps/web/`，选择 Next.js hosting，由同一个本地入口提供页面并路由 Agent 请求；没有创建 Vercel 云资源或改变主模型。

在 Node.js 26.x 下安装依赖并启动网页：

```bash
pnpm install --frozen-lockfile
pnpm dev:web
```

默认打开 `http://localhost:3000`，端口被占用时以终端输出为准。若此前混用了 pnpm 版本并出现 `ERR_PNPM_UNEXPECTED_STORE`，先停止旧开发进程，再用 `pnpm install --force --frozen-lockfile` 按当前 pnpm 重建依赖，不需要修改全局 store 配置。`pnpm dev` 仍是原来的终端交互模式；`pnpm dev:web` 才是浏览器界面，不需要同时再开一个 `pnpm dev`。

```bash
pnpm typecheck:web
pnpm build:web
```

页面使用官方聊天组件，支持新建会话、发送消息、展示流式回复、停止任务及恢复会话 URL。`apps/web/next.config.ts` 使用 `eve/next` 的 `withEve` 接入项目根 Agent；浏览器通过同源 `/eve/v1/*` 请求 Agent，而不是直接请求模型供应商。

### 模型凭据与访问控制

页面能打开不代表模型凭据已验证。当前 `deepseek/deepseek-v4-flash` 仍通过 AI Gateway 调用。需要使用环境变量时，可将根目录 `.env.example` 复制为 `apps/web/.env.local`，在本机填入有效的 `AI_GATEWAY_API_KEY`，然后重启 Web 开发服务；不要把密钥填到聊天框或带 `NEXT_PUBLIC_` 前缀的变量中。终端 `/login` 的密钥库登录记录不能单独作为该 Web 进程已经拿到可用凭据的证据。

本轮保留 `agent/channels/eve.ts` 的 `localDev()` 与生产占位鉴权：本地开发可访问，生产浏览器请求默认拒绝。没有用 `none()` 关闭鉴权；正式上线前仍需实现浏览器用户认证及 session/project 资源授权。

官方安装器为 Next.js 加入 React、样式与消息渲染依赖，并将 TypeScript 从 7.0.2 调整为其模板指定的 6.0.3。启动验证时 Eve 自动补装的 `just-bash` 也已显式记录在开发依赖中，避免第一次启动时再临时安装。前后端类型检查和 Web 生产构建均已在独立的 Node 26 环境验证；没有覆盖 Mac 的 `node_modules`。

## 部署与 CI/CD

仓库已连接到 Vercel 项目 `gridnexa-codingagent`（GitHub：`gridNexa-agent/gridNexa-codingAgent`）。

| 触发 | 结果 |
| --- | --- |
| 推送到 `main` | Vercel 自动生产部署 → https://gridnexa-codingagent.vercel.app |
| 打开 / 更新 PR | Vercel Preview 部署 + GitHub Actions 类型检查 |
| 推送到 `main` / PR | GitHub Actions 运行 `pnpm typecheck` 与 `pnpm typecheck:web` |

本地也可手动部署：

```bash
pnpm run deploy
```

此命令运行 `eve deploy`。它部署的是 Agent 与 Web 服务图，不等于发布 Agent 生成的用户应用。上线前需要配置真实浏览器鉴权和资源授权，不能依赖占位认证。

## 项目资料

实现阶段与验收目标见 [开发路线](docs/ROADMAP.md)，开发约束见 [AGENTS.md](AGENTS.md)。框架使用方式参见 [Eve 文档](https://eve.dev/docs)。
