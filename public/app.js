const DEFAULT_CHART_WINDOW_SECONDS = 10 * 60;
const CHART_TICK_COUNT = 5;
const MIN_DB = -90;
const MAX_DB = 0;

const elements = {
  avgDb: document.getElementById("avgDb"),
  captureBuffer: document.getElementById("captureBuffer"),
  captureEnabled: document.getElementById("captureEnabled"),
  captureOutputDir: document.getElementById("captureOutputDir"),
  captureThreshold: document.getElementById("captureThreshold"),
  chart: document.getElementById("chart"),
  currentDb: document.getElementById("currentDb"),
  heatmapBody: document.getElementById("heatmapBody"),
  heatmapHours: document.getElementById("heatmapHours"),
  heatmapSummary: document.getElementById("heatmapSummary"),
  latestCaptureAudio: document.getElementById("latestCaptureAudio"),
  latestCaptureMeta: document.getElementById("latestCaptureMeta"),
  maxDb: document.getElementById("maxDb"),
  micStatus: document.getElementById("micStatus"),
  playLatestCapture: document.getElementById("playLatestCapture"),
  refreshHeatmap: document.getElementById("refreshHeatmap"),
  sampleCount: document.getElementById("sampleCount"),
  serverStatus: document.getElementById("serverStatus"),
  updatedAt: document.getElementById("updatedAt"),
};

let eventSource;
let chartWindowSeconds = DEFAULT_CHART_WINDOW_SECONDS;
let timelinePoints = [];
let chartEmptyMessage = "等待后端推送第一笔分贝数据。";
const HEATMAP_THRESHOLD_DB = -20;
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function formatDb(value) {
  return value == null ? "--" : `${value.toFixed(1)} dBFS`;
}

function getChartWindowMs() {
  return chartWindowSeconds * 1000;
}

function formatTimeAgoLabel(secondsAgo) {
  if (chartWindowSeconds >= 60) {
    const minutesAgo = Math.round(secondsAgo / 60);
    return minutesAgo === 0 ? "现在" : `${minutesAgo} 分钟前`;
  }

  return secondsAgo === 0 ? "现在" : `${secondsAgo} 秒前`;
}

function pruneTimeline(now = Date.now()) {
  const cutoff = now - getChartWindowMs();
  timelinePoints = timelinePoints.filter((point) => point.timestamp >= cutoff);
}

function setPillState(element, text, tone) {
  element.textContent = text;
  element.dataset.tone = tone;
}

function setServerStatus(text, tone = "neutral") {
  setPillState(elements.serverStatus, text, tone);
}

function updateCaptureStatus(status) {
  const state = status?.state || "idle";
  const deviceName = status?.deviceName ? ` (${status.deviceName})` : "";
  const message = status?.message || "";

  if (state === "live") {
    chartEmptyMessage = "后端已连接默认麦克风，等待新的分贝样本。";
    setPillState(elements.micStatus, `后端采样中${deviceName}`, "live");
    return;
  }

  if (state === "starting") {
    chartEmptyMessage = "后端正在初始化默认麦克风。";
    setPillState(elements.micStatus, "后端正在启动采样", "pending");
    return;
  }

  if (state === "unavailable") {
    chartEmptyMessage = message || "后端没有可用的默认麦克风。";
    setPillState(elements.micStatus, "默认麦克风不可用", "warn");
    return;
  }

  if (state === "error") {
    chartEmptyMessage = message || "后端采样失败。";
    setPillState(elements.micStatus, "后端采样错误", "error");
    return;
  }

  chartEmptyMessage = "等待后端启动默认麦克风。";
  setPillState(elements.micStatus, "等待后端采样", "neutral");
}

function updateStats(stats) {
  elements.currentDb.textContent = formatDb(stats?.lastDb ?? null);
  elements.maxDb.textContent = formatDb(stats?.maxDb ?? null);
  elements.avgDb.textContent = formatDb(stats?.avgDb ?? null);
  elements.sampleCount.textContent = String(stats?.readingCount ?? 0);
  elements.updatedAt.textContent =
    stats?.readingCount > 0
      ? `服务端更新时间 ${new Date(stats.updatedAt).toLocaleTimeString()}`
      : "等待后端样本";
}

function updateLoudCaptureConfig(config) {
  elements.captureEnabled.textContent = config?.enabled ? "已启用" : "已禁用";
  elements.captureThreshold.textContent = Number.isFinite(config?.thresholdDb)
    ? `${config.thresholdDb} dBFS`
    : "--";
  elements.captureBuffer.textContent = Number.isFinite(config?.bufferSeconds)
    ? `${config.bufferSeconds} 秒`
    : "--";
  elements.captureOutputDir.textContent = config?.recordingsDir
    ? config.recordingsDir
    : "--";
}

