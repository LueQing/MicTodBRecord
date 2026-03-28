# State: Mic dB Record

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-29)

**Core value:** 用户在本机打开页面并授权默认麦克风后，能稳定看到实时分贝时间曲线，并从本地 TCP 拿到最近 5 分钟的最大值和平均值。
**Current focus:** 使用真实麦克风做本地人工验收

## Milestone

- Current milestone: MVP local prototype
- Project mode: YOLO
- Granularity: coarse
- Parallelization: enabled

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Local Runtime Foundation | Complete | 本地 HTTP/TCP 运行时与静态站点已实现 |
| 2 | Browser Capture & Curve | Complete | 默认麦克风采样与 5 分钟曲线已实现 |
| 3 | Rolling Stats & Broadcast | Complete | 服务端统计与 TCP 广播已实现 |

## Validation Notes

- `npm test` 已通过，覆盖静态入口、HTTP API、5 分钟窗口过期逻辑、TCP 广播
- 浏览器麦克风权限与真实环境噪声曲线仍需要人工验收

## Next

- 执行 `npm start`
- 在浏览器中授权默认麦克风并观察曲线与统计
- 如需下游消费，连接 `127.0.0.1:7070` 读取 JSON 行

---
*Last updated: 2026-03-29 after MVP prototype implementation*
