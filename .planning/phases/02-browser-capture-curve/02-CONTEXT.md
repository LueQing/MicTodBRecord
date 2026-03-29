# Phase 2: Backend Capture & Dashboard - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段仍然交付“默认麦克风实时分贝曲线”，但实现方式改为由本地后端进程直接采样系统默认麦克风，浏览器只负责展示实时状态、当前值和时间曲线。浏览器不再拥有麦克风采样职责，也不再申请麦克风权限。

</domain>

<decisions>
## Implementation Decisions

### Capture ownership
- **D-01:** 麦克风采样从浏览器迁移到本地后端服务。
- **D-02:** 浏览器页面是被动展示面板，不调用 `getUserMedia`，不承担采样职责。
- **D-03:** 后端继续以系统当前默认录音设备作为采样源，保持“默认麦克风”这一产品语义。

### Dashboard behavior
- **D-04:** 页面打开后应直接展示后端采样状态和最近读数，而不是要求浏览器授权麦克风。
- **D-05:** 当后端没有可用麦克风、采样失败或设备断开时，页面显示明确的不可用状态，不回退到浏览器采样。

### Data flow
- **D-06:** 实时 dB 与时间序列都由后端产出，再喂给浏览器绘图。
- **D-07:** 现有后端 5 分钟窗口统计和 localhost TCP 广播逻辑继续保留，新的后端采样链路直接喂给这套统计。

### the agent's Discretion
- 原生麦克风采样库或宿主方案的选择
- 浏览器拉取实时曲线数据的传输方式（轮询、SSE 或 WebSocket）
- 后端采样频率、缓冲区大小和降采样策略
- 页面上“采样不可用”与“正在采样”的具体文案和视觉状态

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition
- `.planning/PROJECT.md` - 项目目标、默认麦克风和 localhost 约束
- `.planning/REQUIREMENTS.md` - Phase 2 / Phase 3 相关需求与现有约束
- `.planning/ROADMAP.md` - 当前 Phase 2 边界与目标
- `.planning/STATE.md` - 当前仓库状态和最近一次实现结果

### Current implementation
- `public/app.js` - 当前浏览器采样、绘图和向后端回传读数的实现
- `public/index.html` - 当前展示页面结构
- `public/styles.css` - 当前展示页面样式，可继续复用
- `src/app-server.js` - 当前服务端统计、API 和 TCP 广播实现
- `server.js` - 本地服务入口

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/index.html`: 仪表盘结构和统计卡片可继续复用
- `public/styles.css`: 当前视觉样式与布局可直接保留
- `public/app.js`: 图表绘制、数值格式化、状态显示逻辑可复用；浏览器采样与 `/api/readings` 上传逻辑需要移除或改写
- `src/app-server.js`: 5 分钟滚动统计、`/api/stats`、TCP 广播和静态资源服务都可保留

### Established Patterns
- 当前系统已采用“后端为统计真源、前端负责展示”的模式，`maxDb` / `avgDb` / `sampleCount` 都由后端维护
- 前端是纯原生 JS，没有打包步骤，改动应保持简单直接
- TCP 广播已经位于后端，因此把采样也放到后端会让数据所有权更一致

### Integration Points
- 当前浏览器采样入口在 `public/app.js` 的 `startMonitoring` / `sampleReading`
- 当前后端读数入口是 `src/app-server.js` 的 `POST /api/readings`
- 计划中的后端采样器应直接接入 `addReading(...)` 或其等价入口，并新增供浏览器读取时间序列的接口

</code_context>

<specifics>
## Specific Ideas

- 浏览器只作为展示页面，不参与麦克风访问
- 数据源以本地后端采样为准
- 不接受“后端失败时再退回浏览器采样”的混合方案

</specifics>

<deferred>
## Deferred Ideas

- 麦克风设备选择器 - 属于后续增强，不是这次 Phase 2 讨论范围
- `dB SPL` 校准 - 依旧是后续增强，不在这次架构切换内
- 历史持久化与导出 - 与本次“采样位置迁移”无关

</deferred>

---

*Phase: 02-browser-capture-curve*
*Context gathered: 2026-03-29*
