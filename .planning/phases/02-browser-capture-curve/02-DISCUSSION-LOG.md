# Phase 2: Browser Capture & Curve - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 02-browser-capture-curve
**Areas discussed:** Capture ownership, Dashboard role, Failure behavior, Browser transport

---

## Capture ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Browser capture | 保持现状，由浏览器直接申请默认麦克风并采样 | |
| Backend capture | 由本地后端直接采样默认麦克风，浏览器只展示 | X |
| Hybrid fallback | 默认后端采样，失败时退回浏览器采样 | |

**User's choice:** Backend capture
**Notes:** 用户明确要求“使用后端麦克风采样，不使用浏览器，浏览器只作为展示页面”。因此前端不再拥有采样权。

---

## Dashboard role

| Option | Description | Selected |
|--------|-------------|----------|
| Active controller | 页面保留开始/停止控制权，并驱动后端采样状态 | |
| Passive dashboard | 页面主要展示后端状态、当前值和曲线 | X |
| Mixed | 页面既展示又允许部分控制 | |

**User's choice:** Passive dashboard
**Notes:** “浏览器只作为展示页面”锁定了被动展示定位。

---

## Failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Browser fallback | 后端失败时回退到浏览器采样 | |
| Unavailable state | 后端失败时页面直接显示不可用状态 | X |
| Silent empty chart | 不提示，只显示没有数据 | |

**User's choice:** Unavailable state
**Notes:** 这与“浏览器不参与采样”一致，避免形成双通道数据源。

---

## Browser transport

| Option | Description | Selected |
|--------|-------------|----------|
| Polling | 浏览器周期性请求后端最新时间序列与统计 | |
| SSE / WebSocket | 后端持续把曲线数据推给浏览器 | |
| the agent decides | 由后续规划根据代码简洁度和实时性需求决定 | X |

**User's choice:** the agent decides
**Notes:** 用户没有锁定浏览器与后端之间的实时传输方式，只锁定了“采样必须在后端”。

---

## the agent's Discretion

- 后端原生采样库选择
- 时间序列对浏览器的输送协议
- 缓冲区与采样频率细节

## Deferred Ideas

- 设备选择器
- 物理声压级校准
- 历史持久化
