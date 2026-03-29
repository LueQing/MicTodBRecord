const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("http");
const net = require("net");

const { createDbMonitorApp } = require("../src/app-server");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest({ body, method = "GET", path = "/", port }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        method,
        path,
        port,
      },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            body: raw ? JSON.parse(raw) : null,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.setHeader("Content-Type", "application/json");
      request.write(JSON.stringify(body));
    }

    request.end();
  });
}

function createFakeSampleSourceFactory() {
  const emitter = new EventEmitter();
  let onSample;
  let onStatus;

  return {
    emitSample(db, timestamp = Date.now()) {
      onSample?.({ db, timestamp });
    },
    emitStatus(status) {
      onStatus?.(status);
    },
    factory({ onSample: nextOnSample, onStatus: nextOnStatus }) {
      onSample = nextOnSample;
      onStatus = nextOnStatus;

      return {
        async start() {
          emitter.emit("started");
          onStatus?.({
            deviceName: "Fake Mic",
            message: "Sampling deterministic test data.",
            state: "live",
          });
        },
        async stop() {
          emitter.emit("stopped");
        },
      };
    },
  };
}

function openEventStream({ path = "/api/live", port }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers: {
          Accept: "text/event-stream",
        },
        host: "127.0.0.1",
        method: "GET",
        path,
        port,
      },
      (response) => {
        let buffer = "";
        const seen = [];
        const waiters = [];

        function flushWaiters() {
          for (const waiter of [...waiters]) {
            const match = seen.find(
              (event) =>
                event.event === waiter.event &&
                (waiter.predicate ? waiter.predicate(event) : true),
            );

            if (match) {
              waiters.splice(waiters.indexOf(waiter), 1);
              waiter.resolve(match);
            }
          }
        }

        function parseBlock(block) {
          const lines = block
            .split(/\r?\n/)
            .filter((line) => line && !line.startsWith(":"));

          if (lines.length === 0) {
            return;
          }

          let eventName = "message";
          const dataLines = [];

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice("event:".length).trim();
              continue;
            }

            if (line.startsWith("data:")) {
              dataLines.push(line.slice("data:".length).trim());
            }
          }

          if (dataLines.length === 0) {
            return;
          }

          seen.push({
            data: JSON.parse(dataLines.join("\n")),
            event: eventName,
          });
          flushWaiters();
        }

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          buffer += chunk;

          let separatorIndex = buffer.indexOf("\n\n");
          while (separatorIndex !== -1) {
            parseBlock(buffer.slice(0, separatorIndex));
            buffer = buffer.slice(separatorIndex + 2);
            separatorIndex = buffer.indexOf("\n\n");
          }
        });

        resolve({
          close() {
            request.destroy();
            response.destroy();
          },
          waitForEvent(event, predicate, timeoutMs = 1000) {
            const existing = seen.find(
              (seenEvent) =>
                seenEvent.event === event &&
                (predicate ? predicate(seenEvent) : true),
            );

            if (existing) {
              return Promise.resolve(existing);
            }

            return new Promise((waitResolve, waitReject) => {
              const timeout = setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) {
                  waiters.splice(index, 1);
                }
                waitReject(new Error(`Timed out waiting for SSE event '${event}'`));
              }, timeoutMs);

              const waiter = {
                event,
                predicate,
                resolve(match) {
                  clearTimeout(timeout);
                  waitResolve(match);
                },
              };

              waiters.push(waiter);
            });
          },
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

async function main() {
  const fakeSampleSource = createFakeSampleSourceFactory();
  const app = createDbMonitorApp({
    broadcastIntervalMs: 40,
    httpPort: 0,
    sampleSourceFactory: fakeSampleSource.factory,
    tcpPort: 0,
    timelineWindowMs: 1000,
    windowMs: 200,
  });

  const ports = await app.start();
  const receivedMessages = [];
  let tcpBuffer = "";

  const client = net.createConnection({
    host: ports.host,
    port: ports.tcpPort,
  });

  client.setEncoding("utf8");
  client.on("data", (chunk) => {
    tcpBuffer += chunk;
    const lines = tcpBuffer.split("\n");
    tcpBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        receivedMessages.push(JSON.parse(line));
      }
    }
  });

  await wait(60);
  const stream = await openEventStream({
    port: ports.httpPort,
  });

  const initialStats = await httpRequest({
    path: "/api/stats",
    port: ports.httpPort,
  });

  assert.equal(initialStats.statusCode, 200);
  assert.equal(initialStats.body.stats.readingCount, 0);
  assert.equal(initialStats.body.status.state, "live");

  const rootPage = await new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${ports.httpPort}/`, (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            body: raw,
            statusCode: response.statusCode,
          });
        });
      })
      .on("error", reject);
  });

  assert.equal(rootPage.statusCode, 200);
  assert.match(rootPage.body, /浏览器只负责展示/);

  const postDisabled = await httpRequest({
    body: { db: -30 },
    method: "POST",
    path: "/api/readings",
    port: ports.httpPort,
  });

  assert.equal(postDisabled.statusCode, 410);
  assert.match(postDisabled.body.error, /Browser uploads are disabled/);

  const snapshot = await stream.waitForEvent("snapshot");

  assert.equal(snapshot.data.stats.readingCount, 0);
  assert.equal(snapshot.data.status.state, "live");
  assert.equal(Array.isArray(snapshot.data.timeline), true);
  assert.equal(snapshot.data.timelineWindowSeconds, 1);

  fakeSampleSource.emitSample(-30);
  fakeSampleSource.emitSample(-10);

  const sampleEvent = await stream.waitForEvent(
    "sample",
    (event) => event.data.sample?.db === -10,
  );

  assert.equal(sampleEvent.data.stats.maxDb, -10);
  assert.equal(sampleEvent.data.stats.avgDb, -20);
  assert.equal(sampleEvent.data.timelineWindowSeconds, 1);

  const activeStats = await httpRequest({
    path: "/api/stats",
    port: ports.httpPort,
  });

  assert.equal(activeStats.statusCode, 200);
  assert.equal(activeStats.body.stats.readingCount, 2);
  assert.equal(activeStats.body.stats.maxDb, -10);
  assert.equal(activeStats.body.stats.avgDb, -20);
  assert.equal(activeStats.body.unit, "dBFS");

  assert.ok(
    receivedMessages.some(
      (message) =>
        message.type === "stats" &&
        message.maxDb === -10 &&
        message.avgDb === -20 &&
        message.unit === "dBFS",
    ),
  );

  await wait(240);

  const expiredStats = await httpRequest({
    path: "/api/stats",
    port: ports.httpPort,
  });

  assert.equal(expiredStats.body.stats.readingCount, 0);
  assert.equal(expiredStats.body.stats.maxDb, null);
  assert.equal(expiredStats.body.stats.avgDb, null);
  assert.equal(app.getTimeline().length, 2);

  await wait(820);
  assert.equal(app.getTimeline().length, 0);

  stream.close();
  client.destroy();
  await app.stop();

  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