function syncCanvasSize() {
  const { chart } = elements;
  const rect = chart.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (chart.width !== width || chart.height !== height) {
    chart.width = width;
    chart.height = height;
  }

  const context = chart.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawChart() {
  const { context, width, height } = syncCanvasSize();
  const padding = { top: 16, right: 12, bottom: 26, left: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  context.clearRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.74)";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(35, 27, 17, 0.08)";
  context.lineWidth = 1;
  context.font = '12px "IBM Plex Sans", sans-serif';
  context.fillStyle = "rgba(103, 89, 71, 0.9)";

  for (let db = MAX_DB; db >= MIN_DB; db -= 15) {
    const ratio = (db - MIN_DB) / (MAX_DB - MIN_DB);
    const y = padding.top + plotHeight - ratio * plotHeight;

    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(`${db} dB`, 8, y + 4);
  }

  for (let tick = 0; tick <= CHART_TICK_COUNT; tick += 1) {
    const x = padding.left + (plotWidth / CHART_TICK_COUNT) * tick;
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();

    const secondsAgo = Math.round(
      chartWindowSeconds - (chartWindowSeconds / CHART_TICK_COUNT) * tick,
    );
    const label = formatTimeAgoLabel(secondsAgo);
    context.fillText(label, x - 18, height - 8);
  }

  if (timelinePoints.length === 0) {
    context.fillStyle = "rgba(103, 89, 71, 0.9)";
    context.font = '16px "IBM Plex Sans", sans-serif';
    context.fillText(chartEmptyMessage, padding.left, height / 2);
    return;
  }

  const now = Date.now();
  const gradient = context.createLinearGradient(
    0,
    padding.top,
    0,
    height - padding.bottom,
  );
  gradient.addColorStop(0, "rgba(212, 95, 49, 0.9)");
  gradient.addColorStop(1, "rgba(14, 143, 134, 0.95)");

  context.strokeStyle = gradient;
  context.lineWidth = 2.5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  timelinePoints.forEach((point, index) => {
    const x =
      padding.left +
      ((point.timestamp - (now - getChartWindowMs())) / getChartWindowMs()) *
        plotWidth;
    const clampedDb = Math.max(MIN_DB, Math.min(MAX_DB, point.db));
    const y =
      padding.top +
      plotHeight -
      ((clampedDb - MIN_DB) / (MAX_DB - MIN_DB)) * plotHeight;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  context.stroke();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function formatCaptureMeta(capture) {
  if (!capture) {
    return "暂无可播放的 capture record。";
  }

  const timeText = new Date(capture.highVolumeAt).toLocaleString();
  const peakText = Number.isFinite(capture.peakDb)
    ? `${capture.peakDb.toFixed(1)} dBFS`
    : "--";
  const durationText = Number.isFinite(capture.durationSeconds)
    ? `${capture.durationSeconds.toFixed(1)} 秒`
    : "--";

  return `最近事件: ${timeText}，峰值 ${peakText}，时长 ${durationText}。`;
}

async function loadLatestCapture() {
  elements.playLatestCapture.disabled = true;
  elements.latestCaptureMeta.textContent = "正在读取最近录音事件...";

  try {
    const payload = await fetchJson("/api/captures/latest");
    const latest = payload.latest;

    if (!latest) {
      elements.latestCaptureAudio.removeAttribute("src");
      elements.latestCaptureAudio.load();
      elements.playLatestCapture.disabled = true;
      elements.latestCaptureMeta.textContent = "暂无可播放的 capture record。";
      return;
    }

    elements.latestCaptureAudio.src = latest.audioUrl;
    elements.latestCaptureMeta.textContent = formatCaptureMeta(latest);
    elements.playLatestCapture.disabled = false;
  } catch (error) {
    elements.latestCaptureAudio.removeAttribute("src");
    elements.latestCaptureAudio.load();
    elements.playLatestCapture.disabled = true;
    elements.latestCaptureMeta.textContent = `读取最近录音失败: ${error.message}`;
  }
}

function renderHeatmapHours() {
  const label = document.createElement("div");
  label.className = "heatmap-label";
  label.textContent = "日期";
  elements.heatmapHours.replaceChildren(label);

  for (const hour of HEATMAP_HOURS) {
    const hourNode = document.createElement("div");
    hourNode.className = "heatmap-hour";
    hourNode.textContent = String(hour).padStart(2, "0");
    elements.heatmapHours.appendChild(hourNode);
  }
}

function getHeatColor(intensity) {
  const clamped = Math.max(0, Math.min(1, intensity));
  const alpha = 0.08 + clamped * 0.82;
  return `rgba(212, 95, 49, ${alpha.toFixed(3)})`;
}

function renderHeatmap(days, maxCount) {
  elements.heatmapBody.replaceChildren();

  if (!Array.isArray(days) || days.length === 0) {
    elements.heatmapSummary.textContent = `暂无超过 ${HEATMAP_THRESHOLD_DB} dBFS 的历史事件。`;
    return;
  }

  for (const day of days) {
    const row = document.createElement("div");
    row.className = "heatmap-row";

    const label = document.createElement("div");
    label.className = "heatmap-label";
    label.textContent = day.date;
    row.appendChild(label);

    for (const hour of HEATMAP_HOURS) {
      const count = day.hours?.[hour] ?? 0;
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      const intensity = maxCount > 0 ? count / maxCount : 0;
      cell.style.background = getHeatColor(intensity);
      cell.title = `${day.date} ${String(hour).padStart(2, "0")}:00 - 次数: ${count}`;
      row.appendChild(cell);
    }

    elements.heatmapBody.appendChild(row);
  }

  const totalEvents = days.reduce((sum, day) => sum + (day.total || 0), 0);
  elements.heatmapSummary.textContent = `统计 ${days.length} 天，阈值 ${HEATMAP_THRESHOLD_DB} dBFS，总超阈值次数 ${totalEvents}，单小时最大 ${maxCount} 次。`;
}

async function refreshHeatmap() {
  elements.refreshHeatmap.disabled = true;
  elements.heatmapSummary.textContent = "正在生成热力图...";

  try {
    const payload = await fetchJson(
      `/api/captures/heatmap?threshold=${HEATMAP_THRESHOLD_DB}`,
    );
    renderHeatmap(payload.days, payload.maxCount || 0);
  } catch (error) {
    elements.heatmapBody.replaceChildren();
    elements.heatmapSummary.textContent = `热力图加载失败: ${error.message}`;
  } finally {
    elements.refreshHeatmap.disabled = false;
  }
}

function applySnapshot(payload) {
  if (Number.isFinite(payload.timelineWindowSeconds)) {
    chartWindowSeconds = payload.timelineWindowSeconds;
  }

  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  timelinePoints = timeline.map((point) => ({
    db: point.db,
    timestamp: point.timestamp,
  }));
  pruneTimeline();
  updateStats(payload.stats || {});
  updateLoudCaptureConfig(payload.loudCapture || {});
  updateCaptureStatus(payload.status);
  drawChart();
}

function applySample(payload) {
  if (Number.isFinite(payload.timelineWindowSeconds)) {
    chartWindowSeconds = payload.timelineWindowSeconds;
  }

  if (payload.sample) {
    timelinePoints.push({
      db: payload.sample.db,
      timestamp: payload.sample.timestamp,
    });
  }

  pruneTimeline();
  updateStats(payload.stats || {});
  updateLoudCaptureConfig(payload.loudCapture || {});
  updateCaptureStatus(payload.status);
  drawChart();
}

function connectLiveStream() {
  if (eventSource) {
    eventSource.close();
  }

  setServerStatus("正在连接实时流", "pending");
  eventSource = new EventSource("/api/live");

  eventSource.onopen = () => {
    setServerStatus("实时流已连接", "live");
  };

  eventSource.onerror = () => {
    setServerStatus("实时流断开，等待重连", "error");
    chartEmptyMessage = timelinePoints.length
      ? chartEmptyMessage
      : "与后端的实时连接已断开，正在自动重连。";
    drawChart();
  };

  eventSource.addEventListener("status", (event) => {
    const payload = JSON.parse(event.data);
    updateStats(payload.stats || {});
    updateLoudCaptureConfig(payload.loudCapture || {});
    updateCaptureStatus(payload.status);
    drawChart();
  });

  eventSource.addEventListener("snapshot", (event) => {
    const payload = JSON.parse(event.data);
    applySnapshot(payload);
  });

  eventSource.addEventListener("sample", (event) => {
    const payload = JSON.parse(event.data);
    applySample(payload);
  });
}

function bindCaptureActions() {
  elements.playLatestCapture.addEventListener("click", async () => {
    try {
      await loadLatestCapture();
      if (elements.latestCaptureAudio.src) {
        await elements.latestCaptureAudio.play();
      }
    } catch (error) {
      elements.latestCaptureMeta.textContent = `播放失败: ${error.message}`;
    }
  });

  elements.refreshHeatmap.addEventListener("click", () => {
    refreshHeatmap();
  });
}

window.addEventListener("resize", drawChart);
window.addEventListener("beforeunload", () => {
  eventSource?.close();
});

setServerStatus("准备连接实时流", "pending");
updateCaptureStatus({ state: "idle" });
updateStats({
  avgDb: null,
  lastDb: null,
  maxDb: null,
  readingCount: 0,
  updatedAt: new Date().toISOString(),
});
updateLoudCaptureConfig({
  bufferSeconds: null,
  enabled: false,
  recordingsDir: null,
  thresholdDb: null,
});
drawChart();
renderHeatmapHours();
bindCaptureActions();
loadLatestCapture();
refreshHeatmap();
connectLiveStream();
