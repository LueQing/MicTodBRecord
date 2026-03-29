# Mic dB Record

## What This Is

这是一个本地运行的网页工具：本地 Node 服务直接使用系统默认麦克风收听环境声音，把输入换算成相对分贝 `dBFS`，并把实时数据提供给浏览器绘制分贝时间曲线。浏览器只负责展示，不再拥有麦克风权限或采样职责。与此同时，服务端维护近 5 分钟窗口内的最大值和平均值，再通过 localhost TCP 按行广播给本机客户端。

## Core Value

用户在本机启动本地服务并打开页面后，能稳定看到由后端默认麦克风采样驱动的实时分贝时间曲线，并从本地 TCP 拿到最近 5 分钟的最大值和平均值。

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] 本地后端服务可以监听默认麦克风并持续产出实时分贝
- [ ] 页面可以展示最近 5 分钟的分贝时间曲线
- [ ] 本地服务可以维护最近 5 分钟的最大值与平均值
- [ ] localhost TCP 客户端可以收到实时统计广播

### Out of Scope

- 真实声压级 `dB SPL` 标定 - 浏览器默认只能得到未校准的相对分贝，精确声级需要额外标定
- 远程网络广播 - 当前需求只覆盖 `localhost`，避免引入额外网络与权限复杂度
- 历史持久化、导出报表 - 先完成实时监听与 5 分钟窗口统计

## Context

- 这是一个 greenfield 项目，当前目录初始化时没有现有代码。
- 技术路径以“尽快跑起来”为优先，采用 Node 内置 `http` / `net` 搭配后端麦克风采样适配层与原生前端展示。
- 网站只需要本地运行，核心使用场景是单机观察噪声趋势与验证音频采样链路。
- 系统展示的“分贝”定义明确为 `dBFS`，避免把未校准数值误认为专业声级计读数。
- 浏览器现在是展示面板，不再承担麦克风采样与权限申请。
- 旧的浏览器采样 MVP 已完成验证，当前正在重构为后端采样架构。

## Constraints

- **Tech stack**: 纯 Node 内置服务 + 原生前端 API - 保持依赖最小，项目初始化后即可直接运行
- **Measurement**: 默认输出 `dBFS` 而非 `dB SPL` - 后端默认麦克风采样也没有可靠的物理声压校准
- **Networking**: TCP 只绑定 `127.0.0.1` - 需求限定本机广播，减少暴露面
- **Permissions**: 页面必须运行在 `localhost`，后端进程必须能访问系统默认录音设备 - 本地展示与后端采样都依赖该前提

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用后端默认麦克风而不做设备选择 | 用户需求是“基于默认麦克风收听”，而后端统一采样能让网页和 TCP 共用同一数据源 | Pending |
| 浏览器只做展示，不再访问麦克风 | 用户明确要求浏览器只作为展示页面 | Pending |
| 使用 `dBFS` 作为页面与 TCP 的默认单位 | 这是浏览器可稳定获得且可解释的数值 | Pending |
| 使用 Node 内置 `http` / `net` 而不是框架 | 功能简单，本地工具不需要额外依赖与构建步骤 | Pending |
| TCP 采用按行 JSON 推送 | 客户端最容易接入，便于 PowerShell、Node 或其他语言直接读取 | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone**
1. Full review of all sections
2. Core Value check -> still the right priority?
3. Audit Out of Scope -> reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-29 after phase 2 backend-capture refactor kickoff*
