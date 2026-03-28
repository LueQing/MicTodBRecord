const assert = require("node:assert/strict");
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

async function main() {
  const app = createDbMonitorApp({
    broadcastIntervalMs: 40,
    httpPort: 0,
    tcpPort: 0,
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

  const initialStats = await httpRequest({
    path: "/api/stats",
    port: ports.httpPort,
  });

  assert.equal(initialStats.statusCode, 200);
  assert.equal(initialStats.body.stats.readingCount, 0);

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
  assert.match(rootPage.body, /默认麦克风 dB 时间曲线/);

  await httpRequest({
    body: { db: -30 },
    method: "POST",
    path: "/api/readings",
    port: ports.httpPort,
  });

  await httpRequest({
    body: { db: -10 },
    method: "POST",
    path: "/api/readings",
    port: ports.httpPort,
  });

  const activeStats = await httpRequest({
    path: "/api/stats",
    port: ports.httpPort,
  });

  assert.equal(activeStats.statusCode, 200);
  assert.equal(activeStats.body.stats.readingCount, 2);
  assert.equal(activeStats.body.stats.maxDb, -10);
  assert.equal(activeStats.body.stats.avgDb, -20);
  assert.equal(activeStats.body.unit, "dBFS");

  await wait(80);

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

  client.destroy();
  await app.stop();

  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
