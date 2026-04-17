# Phase 3: Rolling Stats & Broadcast - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17T00:00:00Z
**Phase:** 03-rolling-stats-broadcast
**Areas discussed:** Loud segment detection, Recording retention, Structured logging

---

## Loud segment detection

| Option | Description | Selected |
|--------|-------------|----------|
| Keep stats only | 只保留 5 分钟统计，不新增录音事件机制 | |
| Threshold-triggered events at `-20 dBFS` | 超过阈值触发高音量事件并进入片段处理 | ✓ |
| Multi-level thresholds | 多级阈值和复杂告警分级 | |

**User's choice:** Threshold-triggered events at `-20 dBFS`.
**Notes:** 用户先指定阈值为 `-20`，并希望后续可按同一机制扩展。

---

## Recording retention

| Option | Description | Selected |
|--------|-------------|----------|
| No recording persistence | 仅记录统计值，不落盘音频 | |
| Save event segment with pre/post buffer | 保存超过阈值片段，并在前后各保留 5 秒缓冲 | ✓ |
| Continuous full-session recording | 全程连续录音，再离线切片 | |

**User's choice:** Save event segment with pre/post buffer.
**Notes:** 用户明确要求每段高音量录音保留触发前后各 `5s`。

---

## Structured logging

| Option | Description | Selected |
|--------|-------------|----------|
| Human-readable text log | 纯文本日志，便于人工阅读 | |
| Structured event log with datetime naming | 结构化日志，按日期时间命名并记录高音量时间 | ✓ |
| External database sink | 落外部数据库/消息系统 | |

**User's choice:** Structured event log with datetime naming.
**Notes:** 用户明确要求日志里写明“音量很大”的时间，并与录音命名对齐。

---

## the agent's Discretion

- 录音文件具体编码与采样写盘策略
- 片段结束判定的去抖策略
- 目录结构与文件命名细节（保持日期时间主键）

## Deferred Ideas

- 多级阈值与告警通知机制
- 历史归档/导出报表

