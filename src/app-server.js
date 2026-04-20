const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const { createMicSource } = require("./mic-source");

const DEFAULT_STATS_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_TIMELINE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BROADCAST_INTERVAL_MS = 1000;
const DEFAULT_SSE_HEARTBEAT_MS = 15000;
const DEFAULT_LOUD_THRESHOLD_DB = -20;
const DEFAULT_LOUD_CAPTURE_BUFFER_MS = 5000;
const DEFAULT_LOUD_CAPTURE_SAMPLE_RATE = 44100;
const HEATMAP_HOUR_COUNT = 24;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function createDbMonitorApp(options = {}) {
  const host = options.host || "127.0.0.1";
  const requestedHttpPort = options.httpPort ?? 3000;
  const requestedTcpPort = options.tcpPort ?? 7070;
  const statsWindowMs = options.windowMs ?? DEFAULT_STATS_WINDOW_MS;
  const timelineWindowMs = options.timelineWindowMs ?? DEFAULT_TIMELINE_WINDOW_MS;
  const broadcastIntervalMs =
    options.broadcastIntervalMs ?? DEFAULT_BROADCAST_INTERVAL_MS;
  const sampleSourceFactory = options.sampleSourceFactory || createMicSource;
  const loudCaptureEnabled = options.loudCaptureEnabled ?? true;
  const loudThresholdDb = Number.isFinite(options.loudThresholdDb)
    ? Number(options.loudThresholdDb)
    : DEFAULT_LOUD_THRESHOLD_DB;
  const loudCaptureBufferMs = Number.isFinite(options.loudCaptureBufferMs)
    ? Number(options.loudCaptureBufferMs)
    : DEFAULT_LOUD_CAPTURE_BUFFER_MS;
  const loudCaptureDir = path.resolve(
    options.loudCaptureDir || path.join(__dirname, "..", "captures"),
  );
  const loudCaptureRecordingsDir = path.join(loudCaptureDir, "recordings");
  const loudCaptureLogsDir = path.join(loudCaptureDir, "logs");
  const publicDir = path.resolve(
    options.publicDir || path.join(__dirname, "..", "public"),
  );

  const statsReadings = [];
  const timelineReadings = [];
  const sseClients = new Set();
  const tcpClients = new Set();
  const pcmBuffer = [];
  const persistTasks = new Set();
  let activeLoudEvent = null;

  let captureSource;
  let captureStatus = {
    deviceName: null,
    message: "Capture source has not started yet.",
    state: "idle",
    updatedAt: new Date().toISOString(),
  };
  let httpServer;
  let tcpServer;
  let broadcastTimer;
  let sseHeartbeatTimer;

  function padInt(value, width) {
    return String(value).padStart(width, "0");
  }

  function formatEventId(now = Date.now()) {
    const date = new Date(now);
    return [
      `${date.getFullYear()}${padInt(date.getMonth() + 1, 2)}${padInt(date.getDate(), 2)}`,
      "T",
      `${padInt(date.getHours(), 2)}${padInt(date.getMinutes(), 2)}${padInt(date.getSeconds(), 2)}`,
      "-",
      padInt(date.getMilliseconds(), 3),
    ].join("");
  }

  function createWavBuffer(pcmData, sampleRate) {
    const dataSize = pcmData.length;
    const header = Buffer.alloc(44);
    const normalizedSampleRate =
      Number.isFinite(sampleRate) && sampleRate > 0
        ? Math.round(sampleRate)
        : DEFAULT_LOUD_CAPTURE_SAMPLE_RATE;
    const byteRate = normalizedSampleRate * 2;
    const blockAlign = 2;

    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(normalizedSampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36, "ascii");
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }

  function trackPersistTask(taskPromise) {
    persistTasks.add(taskPromise);
    taskPromise.finally(() => {
      persistTasks.delete(taskPromise);
    });
  }

  function prunePcmBuffer(now = Date.now()) {
    const cutoff = now - loudCaptureBufferMs;
    while (pcmBuffer.length > 0 && pcmBuffer[0].timestamp < cutoff) {
      pcmBuffer.shift();
    }
  }

  function finalizeLoudEvent(event, endTimestamp) {
    const eventEndTimestamp = Number.isFinite(endTimestamp)
      ? endTimestamp
      : Date.now();
    const eventPayload = {
      eventId: event.eventId,
      highVolumeAt: new Date(event.triggeredAt).toISOString(),
      thresholdDb: event.thresholdDb,
      segmentStartAt: new Date(event.segmentStartAt).toISOString(),
      segmentEndAt: new Date(eventEndTimestamp).toISOString(),
      peakDb: event.peakDb,
      triggeredAt: new Date(event.triggeredAt).toISOString(),
      unit: "dBFS",
    };
    const recordingFile = `${event.eventId}.wav`;
    const logFile = `${event.eventId}.json`;
    eventPayload.recordingFile = recordingFile;
    eventPayload.logFile = logFile;

    const pcmData = event.chunks.length
      ? Buffer.concat(event.chunks)
      : Buffer.alloc(0);
    const wavData = createWavBuffer(pcmData, event.sampleRate);

    const task = (async () => {
      await fs.promises.mkdir(loudCaptureRecordingsDir, { recursive: true });
      await fs.promises.mkdir(loudCaptureLogsDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(loudCaptureRecordingsDir, recordingFile),
        wavData,
      );
      await fs.promises.writeFile(
        path.join(loudCaptureLogsDir, logFile),
        `${JSON.stringify(eventPayload, null, 2)}\n`,
        "utf8",
      );
    })();

    task.catch((error) => {
      console.error("Failed to persist loud capture event:", error);
    });
    trackPersistTask(task);
  }

  function handleLoudCapture(sample, timestamp) {
    if (!loudCaptureEnabled) {
      return;
    }

    const pcmChunk = Buffer.isBuffer(sample.pcm) ? Buffer.from(sample.pcm) : null;

    prunePcmBuffer(timestamp);

    if (pcmChunk) {
      pcmBuffer.push({
        pcm: pcmChunk,
        timestamp,
      });
    }

    if (!activeLoudEvent && sample.db >= loudThresholdDb) {
      const eventId = formatEventId(Date.now());
      const preRollChunks = pcmBuffer
        .filter(
          (chunk) =>
            chunk.timestamp >= timestamp - loudCaptureBufferMs &&
            chunk.timestamp < timestamp,
        )
        .map((chunk) => chunk.pcm);

      activeLoudEvent = {
        chunks: [...preRollChunks],
        eventId,
        lastAboveThresholdAt: timestamp,
        peakDb: sample.db,
        sampleRate:
          Number.isFinite(sample.sampleRate) && sample.sampleRate > 0
            ? Math.round(sample.sampleRate)
            : DEFAULT_LOUD_CAPTURE_SAMPLE_RATE,
        segmentStartAt:
          preRollChunks.length > 0
            ? Math.max(0, timestamp - loudCaptureBufferMs)
            : timestamp,
        thresholdDb: loudThresholdDb,
        triggeredAt: timestamp,
      };
    }

    if (!activeLoudEvent) {
      return;
    }

    if (pcmChunk) {
      activeLoudEvent.chunks.push(pcmChunk);
    }

    if (sample.db >= loudThresholdDb) {
      activeLoudEvent.lastAboveThresholdAt = timestamp;
      activeLoudEvent.peakDb = Math.max(activeLoudEvent.peakDb, sample.db);
      return;
    }

    if (
      timestamp - activeLoudEvent.lastAboveThresholdAt >=
      loudCaptureBufferMs
    ) {
      const completedEvent = activeLoudEvent;
      activeLoudEvent = null;
      finalizeLoudEvent(completedEvent, timestamp);
    }
  }

  function json(response, statusCode, payload) {
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
  }

  function sanitizeRecordingFileName(name) {
    if (typeof name !== "string") {
      return null;
    }

    const baseName = path.basename(name);
    if (baseName !== name) {
      return null;
    }

    if (!/^[A-Za-z0-9._-]+\.wav$/.test(baseName)) {
      return null;
    }

    return baseName;
  }

  function createCaptureItem(logPayload) {
    const recordingFile = sanitizeRecordingFileName(logPayload.recordingFile);
    if (!recordingFile) {
      return null;
    }

    const highVolumeAt = logPayload.highVolumeAt || logPayload.triggeredAt;
    const highVolumeTimestamp = Date.parse(highVolumeAt);

    if (!Number.isFinite(highVolumeTimestamp)) {
      return null;
    }

    const segmentStartTimestamp = Date.parse(logPayload.segmentStartAt);
    const segmentEndTimestamp = Date.parse(logPayload.segmentEndAt);
    const durationSeconds =
      Number.isFinite(segmentStartTimestamp) && Number.isFinite(segmentEndTimestamp)
        ? Math.max(0, (segmentEndTimestamp - segmentStartTimestamp) / 1000)
        : null;

    return {
      audioUrl: `/api/captures/recordings/${encodeURIComponent(recordingFile)}`,
      durationSeconds,
      eventId: logPayload.eventId || path.parse(logPayload.logFile || recordingFile).name,
      highVolumeAt: new Date(highVolumeTimestamp).toISOString(),
      highVolumeTimestamp,
      peakDb: Number(logPayload.peakDb),
      recordingFile,
      thresholdDb: Number(logPayload.thresholdDb),
      unit: logPayload.unit || "dBFS",
    };
  }

  async function readCaptureLogs() {
    try {
      const entries = await fs.promises.readdir(loudCaptureLogsDir, {
        withFileTypes: true,
      });

      const jsonEntries = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .sort((a, b) => b.name.localeCompare(a.name));

      const items = [];
      for (const entry of jsonEntries) {
        const absolutePath = path.join(loudCaptureLogsDir, entry.name);
        const raw = await fs.promises.readFile(absolutePath, "utf8");
        const parsed = JSON.parse(raw);
        parsed.logFile = parsed.logFile || entry.name;
        const item = createCaptureItem(parsed);
        if (item) {
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async function sendRecordingFile(response, fileName) {
    const safeFileName = sanitizeRecordingFileName(fileName);
    if (!safeFileName) {
      json(response, 400, {
        ok: false,
        error: "Invalid recording file name.",
      });
      return;
    }

    const absoluteFile = path.resolve(loudCaptureRecordingsDir, safeFileName);
    if (!absoluteFile.startsWith(loudCaptureRecordingsDir)) {
      json(response, 403, {
        ok: false,
        error: "Forbidden.",
      });
      return;
    }

    try {
      const content = await fs.promises.readFile(absoluteFile);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "audio/wav",
      });
      response.end(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        json(response, 404, {
          ok: false,
          error: "Recording not found.",
        });
        return;
      }

      json(response, 500, {
        ok: false,
        error: "Failed to read recording file.",
      });
    }
  }

  async function sendLatestCapture(response) {
    const logs = await readCaptureLogs();
    const latest = logs[0] || null;

    json(response, 200, {
      latest,
      ok: true,
      unit: "dBFS",
    });
  }

  async function sendCaptureHeatmap(response, thresholdDb) {
    const logs = await readCaptureLogs();
    const daysMap = new Map();
    let maxCount = 0;

    for (const item of logs) {
      if (!Number.isFinite(item.peakDb) || item.peakDb <= thresholdDb) {
        continue;
      }

      const eventDate = new Date(item.highVolumeTimestamp);
      const dayKey = `${eventDate.getFullYear()}-${padInt(eventDate.getMonth() + 1, 2)}-${padInt(eventDate.getDate(), 2)}`;
      const hour = eventDate.getHours();

      let row = daysMap.get(dayKey);
      if (!row) {
        row = {
          date: dayKey,
          hours: Array.from({ length: HEATMAP_HOUR_COUNT }, () => 0),
          total: 0,
        };
        daysMap.set(dayKey, row);
      }

      row.hours[hour] += 1;
      row.total += 1;
      maxCount = Math.max(maxCount, row.hours[hour]);
    }

    const days = [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    json(response, 200, {
      generatedAt: new Date().toISOString(),
      maxCount,
      ok: true,
      thresholdDb,
      unit: "dBFS",
      days,
    });
  }

  function pruneStatsReadings(now = Date.now()) {
    const cutoff = now - statsWindowMs;

    while (statsReadings.length > 0 && statsReadings[0].timestamp < cutoff) {
      statsReadings.shift();
    }
  }

  function pruneTimelineReadings(now = Date.now()) {
    const cutoff = now - timelineWindowMs;

    while (
      timelineReadings.length > 0 &&
      timelineReadings[0].timestamp < cutoff
    ) {
      timelineReadings.shift();
    }
  }

  function getStats(now = Date.now()) {
    pruneStatsReadings(now);

    if (statsReadings.length === 0) {
      return {
        windowSeconds: Math.round(statsWindowMs / 1000),
        readingCount: 0,
        maxDb: null,
        avgDb: null,
        lastDb: null,
        updatedAt: new Date(now).toISOString(),
      };
    }

    let sum = 0;
    let maxDb = Number.NEGATIVE_INFINITY;

    for (const reading of statsReadings) {
      sum += reading.db;
      maxDb = Math.max(maxDb, reading.db);
    }

    return {
      windowSeconds: Math.round(statsWindowMs / 1000),
      readingCount: statsReadings.length,
      maxDb,
      avgDb: sum / statsReadings.length,
      lastDb: statsReadings[statsReadings.length - 1].db,
      updatedAt: new Date(now).toISOString(),
    };
  }

  function addReading(db, now = Date.now()) {
    const reading = { db, timestamp: now };
    statsReadings.push(reading);
    timelineReadings.push(reading);
    pruneStatsReadings(now);
    pruneTimelineReadings(now);
    return getStats(now);
  }

  function getTimeline(now = Date.now()) {
    pruneTimelineReadings(now);
    return timelineReadings.map((reading) => ({
      db: reading.db,
      timestamp: reading.timestamp,
    }));
  }

  function getBroadcastPayload() {
    return {
      type: "stats",
      unit: "dBFS",
      ...getStats(),
    };
  }

  function getLiveStatusPayload() {
    return {
      loudCapture: getLoudCapturePayload(),
      stats: getStats(),
      status: captureStatus,
      timelineWindowSeconds: Math.round(timelineWindowMs / 1000),
      unit: "dBFS",
    };
  }

  function getLoudCapturePayload() {
    return {
      bufferSeconds: Math.round(loudCaptureBufferMs / 1000),
      enabled: loudCaptureEnabled,
      logsDir: loudCaptureLogsDir,
      recordingsDir: loudCaptureRecordingsDir,
      thresholdDb: loudThresholdDb,
    };
  }

  function setCaptureStatus(status) {
    captureStatus = {
      deviceName: status.deviceName ?? null,
      message: status.message ?? "",
      state: status.state,
      updatedAt: new Date().toISOString(),
    };
  }

  function writeSseEvent(response, eventName, payload) {
    response.write(`event: ${eventName}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function broadcastSse(eventName, payload) {
    for (const response of [...sseClients]) {
      if (response.destroyed || response.writableEnded) {
        sseClients.delete(response);
        continue;
      }

      writeSseEvent(response, eventName, payload);
    }
  }

  function broadcastStats() {
    if (tcpClients.size === 0) {
      return;
    }

    const payload = `${JSON.stringify(getBroadcastPayload())}\n`;

    for (const client of [...tcpClients]) {
      if (client.destroyed || !client.writable) {
        tcpClients.delete(client);
        continue;
      }

      client.write(payload, (error) => {
        if (error) {
          tcpClients.delete(client);
          client.destroy();
        }
      });
    }
  }

  function broadcastCaptureStatus() {
    broadcastSse("status", getLiveStatusPayload());
  }

  function handleCaptureStatus(status) {
    setCaptureStatus(status);
    broadcastCaptureStatus();
  }

  function handleCaptureSample(sample) {
    const timestamp = sample.timestamp ?? Date.now();
    handleLoudCapture(sample, timestamp);
    const stats = addReading(sample.db, timestamp);
    const payload = {
      loudCapture: getLoudCapturePayload(),
      sample: {
        db: sample.db,
        timestamp,
      },
      stats,
      status: captureStatus,
      timelineWindowSeconds: Math.round(timelineWindowMs / 1000),
      unit: "dBFS",
    };

    broadcastSse("sample", payload);
    broadcastStats();
  }

  function parseJsonBody(request) {
    return new Promise((resolve, reject) => {
      let raw = "";

      request.on("data", (chunk) => {
        raw += chunk;

        if (raw.length > 1_000_000) {
          reject(new Error("Request body too large"));
          request.destroy();
        }
      });

      request.on("end", () => {
        if (!raw.trim()) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error("Invalid JSON body"));
        }
      });

      request.on("error", reject);
    });
  }

  async function handleApi(request, response) {
    const requestUrl = new URL(request.url || "/", `http://${host}`);
    const { pathname } = requestUrl;

    if (request.method === "GET" && pathname === "/api/stats") {
      json(response, 200, {
        loudCapture: getLoudCapturePayload(),
        ok: true,
        stats: getStats(),
        status: captureStatus,
        unit: "dBFS",
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/live") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write(": connected\n\n");

      sseClients.add(response);

      writeSseEvent(response, "status", getLiveStatusPayload());
      writeSseEvent(response, "snapshot", {
        loudCapture: getLoudCapturePayload(),
        stats: getStats(),
        status: captureStatus,
        timeline: getTimeline(),
        timelineWindowSeconds: Math.round(timelineWindowMs / 1000),
        unit: "dBFS",
      });

      request.on("close", () => {
        sseClients.delete(response);
      });

      return;
    }

    if (request.method === "POST" && pathname === "/api/readings") {
      try {
        await parseJsonBody(request);
      } catch {}

      json(response, 410, {
        ok: false,
        error: "Browser uploads are disabled; backend capture is the only live source.",
      });

      return;
    }

    if (request.method === "GET" && pathname === "/api/captures/latest") {
      await sendLatestCapture(response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/captures/heatmap") {
      const thresholdDb = Number.parseFloat(
        requestUrl.searchParams.get("threshold") || `${DEFAULT_LOUD_THRESHOLD_DB}`,
      );
      await sendCaptureHeatmap(
        response,
        Number.isFinite(thresholdDb) ? thresholdDb : DEFAULT_LOUD_THRESHOLD_DB,
      );
      return;
    }

    if (
      request.method === "GET" &&
      pathname.startsWith("/api/captures/recordings/")
    ) {
      const fileName = decodeURIComponent(
        pathname.slice("/api/captures/recordings/".length),
      );
      await sendRecordingFile(response, fileName);
      return;
    }

    json(response, 404, {
      ok: false,
      error: "API route not found.",
    });
  }

  function serveStatic(request, response) {
    const requestUrl = new URL(request.url || "/", `http://${host}`);
    const pathname =
      requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = path.resolve(publicDir, `.${pathname}`);

    if (!filePath.startsWith(publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500);
        response.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      });
      response.end(content);
    });
  }

  function listen(server, port) {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  async function start() {
    if (httpServer || tcpServer) {
      return getPorts();
    }

    httpServer = http.createServer(async (request, response) => {
      if ((request.url || "").startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }

      serveStatic(request, response);
    });

    tcpServer = net.createServer((socket) => {
      tcpClients.add(socket);
      socket.setEncoding("utf8");

      socket.write(
        `${JSON.stringify({
          type: "hello",
          unit: "dBFS",
          message: "Mic dB Record TCP stream",
        })}\n`,
      );
      socket.write(`${JSON.stringify(getBroadcastPayload())}\n`);

      socket.on("close", () => {
        tcpClients.delete(socket);
      });

      socket.on("error", () => {
        tcpClients.delete(socket);
      });
    });

    try {
      await listen(httpServer, requestedHttpPort);
      await listen(tcpServer, requestedTcpPort);
    } catch (error) {
      await stop();
      throw error;
    }

    setCaptureStatus({
      state: "starting",
      message: "Initializing capture source.",
    });

    try {
      captureSource = sampleSourceFactory({
        onSample: handleCaptureSample,
        onStatus: handleCaptureStatus,
      });
      await captureSource?.start?.();
    } catch (error) {
      handleCaptureStatus({
        state: "error",
        message: error.message,
      });
    }

    broadcastTimer = setInterval(broadcastStats, broadcastIntervalMs);
    broadcastTimer.unref?.();
    sseHeartbeatTimer = setInterval(() => {
      for (const response of [...sseClients]) {
        if (response.destroyed || response.writableEnded) {
          sseClients.delete(response);
          continue;
        }

        response.write(": keepalive\n\n");
      }
    }, DEFAULT_SSE_HEARTBEAT_MS);
    sseHeartbeatTimer.unref?.();

    return getPorts();
  }

  async function stop() {
    if (broadcastTimer) {
      clearInterval(broadcastTimer);
      broadcastTimer = undefined;
    }

    if (sseHeartbeatTimer) {
      clearInterval(sseHeartbeatTimer);
      sseHeartbeatTimer = undefined;
    }

    if (captureSource?.stop) {
      await captureSource.stop();
      captureSource = undefined;
    }

    if (activeLoudEvent) {
      const completedEvent = activeLoudEvent;
      activeLoudEvent = null;
      finalizeLoudEvent(completedEvent, Date.now());
    }

    if (persistTasks.size > 0) {
      await Promise.allSettled([...persistTasks]);
    }

    for (const client of tcpClients) {
      client.destroy();
    }
    tcpClients.clear();

    for (const response of sseClients) {
      response.end();
    }
    sseClients.clear();

    const closeServer = (server) =>
      new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }

        server.close(() => resolve());
      });

    const currentHttpServer = httpServer;
    const currentTcpServer = tcpServer;

    httpServer = undefined;
    tcpServer = undefined;

    await Promise.all([
      closeServer(currentHttpServer),
      closeServer(currentTcpServer),
    ]);
  }

  function getPorts() {
    return {
      host,
      httpPort: httpServer?.address()?.port ?? requestedHttpPort,
      tcpPort: tcpServer?.address()?.port ?? requestedTcpPort,
    };
  }

  return {
    addReading,
    getPorts,
    getStats,
    getTimeline,
    start,
    stop,
  };
}

module.exports = {
  createDbMonitorApp,
};
