const { createDbMonitorApp } = require("./src/app-server");

function parseNumberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const host = process.env.HOST || "127.0.0.1";
const httpPort = parseNumberEnv(process.env.PORT, 3000);
const tcpPort = parseNumberEnv(process.env.TCP_PORT, 7070);
const loudCaptureEnabled = process.env.LOUD_CAPTURE_ENABLED !== "0";
const loudThresholdDb = parseNumberEnv(process.env.LOUD_THRESHOLD_DB, -20);
const loudCaptureBufferMs = parseNumberEnv(
  process.env.LOUD_CAPTURE_BUFFER_MS,
  5000,
);
const loudCaptureDir = process.env.LOUD_CAPTURE_DIR;

const app = createDbMonitorApp({
  host,
  httpPort,
  loudCaptureBufferMs,
  loudCaptureDir,
  loudCaptureEnabled,
  loudThresholdDb,
  tcpPort,
});

async function main() {
  const ports = await app.start();

  console.log(`Mic dB Record running at http://${ports.host}:${ports.httpPort}`);
  console.log(`TCP stats broadcast available at ${ports.host}:${ports.tcpPort}`);
  console.log(
    `Loud capture: ${loudCaptureEnabled ? "enabled" : "disabled"} | threshold ${loudThresholdDb} dBFS | buffer ${Math.round(loudCaptureBufferMs / 1000)}s`,
  );
  console.log("Measurement unit: dBFS (uncalibrated relative decibels)");
}

async function shutdown(signal) {
  try {
    await app.stop();
  } finally {
    if (signal) {
      process.exit(0);
    }
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

main().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exit(1);
});
