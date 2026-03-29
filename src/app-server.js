const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const { createMicSource } = require("./mic-source");

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_BROADCAST_INTERVAL_MS = 1000;
const DEFAULT_SSE_HEARTBEAT_MS = 15000;

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
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const broadcastIntervalMs =
    options.broadcastIntervalMs ?? DEFAULT_BROADCAST_INTERVAL_MS;
  const sampleSourceFactory = options.sampleSourceFactory || createMicSource;
  const publicDir = path.resolve(
    options.publicDir || path.join(__dirname, "..", "public"),
  );

  const readings = [];
  const sseClients = new Set();
  const tcpClients = new Set();

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

  function json(response, statusCode, payload) {
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(payload));
  }

  function pruneReadings(now = Date.now()) {
    const cutoff = now - windowMs;

    while (readings.length > 0 && readings[0].timestamp < cutoff) {
      readings.shift();
    }
  }

  function getStats(now = Date.now()) {
    pruneReadings(now);

    if (readings.length === 0) {
      return {
        windowSeconds: Math.round(windowMs / 1000),
        readingCount: 0,
        maxDb: null,
        avgDb: null,
        lastDb: null,
        updatedAt: new Date(now).toISOString(),
      };
    }

    let sum = 0;
    let maxDb = Number.NEGATIVE_INFINITY;

    for (const reading of readings) {
      sum += reading.db;
      maxDb = Math.max(maxDb, reading.db);
    }

    return {
      windowSeconds: Math.round(windowMs / 1000),
      readingCount: readings.length,
      maxDb,
      avgDb: sum / readings.length,
      lastDb: readings[readings.length - 1].db,
      updatedAt: new Date(now).toISOString(),
    };
  }

  function addReading(db, now = Date.now()) {
    readings.push({ db, timestamp: now });
    return getStats(now);
  }

  function getTimeline(now = Date.now()) {
    pruneReadings(now);
    return readings.map((reading) => ({
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
      stats: getStats(),
      status: captureStatus,
      unit: "dBFS",
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
    const stats = addReading(sample.db, timestamp);
    const payload = {
      sample: {
        db: sample.db,
        timestamp,
      },
      stats,
      status: captureStatus,
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
    if (request.method === "GET" && request.url === "/api/stats") {
      json(response, 200, {
        ok: true,
        stats: getStats(),
        status: captureStatus,
        unit: "dBFS",
      });
      return;
    }

    if (request.method === "GET" && request.url === "/api/live") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write(": connected\n\n");

      sseClients.add(response);

      writeSseEvent(response, "status", getLiveStatusPayload());
      writeSseEvent(response, "snapshot", {
        stats: getStats(),
        status: captureStatus,
        timeline: getTimeline(),
        unit: "dBFS",
      });

      request.on("close", () => {
        sseClients.delete(response);
      });

      return;
    }

    if (request.method === "POST" && request.url === "/api/readings") {
      try {
        await parseJsonBody(request);
      } catch {}

      json(response, 410, {
        ok: false,
        error: "Browser uploads are disabled; backend capture is the only live source.",
      });

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
