# Requirements: Mic dB Record

**Defined:** 2026-03-29
**Core Value:** 用户在本机启动本地服务并打开页面后，能稳定看到由后端默认麦克风采样驱动的实时分贝时间曲线，并从本地 TCP 拿到最近 5 分钟的最大值和平均值。

## v1 Requirements

### Audio Capture

- [ ] **AUD-01**: 本地后端服务可以使用系统默认麦克风开始采样
- [ ] **AUD-02**: 本地后端服务在停止采样、设备不可用或采样失败时可以释放录音资源并上报状态
- [ ] **AUD-03**: 本地后端服务可以把麦克风输入换算为可显示的相对分贝 `dBFS`

### Visualization

- [ ] **VIS-01**: 浏览器可以展示后端提供的最近 5 分钟分贝时间曲线
- [ ] **VIS-02**: 页面可以显示当前分贝值与后端采样状态
- [ ] **VIS-03**: 页面可以在服务可用或不可用时显示连接状态

### Rolling Stats

- [ ] **STAT-01**: 后端采样链路可以把读数持续送入本地服务的 5 分钟统计窗口
- [ ] **STAT-02**: 本地服务可以维护最近 5 分钟窗口内的最大值和平均值
- [ ] **STAT-03**: 页面可以显示服务端维护的 5 分钟最大值、平均值和样本数

### TCP Broadcast

- [ ] **TCP-01**: 本地服务可以在 `127.0.0.1` 上暴露 HTTP 网站与 API
- [ ] **TCP-02**: 本地服务可以在 `127.0.0.1` 上接受 TCP 客户端连接
- [ ] **TCP-03**: TCP 客户端可以收到包含 `maxDb`、`avgDb`、`lastDb`、`updatedAt` 的按行 JSON 广播

## v2 Requirements

### Measurement

- **MEAS-01**: 用户可以配置校准偏移，把 `dBFS` 换算为更接近 `dB SPL` 的展示值
- **MEAS-02**: 用户可以选择不同输入设备而不是只使用默认麦克风

### Data

- **DATA-01**: 用户可以导出分贝时间曲线为 CSV 或 JSON
- **DATA-02**: 用户可以保留本地历史记录并回放过去窗口

## Out of Scope

| Feature | Reason |
|---------|--------|
| 真实声级计级别的物理标定 | 没有外部标定设备时结果不可靠 |
| 远程局域网或公网广播 | 当前目标限定为 `localhost` 单机使用 |
| 多用户共享会话 | 与本次 MVP 的本地工具定位不符 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUD-01 | Phase 2 | Pending |
| AUD-02 | Phase 2 | Pending |
| AUD-03 | Phase 2 | Pending |
| VIS-01 | Phase 2 | Pending |
| VIS-02 | Phase 2 | Pending |
| VIS-03 | Phase 3 | Complete |
| STAT-01 | Phase 3 | Complete |
| STAT-02 | Phase 3 | Complete |
| STAT-03 | Phase 3 | Complete |
| TCP-01 | Phase 1 | Complete |
| TCP-02 | Phase 1 | Complete |
| TCP-03 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after phase 2 backend-capture refactor kickoff*
