# 请目标电脑上的 Agent 按本文自行安装

这是修改后的 Jev Browser 0.5.2 **代码包**，没有安装脚本。目标是让宿主生成文字，Jev 只负责浏览器决策。不要运行上游 `npx @jkudish/jev-browser` 代替此版本。

## 1. 放置代码并检查环境

将整个包解压到用户选择的长期目录。不要留在临时预览目录；后续移动目录需要重新生成配置。

检查 PATH 中的 Node.js 20+ 和 npm，以及本机已经安装的 Google Chrome。缺少时说明缺少什么，按用户授权安装或引导用户安装。不得自动下载 Chromium，不覆盖已有 Chrome，不借用日常浏览器的 profile。

桌面客户端和终端可能使用不同 PATH。最终要确保 Agent 启动 MCP 时能找到 node；不需要绑定 Node 的绝对路径。

## 2. 安装依赖并编译

在项目目录自行执行标准命令：

```bash
npm ci --ignore-scripts
npm run build
```

锁文件随包提供。下载依赖需要访问 npm 仓库；缓存完整时可以用 `npm ci --ignore-scripts --offline`。不要执行 Playwright 的 browser install 命令。

可选本地自检：

```bash
node scripts/doctor.mjs
```

它只检查现有 Chrome 能否打开本地页面，以及 MCP 的五个工具能否发现，不调用 Jev，不需要真实 Key，不安装任何内容。Chrome 非标准安装位置时先设置 `JEV_BROWSER_EXECUTABLE_PATH`。

## 3. 为目标机器生成配置

根据正在安装到的宿主，运行其中一个命令：

```bash
node scripts/client-config.mjs codex
node scripts/client-config.mjs qoder
node scripts/client-config.mjs claude
```

输出根据目标机器生成项目路径，不沿用打包电脑路径。默认显示独立 Chrome 窗口；需要后台模式时追加 `--headless`。非标准 Chrome 路径需在最终配置的 env 中增加 `JEV_BROWSER_EXECUTABLE_PATH`。

读取实际客户端配置，备份后仅合并 `jev-browser` 条目，保留其他条目。已有同名条目时更新它，不重复添加 TOML 表。

- Codex 通常使用 `~/.codex/config.toml`，设置了 `CODEX_HOME` 时尊重它。
- Qoder 使用其 MCP 设置或相应配置文件。
- Claude Code 可使用项目 `.mcp.json` 或其 MCP 添加功能。

具体配置位置以目标环境和客户端官方文档为准，不猜测或覆盖整个配置文件。

## 4. 在本地设置推理地址和 Key

必填 `JEV_API_URL`、`JEV_API_KEY`。默认模板的地址是 OpenRouter Decisions：

```text
https://openrouter.ai/api/alpha/decisions
```

也支持 TypeSafe `https://api.typesafe.ai/v1/systemone`、OpenJEV `https://api.openjev.sh/v1/systemone`（默认模型 `openjev`）或相同请求/响应协议的代理。不是普通 chat/completions 接口。代理模型名不同可设 `JEV_MODEL`。

包内不包含真实 Key。让用户在本机安全设置 Key，或经用户授权复用指定的现有配置。不要索取聊天中的 Key，不打印它，不放到命令行参数、安装日志、共享文件或 Git。未配置真实 Key 时只能报告本地安装通过，不能宣称真实服务联调成功。

## 5. 加载并验证

重新加载或重启宿主，确认能发现：

- `jev_navigate`
- `jev_resume`
- `jev_continue`
- `jev_read`
- `jev_close`

获得用户授权并配置真实 Key 后，可测试一个简短浏览任务。真实 Jev 调用会产生费用。分别报告本地自检、宿主实际连接及真实推理是否通过。

示例任务：使用 jev-browser 在 Wikipedia 搜索 Ristretto，由宿主生成搜索词，阅读文章后总结并关闭会话。

## 工具使用规则

- 批量任务默认复用同一个浏览器，逐项处理，全部完成后再关闭。不要因为任务多就传 `new_instance: true`；只有用户明确要求额外独立浏览器时才允许该参数。遇到 `session_in_use`，先完成或关闭已有任务。
- `needs_input`：宿主根据用户任务生成文字，调用 `jev_resume`，不要另调文字模型；必要信息确实缺失时才问用户。
- `paused`：调用 `jev_continue`。新子任务通过其 `task` 参数开始。
- 通过 `jev_read` 读取页面，由宿主分析总结，结束调用 `jev_close`。
- 使用独立 Chrome 会话，不继承已有窗口的登录状态。
- 密码仍走单独的 password_file/password_env 通道，不进入普通 text 参数。

## 验证边界

本包在 macOS 的独立解压目录中验证。Windows/Linux 启动入口已提供，尚未宣称在这两类实机验证。每台目标电脑以实际检查结果为准。没有桌面的环境应使用 `--headless`；部分 Linux 环境还需要现有 Chrome 的系统依赖。
