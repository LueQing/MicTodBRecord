const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_BROADCAST_INTERVAL_MS = 1000;

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
  const publicDir = path.resolve(
    options.publicDir || path.join(__dirname, "..", "public"),
  );

  const readings = [];
  const tcpClients = new Set();

  let httpServer;
  let tcpServer;
  let broadcastTimer;

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

  function getBroadcastPayload() {
    return {
      type: "stats",
      unit: "dBFS",
      ...getStats(),
    };
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
        unit: "dBFS",
        stats: getStats(),
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/readings") {
      try {
        const body = await parseJsonBody(request);
        const db = Number(body.db);

        if (!Number.isFinite(db)) {
          json(response, 400, {
            ok: false,
            error: "Field 'db' must be a finite number.",
          });
          return;
        }

        const stats = addReading(db);

        json(response, 200, {
          ok: true,
          unit: "dBFS",
          stats,
        });

        broadcastStats();
      } catch (error) {
        json(response, 400, {
          ok: false,
          error: error.message,
        });
      }

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

    broadcastTimer = setInterval(broadcastStats, broadcastIntervalMs);
    broadcastTimer.unref?.();

    return getPorts();
  }

  async function stop() {
    if (broadcastTimer) {
      clearInterval(broadcastTimer);
      broadcastTimer = undefined;
    }

    for (const client of tcpClients) {
      client.destroy();
    }
    tcpClients.clear();

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
    start,
    stop,
  };
}

module.exports = {
  createDbMonitorApp,
};
