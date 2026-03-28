const { createDbMonitorApp } = require("./src/app-server");

const host = process.env.HOST || "127.0.0.1";
const httpPort = Number(process.env.PORT || 3000);
const tcpPort = Number(process.env.TCP_PORT || 7070);

const app = createDbMonitorApp({ host, httpPort, tcpPort });

async function main() {
  const ports = await app.start();

  console.log(`Mic dB Record running at http://${ports.host}:${ports.httpPort}`);
  console.log(`TCP stats broadcast available at ${ports.host}:${ports.tcpPort}`);
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
