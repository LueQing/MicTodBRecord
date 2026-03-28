<!-- GSD:project-start source:PROJECT.md -->
## Project

**Mic dB Record**

这是一个本地运行的网页工具：浏览器使用系统默认麦克风收听环境声音，把输入换算成相对分贝 `dBFS`，并绘制一条分贝随时间变化的曲线。与此同时，本地 Node 服务维护近 5 分钟窗口内的最大值和平均值，再通过 localhost TCP 按行广播给本机客户端。

**Core Value:** 用户在本机打开页面并授权默认麦克风后，能稳定看到实时分贝时间曲线，并从本地 TCP 拿到最近 5 分钟的最大值和平均值。

### Constraints

- **Tech stack**: 纯 Node 内置服务 + 原生前端 API - 保持依赖最小，项目初始化后即可直接运行
- **Measurement**: 默认输出 `dBFS` 而非 `dB SPL` - 浏览器麦克风没有可靠的物理声压校准
- **Networking**: TCP 只绑定 `127.0.0.1` - 需求限定本机广播，减少暴露面
- **Permissions**: 页面必须运行在 `localhost` 并获得麦克风授权 - 浏览器媒体权限模型决定
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
