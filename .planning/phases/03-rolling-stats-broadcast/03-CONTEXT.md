# Phase 3: Rolling Stats & Broadcast - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段在现有“5 分钟滚动统计 + 网页/TCP 回显”基础上，新增“高音量片段自动留存”能力：当采样值超过阈值时，自动保存该片段录音，并输出结构化日志用于追踪高音量发生时间。

</domain>

<decisions>
## Implementation Decisions

### Loud segment detection
- **D-01:** 以 `dBFS` 阈值作为触发条件，默认阈值先使用 `-20 dBFS`。
- **D-02:** 当读数首次超过阈值时，判定进入“高音量片段”；当读数连续低于阈值并满足结束条件时，判定片段结束。
- **D-03:** 阈值应设计为可配置项（当前默认值 `-20`），便于后续调优。

### Recording retention behavior
- **D-04:** 每个高音量片段需要保存录音文件，录音内容包含触发前 `5s` 缓冲与触发后 `5s` 缓冲。
- **D-05:** 录音与结构化日志均使用日期时间命名，确保可按时间快速检索。
- **D-06:** 单个高音量事件对应单个录音文件与一条结构化事件记录，两者通过同一事件时间标识关联。

### Structured logging
- **D-07:** 结构化日志必须记录“音量很大”的发生时间点（至少包含触发时间）。
- **D-08:** 结构化日志中应记录该事件的阈值、片段起止时间、峰值分贝，保证后续可审计。
- **D-09:** 日志格式采用机器可解析结构（JSON/NDJSON 风格），避免纯文本描述。

### the agent's Discretion
- 录音容器与编码细节（如 WAV/PCM 参数）在不引入复杂依赖前提下由 the agent 决定
- 高音量片段“结束条件”的具体去抖策略（如静音保持时长）由 the agent 决定
- 录音与日志落盘目录结构（在本地工程内）由 the agent 决定

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement anchors
- `.planning/ROADMAP.md` - Phase 3 原始边界与成功标准
- `.planning/REQUIREMENTS.md` - `VIS-03`, `STAT-01/02/03`, `TCP-03` 及本地化约束
- `.planning/PROJECT.md` - 本地运行、`dBFS` 语义、最小依赖原则
- `.planning/STATE.md` - 当前阶段执行状态与已完成能力

### Current implementation baseline
- `src/app-server.js` - 采样接入、滚动窗口统计、SSE 与 TCP 广播主流程
- `src/mic-source.js` - 默认麦克风采样与 `dBFS` 计算链路
- `tests/app-server.test.js` - 现有统计窗口与广播行为基线测试
- `README.md` - 本地运行方式、TCP 消息约定、`dBFS` 说明

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app-server.js` 的 `handleCaptureSample` 和 `addReading` 可作为高音量检测主接入点
- `src/mic-source.js` 已输出连续 `db/timestamp` 样本，可直接复用为事件检测输入
- 现有 TCP/SSE 广播通道可继续用于页面状态补充（无需新增远程通道）

### Established Patterns
- 统计窗口逻辑统一在服务端维护，前端为只读展示
- 项目偏好 Node 内置能力与少依赖方案
- 所有测量语义均按未校准 `dBFS` 解释

### Integration Points
- 在 `handleCaptureSample` 内串接阈值状态机与片段缓冲逻辑
- 在服务端新增本地文件写入模块用于录音与事件日志
- 在测试侧扩展事件触发/命名/日志字段断言

</code_context>

<specifics>
## Specific Ideas

- 触发阈值先按 `-20 dBFS` 实施
- 每个事件录音要求“前后各 5 秒”缓冲
- 录音和日志都按日期时间命名
- 日志中明确记录高音量发生时间

</specifics>

<deferred>
## Deferred Ideas

- 多阈值分级告警（如 warning/critical）
- 长期历史聚合报表与导出
- 声压级校准（`dB SPL`）与设备选择器

</deferred>

---

*Phase: 03-rolling-stats-broadcast*
*Context gathered: 2026-04-17*
