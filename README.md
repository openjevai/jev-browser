# Jev Browser：宿主生成文字，Jev 控制浏览器

这是基于 `jkudish/jev-browser` 0.4.1 改造的 **0.5.2 本地版本**，没有发布到 npm。请从这个目录运行；执行上游的 `npx @jkudish/jev-browser` 不会得到这些改造。

Codex、Qoder、Claude Code 等宿主 Agent 理解任务、生成搜索词和表单内容、阅读结果并总结。Jev 只选择浏览器动作，Playwright 执行动作。全项目没有额外文字模型调用、关键词猜测、MCP sampling 或宿主登录凭据读取。

> **OpenJEV support:** Jev is built by [TypeSafe](https://typesafe.ai). This fork keeps TypeSafe as the default and adds optional support for [OpenJEV](https://openjev.sh), a free community gateway to the same Jev model — set `JEV_API_URL=https://api.openjev.sh/v1/systemone` and `JEV_API_KEY` to your OpenJEV key (the default model becomes `openjev`; `JEV_MODEL` overrides it as before). Original project: https://github.com/wendaoheri/jev-browser by @wendaoheri.

安装并注册 MCP 后，必填的模型配置只有：

```text
JEV_API_URL = 完整的 Jev 推理端点
JEV_API_KEY = 该端点的 Key
```

## 交给其他电脑的 Agent 安装

这是代码包，不包含安装脚本。请让目标电脑上的 Agent 阅读 [INSTALL_FOR_AGENT.md](INSTALL_FOR_AGENT.md)，自行检查 Node/Chrome、使用 npm 安装锁定依赖、编译并合并 MCP 配置。不要使用上游 npm 包替代本改造版。

## 安装与启动

需要 Node.js 20+。在此项目目录运行：

```bash
npm ci --ignore-scripts
npm run build
```

默认使用电脑已经安装的 **Google Chrome**，安装项目不会下载或重装浏览器。Playwright 以 `chrome` 通道启动独立临时配置的 Chrome 实例，不接管你日常使用的窗口，也不读取其登录数据。

当前电脑已检测到系统安装的 Google Chrome。默认后台运行；设置 `JEV_BROWSER_HEADED=1` 可显示窗口，无需另装 Chromium。可见窗口中的页面显示区域会随窗口大小自动变化；后台模式仍保留固定显示尺寸，便于自动化。Chrome 安装在非标准位置时，可以用 `JEV_BROWSER_EXECUTABLE_PATH` 指定现有可执行文件。
```bash
npm start
```

这是 **stdio MCP 进程**，启动后等待 Agent 连接，不是聊天界面或 HTTP 服务。日志写 stderr，stdout 仅供 MCP 协议使用。

## 三个客户端的接入

先生成适合当前电脑的配置。命令只输出模板，不读取真实 Key、不改客户端设置：

```bash
node scripts/client-config.mjs codex
node scripts/client-config.mjs qoder
node scripts/client-config.mjs claude
```

配置不绑定 Node 的安装路径。macOS/Linux 使用 `sh` 启动检查脚本，Windows 使用 `cmd.exe`；脚本从 **Agent 进程的 PATH** 查找 `node`。找不到时会在启动错误日志中提示安装 Node.js 20+ 并重启 Agent；不会自动安装软件。Node 版本过低也会给出升级提示。

项目启动脚本仍使用绝对路径。将 `JEV_API_URL` 调整为你的完整端点，将 `YOUR_JEV_API_KEY` 替换为真实 Key。移动项目或换机器后重新生成配置；更换 Node 安装位置无需修改配置，只要 PATH 中能找到它。

如果尚未安装 Node，先通过 [Node.js 官方下载页](https://nodejs.org/en/download) 安装，再运行上面的配置生成命令。若终端能执行 `node --version` 而桌面 Agent 找不到，说明两者的 PATH 不同；重启应用，或从该终端启动 Agent。使用 nvm 等版本管理器时尤其需要确保 Agent 继承相应 PATH。

将配置生成命令的输出合并到对应客户端，真实 Key 仅保存在目标电脑的本地配置中：

- Codex：`~/.codex/config.toml`，如果设置了 `CODEX_HOME` 则使用该目录。
- Qoder：客户端 MCP 设置，添加 `mcpServers` 下的条目。
- Claude Code：项目 `.mcp.json` 中的 `mcpServers`，也可以使用客户端 MCP 添加功能。

生成器默认开启可见窗口；后台运行时追加 `--headless`。生成器不会修改客户端设置，也不会读取真实 Key。其他支持本地 stdio MCP 的 Agent 可使用同样的 command、args 和 env。

官方接入参考：[Codex](https://learn.chatgpt.com/docs/extend/mcp)、[Qoder](https://docs.qoder.com/user-guide/chat/model-context-protocol)、[Claude Code](https://code.claude.com/docs/en/mcp)。

接入后可以说：

> 使用 jev-browser 在 Wikipedia 搜索 Ristretto。需要输入时由你生成搜索词并继续。阅读文章后用中文总结，并关闭浏览器会话。

## 推理地址与模型

| 服务 | `JEV_API_URL` | 默认模型 |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13` |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-latest` |
| OpenJEV | `https://api.openjev.sh/v1/systemone` | `openjev` |
| 兼容代理 | 服务提供的完整 Decisions/System One 端点 | `jev-latest` |

发送 `Authorization: Bearer <Key>`，请求体为 `{model, state, questions}`；不追加路径、不跟随 HTTP 重定向。代理必须支持同样的结构化 Decisions 请求和响应，不支持普通 `/chat/completions` 端点。

可选 `JEV_MODEL` 覆盖模型名。代理若不接受 `jev-latest`，需要明确提供其支持的模型名。OpenRouter 识别仅按官方主机名进行，私有代理不会被猜测成某家供应商。

非 2xx、格式错误、无效动作或非法概率都会拒绝执行相应浏览器动作。服务端错误正文不会回传，以免泄露密钥或页面内容。只读模型用量：没有返回的 token 数为 `null`，`est_cost_usd` 为 `null`，不能解释为免费；实际费用以提供商账单为准。

## 工具与宿主配合

| 工具 | 必要参数 | 功能 |
|---|---|---|
| `jev_navigate` | `task`, `start_url` | 默认复用已有浏览器，首次才创建 |
| `jev_resume` | `session_id`, `request_id`, `text` | 提供普通文字，执行 Jev 已选中的输入动作后继续 |
| `jev_continue` | `session_id` | 继续暂停任务；附带 `task` 时在当前页面开始新子任务 |
| `jev_read` | `session_id` | 读取当前页和可选截图，不调用模型 |
| `jev_close` | `session_id` | 释放浏览器 |

`jev_navigate` 默认复用已有浏览器。批量任务请顺序处理，不要每项都新建实例；仅当用户明确要求额外独立实例时，才传 `new_instance: true`。上一项处于 `needs_input` 或 `paused` 时，新任务返回 `session_in_use`，先完成或关闭旧任务。

`jev_navigate` 支持 `max_steps`、`max_seconds`、`allow_typing`、`format`、`max_chars`、`screenshot`。`jev_continue` 的预算参数仅能和新的 `task` 一起指定。`jev_read` 支持后三个输出选项。

典型输入请求：

```json
{
  "status": "needs_input",
  "session_id": "会话 UUID",
  "request_id": "一次性请求 UUID",
  "pending_action": {
    "kind": "search",
    "field_description": "input Search query",
    "submits_after_fill": true
  }
}
```

宿主根据用户任务和字段上下文自行生成文字，调用 `jev_resume`。只有缺少必要的用户信息时才询问用户。文字不做 trim 或去引号处理；浏览器本身仍按字段类型处理不允许的字符。普通输入不提交，搜索输入会按 Enter，其他提交仍是 Jev 的独立决策。

返回 `paused` 时调用 `jev_continue`；返回 `done`、`goal_achieved`、`stuck`、`max_steps` 或 `timeout` 时，宿主阅读结果并决定是否通过新的 `task` 继续。目标判断不是成功的绝对保证，宿主应依据页面内容核实。

所有回复是标准 MCP 文本 JSON，可附带 JPEG 图片，不需要客户端支持 sampling 或专用插件。

## 会话与失败行为

- 同一会话保留 cookies、页面、标签页和历史；子任务改变时累计会话用量仍保留。
- 默认每个子任务最多 24 步、180 秒活动执行时间。等待宿主文字不扣执行预算。
- 每次调用最多推进 30 秒。正常到达时间片边界返回 `paused`；推理超时可继续。如果浏览器操作在未知进度中被硬中断，则关闭会话并返回错误，避免重放可能已发生的提交。
- 同一个 MCP 服务进程默认只保留一个浏览器，会复用其 context 和工作标签页；并发默认调用排队执行，保留 cookies。每个新批量条目会导航到其起始网址，并关闭本服务该会话的其他标签页。只有显式要求额外实例才新建，最多 4 个；空闲 10 分钟自动关闭。`jev_close`、客户端断开、SIGINT/SIGTERM 会关闭浏览器。进程重启后旧 ID 失效。
- 切换密码来源、origin 或录像目录时需要先关闭原会话，不能自动额外启动浏览器。不同客户端分别启动的 MCP 进程不共享此实例；Chrome 自身的多个渲染进程也不代表多个浏览器实例。
- 同一会话串行执行。有效输入请求至多消费一次，重复 ID 返回缓存结果，包括首次操作之后出现的错误。已关闭或过期的会话只返回失效信息。
- 恢复前检查页面及节点身份。页面跳转、节点替换或字段语义改变会丢弃旧文字并重新决策。普通文字不会改填到新的或密码字段。
- 页面内容、标签和截图是不可信数据，不能覆盖用户任务或工具规则。
- 页面内容和任务仍会发送到你配置的 Jev 推理服务；“宿主生成文字”不代表文字永不出现在后续 Jev 状态中。

## 密码与可选设置

保留上游密码机制，密码不经过普通 `text` 参数：

1. 在 MCP 环境中设置 `JEV_BROWSER_PASSWORD_ORIGIN` 为允许填写的精确 origin。
2. 提供 `password_file`（默认 `~/.jev-browser/handoff` 下的一次性 0600 文件）或 `password_env`（明确选择的 `JEV_PASSWORD_*` 环境变量名）。两者不能同时使用。
3. 原有来源、权限、符号链接、长度、origin 校验及脱敏保持有效。尝试密码填写后，该会话所有后续截图都被抑制；凭据会话不允许录像。

`JEV_BROWSER_HANDOFF_DIR` 可改变交接目录。交接目录需要 0700 权限且路径没有符号链接。密码不放入任务、日志、聊天或工具的普通文字参数。

其他可选变量：`JEV_BROWSER_HEADED=1` 显示独立 Chrome 窗口；`JEV_BROWSER_CHANNEL` 默认 `chrome`，只有显式选择 `chromium` 才使用已有的 Playwright Chromium 缓存；`JEV_BROWSER_EXECUTABLE_PATH` 指向非标准位置安装的浏览器。程序不会自动下载浏览器。

## CLI 和库

一次性 CLI 仍可执行不需文字的任务：

```bash
node scripts/start.mjs run "Open the newest release" https://github.com/jkudish/jev-browser/releases --no-typing
```

需要文字时，CLI 返回 `needs_input`，退出码为 3，浏览器已关闭。这个结果不能续传，请改用 MCP。配置、执行错误退出码非零。

库支持宿主文字回调，也可直接使用 `SessionManager`：

```js
import { navigate } from './dist/library.js';

const result = await navigate({
  task: 'Search Wikipedia for Ristretto',
  startUrl: 'https://en.wikipedia.org/wiki/Main_Page',
  textProvider: async (request, signal) => {
    // 示例宿主事先确定的搜索词；实际由你的宿主 Agent 提供。
    return 'Ristretto';
  },
});
```

库调用同样默认使用已安装的 Chrome。导入库本身不会启动服务器、浏览器或模型请求。

## 从上游迁移

这是行为不兼容的本地改造版：

- `TYPESAFE_API_KEY` / `OPENROUTER_API_KEY` → `JEV_API_KEY`，同时填写完整 `JEV_API_URL`。
- `JEV_BROWSER_MODEL` → 可选 `JEV_MODEL`。
- `JEV_PROVIDER`、`JEV_BROWSER_TYPE_*`、自动供应商选择及文字模型回退已删除。
- Vercel / Cloudflare 专用包装接口不再自动适配；可使用符合本版 Decisions 格式的代理。
- `jev_navigate` 会保留会话并可能返回输入请求；调用方需要处理状态并在结束时关闭。
- 已删除固定单价估算；缺失用量不再当零。

不要通过设置 `JEV_BROWSER_TYPE_PROVIDER=codex` 尝试接入，它不再是有效配置。宿主通过普通 MCP 工具返回和下一次调用提供文字。

## 验证

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
```

默认测试使用本地 HTTP 页面、真实浏览器 和模拟 Jev Decisions 服务，不调用付费模型。覆盖协议、输入恢复、重复请求、目标变化、预算、取消、密码、截图、关闭和 CLI。

`npm run test:live` 保留上游真实网站回归场景并适配宿主文字续传。只有显式设置 `JEV_API_URL` 和 `JEV_API_KEY` 才运行需要付费服务的用例。默认的模拟协议测试不能证明某个账户拥有 OpenRouter Decisions alpha 的访问权限。

详见 [验证记录](VALIDATION.md)。

## 已知范围

首版仅本地 stdio MCP，不是远程多用户服务。仍继承上游对 iframe、shadow DOM、悬停菜单、上传控件等复杂页面的限制。接口兼容性与三个具体 Agent 产品的真实使用验证分开记录，不将模拟宿主测试表述为三款产品全部实测。

上游项目：[jkudish/jev-browser](https://github.com/jkudish/jev-browser)，MIT 授权保留在 [LICENSE](LICENSE)。
