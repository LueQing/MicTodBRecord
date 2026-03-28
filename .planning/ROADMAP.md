# Roadmap: Mic dB Record

**Created:** 2026-03-29
**Phases:** 3
**v1 requirements mapped:** 12 / 12

## Overview

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | Local Runtime Foundation | 建立本地 HTTP/TCP 运行时与最小项目骨架 | TCP-01, TCP-02 |
| 2 | Browser Capture & Curve | 从默认麦克风取样并在网页绘制分贝时间曲线 | AUD-01, AUD-02, AUD-03, VIS-01, VIS-02 |
| 3 | Rolling Stats & Broadcast | 维护 5 分钟统计，并把结果展示到网页和 TCP | VIS-03, STAT-01, STAT-02, STAT-03, TCP-03 |

## Phase Details

### Phase 1: Local Runtime Foundation

**Goal:** 让项目可以作为本地工具启动，既能提供网页资源，也能在 localhost 接受 TCP 客户端。

**Requirements:** TCP-01, TCP-02

**Success Criteria**
1. 执行启动命令后，用户可以在 `127.0.0.1` 打开网站入口
2. 本地服务可以提供 `/api/stats` 和 `/api/readings`
3. TCP 客户端可以连接到固定 localhost 端口并保持连接

### Phase 2: Browser Capture & Curve

**Goal:** 让浏览器默认麦克风的输入可以被采样、换算为 `dBFS`，并绘制近 5 分钟时间曲线。

**Requirements:** AUD-01, AUD-02, AUD-03, VIS-01, VIS-02

**Success Criteria**
1. 点击开始监听后，浏览器请求默认麦克风权限并开始采样
2. 页面可显示当前分贝值与监听状态
3. 图表在近 5 分钟窗口内持续滚动更新

### Phase 3: Rolling Stats & Broadcast

**Goal:** 把浏览器采样结果汇总到本地服务，计算最近 5 分钟最大值与平均值，并同时回显到网页与 TCP 客户端。

**Requirements:** VIS-03, STAT-01, STAT-02, STAT-03, TCP-03

**Success Criteria**
1. 浏览器持续将分贝读数发送到本地服务
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
- Current focus: 使用真实麦克风做人工验收
- Phase 1 status: Complete
- Phase 2 status: Complete
- Phase 3 status: Complete
- Next recommended step: 本地启动并用真实麦克风做用户验收

---
*Last updated: 2026-03-29 after MVP prototype implementation*
