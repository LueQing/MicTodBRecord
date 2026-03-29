const CHART_WINDOW_MS = 5 * 60 * 1000;
const MIN_DB = -90;
const MAX_DB = 0;

const elements = {
  avgDb: document.getElementById("avgDb"),
  chart: document.getElementById("chart"),
  currentDb: document.getElementById("currentDb"),
  maxDb: document.getElementById("maxDb"),
  micStatus: document.getElementById("micStatus"),
  sampleCount: document.getElementById("sampleCount"),
  serverStatus: document.getElementById("serverStatus"),
  updatedAt: document.getElementById("updatedAt"),
};

let eventSource;
let timelinePoints = [];
let chartEmptyMessage = "等待后端推送第一笔分贝数据。";

function formatDb(value) {
  return value == null ? "--" : `${value.toFixed(1)} dBFS`;
}

function pruneTimeline(now = Date.now()) {
  const cutoff = now - CHART_WINDOW_MS;
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

  for (let minute = 0; minute <= 5; minute += 1) {
    const x = padding.left + (plotWidth / 5) * minute;
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();

    const minutesAgo = 5 - minute;
    const label = minutesAgo === 0 ? "现在" : `${minutesAgo} 分钟前`;
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
      ((point.timestamp - (now - CHART_WINDOW_MS)) / CHART_WINDOW_MS) * plotWidth;
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

function applySnapshot(payload) {
  const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
  timelinePoints = timeline.map((point) => ({
    db: point.db,
    timestamp: point.timestamp,
  }));
  pruneTimeline();
  updateStats(payload.stats || {});
  updateCaptureStatus(payload.status);
  drawChart();
}

function applySample(payload) {
  if (payload.sample) {
    timelinePoints.push({
      db: payload.sample.db,
      timestamp: payload.sample.timestamp,
    });
  }

  pruneTimeline();
  updateStats(payload.stats || {});
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
drawChart();
connectLiveStream();
