# Roadmap: Mic dB Record

**Created:** 2026-03-29
**Phases:** 3
**v1 requirements mapped:** 12 / 12

## Overview

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | Local Runtime Foundation | 建立本地 HTTP/TCP 运行时与最小项目骨架 | TCP-01, TCP-02 |
| 2 | Backend Capture & Dashboard | 让本地后端直接采样默认麦克风，并把实时曲线数据提供给浏览器展示 | AUD-01, AUD-02, AUD-03, VIS-01, VIS-02 |
| 3 | Rolling Stats & Broadcast | 维护 5 分钟统计，并把结果展示到网页和 TCP | VIS-03, STAT-01, STAT-02, STAT-03, TCP-03 |

## Phase Details

### Phase 1: Local Runtime Foundation

**Goal:** 让项目可以作为本地工具启动，既能提供网页资源，也能在 localhost 接受 TCP 客户端。

**Requirements:** TCP-01, TCP-02

**Success Criteria**
1. 执行启动命令后，用户可以在 `127.0.0.1` 打开网站入口
2. 本地服务可以提供 `/api/stats` 和 `/api/readings`
3. TCP 客户端可以连接到固定 localhost 端口并保持连接

### Phase 2: Backend Capture & Dashboard

**Goal:** 让本地后端直接采样系统默认麦克风、换算为 `dBFS`，并向浏览器提供近 5 分钟时间曲线数据。

**Requirements:** AUD-01, AUD-02, AUD-03, VIS-01, VIS-02

**Success Criteria**
1. 启动服务后，后端直接开始使用系统默认录音设备采样
2. 浏览器不再申请麦克风权限，只展示后端提供的当前值与状态
3. 图表在近 5 分钟窗口内持续滚动更新，并由后端数据源驱动

### Phase 3: Rolling Stats & Broadcast

**Goal:** 把后端采样结果送入本地服务统计窗口，计算最近 5 分钟最大值与平均值，并同时回显到网页与 TCP 客户端。

**Requirements:** VIS-03, STAT-01, STAT-02, STAT-03, TCP-03

**Success Criteria**
1. 后端采样链路持续将分贝读数送入本地服务
2. 服务端可以返回当前窗口最大值、平均值与样本数
3. TCP 客户端持续收到按行 JSON 的统计广播

## Traceability Update

| Requirement | Phase |
|-------------|-------|
| AUD-01 | Phase 2 |
| AUD-02 | Phase 2 |
| AUD-03 | Phase 2 |
| VIS-01 | Phase 2 |
| VIS-02 | Phase 2 |
| VIS-03 | Phase 3 |
| STAT-01 | Phase 3 |
| STAT-02 | Phase 3 |
| STAT-03 | Phase 3 |
| TCP-01 | Phase 1 |
| TCP-02 | Phase 1 |
| TCP-03 | Phase 3 |

## Status

- Current milestone: MVP local prototype
- Current focus: 执行 Phase 2 的后端采样重构
- Phase 1 status: Complete
- Phase 2 status: In Progress
- Phase 3 status: Complete
- Next recommended step: `$gsd-execute-phase 2`

---
*Last updated: 2026-03-29 after phase 2 backend-capture refactor kickoff*
