const CHART_WINDOW_MS = 5 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 250;
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
  startButton: document.getElementById("startButton"),
  stopButton: document.getElementById("stopButton"),
  updatedAt: document.getElementById("updatedAt"),
};

let analyser;
let audioContext;
let byteBuffer;
let floatBuffer;
let mediaStream;
let mediaStreamSource;
let postInFlight = false;
let sampleTimer = null;
let timelinePoints = [];

function formatDb(value) {
  return value == null ? "--" : `${value.toFixed(1)} dBFS`;
}

function setMicStatus(text) {
  elements.micStatus.textContent = text;
}

function setServerStatus(text) {
  elements.serverStatus.textContent = text;
}

function pruneTimeline(now = Date.now()) {
  const cutoff = now - CHART_WINDOW_MS;
  timelinePoints = timelinePoints.filter((point) => point.timestamp >= cutoff);
}

function updateServerStats(stats) {
  elements.maxDb.textContent = formatDb(stats.maxDb);
  elements.avgDb.textContent = formatDb(stats.avgDb);
  elements.sampleCount.textContent = String(stats.readingCount ?? 0);
  elements.updatedAt.textContent =
    stats.readingCount > 0
      ? `服务更新时间 ${new Date(stats.updatedAt).toLocaleTimeString()}`
      : "等待第一笔样本";
}

async function refreshServerStats() {
  try {
    const response = await fetch("/api/stats", {
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Stats request failed");
    }

    updateServerStats(payload.stats);
    setServerStatus("服务已连接");
  } catch (error) {
    setServerStatus("服务不可达");
  }
}

async function sendReading(db) {
  if (postInFlight) {
    return;
  }

  postInFlight = true;

  try {
    const response = await fetch("/api/readings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ db }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Upload failed");
    }

    updateServerStats(payload.stats);
    setServerStatus("服务已连接");
  } catch (error) {
    setServerStatus("服务写入失败");
  } finally {
    postInFlight = false;
  }
}

function computeDecibels() {
  if (!analyser) {
    return null;
  }

  let rms = 0;

  if (typeof analyser.getFloatTimeDomainData === "function") {
    analyser.getFloatTimeDomainData(floatBuffer);

    let sum = 0;
    for (const sample of floatBuffer) {
      sum += sample * sample;
    }
    rms = Math.sqrt(sum / floatBuffer.length);
  } else {
    analyser.getByteTimeDomainData(byteBuffer);

    let sum = 0;
    for (const sample of byteBuffer) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    rms = Math.sqrt(sum / byteBuffer.length);
  }

  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.max(MIN_DB, Math.min(MAX_DB, db));
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
    context.fillText("开始监听后，这里会出现分贝曲线。", padding.left, height / 2);
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

function sampleReading() {
  const db = computeDecibels();

  if (db == null) {
    return;
  }

  const now = Date.now();
  timelinePoints.push({ timestamp: now, db });
  pruneTimeline(now);

  elements.currentDb.textContent = formatDb(db);
  drawChart();
  void sendReading(db);
}

async function startMonitoring() {
  elements.startButton.disabled = true;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });

    audioContext = new window.AudioContext();
    await audioContext.resume();

    mediaStreamSource = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    mediaStreamSource.connect(analyser);

    floatBuffer = new Float32Array(analyser.fftSize);
    byteBuffer = new Uint8Array(analyser.fftSize);

    sampleTimer = window.setInterval(sampleReading, SAMPLE_INTERVAL_MS);

    setMicStatus("麦克风监听中");
    elements.stopButton.disabled = false;
    refreshServerStats();
  } catch (error) {
    console.error(error);
    setMicStatus("麦克风权限失败或设备不可用");
    elements.startButton.disabled = false;
  }
}

async function stopMonitoring() {
  if (sampleTimer) {
    window.clearInterval(sampleTimer);
    sampleTimer = null;
  }

  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = undefined;
  }

  if (analyser) {
    analyser.disconnect?.();
    analyser = undefined;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = undefined;
  }

  setMicStatus("麦克风已停止");
  elements.startButton.disabled = false;
  elements.stopButton.disabled = true;
}

elements.startButton.addEventListener("click", () => {
  void startMonitoring();
});

elements.stopButton.addEventListener("click", () => {
  void stopMonitoring();
});

window.addEventListener("resize", drawChart);
window.addEventListener("beforeunload", () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
});

refreshServerStats();
drawChart();
