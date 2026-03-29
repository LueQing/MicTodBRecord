const portAudio = require("naudiodon");

function resolveDefaultInputDevice() {
  const devices = portAudio
    .getDevices()
    .filter((device) => Number(device.maxInputChannels) > 0);

  if (devices.length === 0) {
    return null;
  }

  const hostApis = portAudio.getHostAPIs();
  const defaultHostIndex = Number(hostApis.defaultHostAPI);
  const defaultHost = hostApis.HostAPIs?.[defaultHostIndex];
  const defaultInputId = Number(defaultHost?.defaultInput);

  return (
    devices.find((device) => device.id === defaultInputId) ||
    devices.find((device) => device.id === -1) ||
    devices[0]
  );
}

function toTimestampMs(buffer) {
  if (typeof buffer.timestamp === "number" && Number.isFinite(buffer.timestamp)) {
    return Math.round(buffer.timestamp * 1000);
  }

  return Date.now();
}

function computeDbfsFrom16Bit(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    return -90;
  }

  let sum = 0;
  let sampleCount = 0;

  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset) / 32768;
    sum += sample * sample;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return -90;
  }

  const rms = Math.sqrt(sum / sampleCount);
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.max(-90, Math.min(0, db));
}

function createMicSource({ onSample, onStatus }) {
  let audioInput;
  let stopped = false;

  function emitStatus(status) {
    onStatus?.({
      deviceName: status.deviceName ?? null,
      message: status.message ?? "",
      state: status.state,
    });
  }

  async function start() {
    const inputDevice = resolveDefaultInputDevice();

    if (!inputDevice) {
      emitStatus({
        state: "unavailable",
        message: "No input device found.",
      });
      return;
    }

    emitStatus({
      state: "starting",
      deviceName: inputDevice.name,
      message: "Opening default input device.",
    });

    audioInput = new portAudio.AudioIO({
      inOptions: {
        channelCount: 1,
        closeOnError: true,
        deviceId: inputDevice.id,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate: Number(inputDevice.defaultSampleRate) || 44100,
      },
    });

    audioInput.on("data", (buffer) => {
      if (stopped) {
        return;
      }

      const timestamp = toTimestampMs(buffer);
      const db = computeDbfsFrom16Bit(buffer);

      onSample?.({ db, timestamp });
    });

    audioInput.on("error", (error) => {
      emitStatus({
        state: "error",
        deviceName: inputDevice.name,
        message: error.message,
      });
    });

    audioInput.on("close", () => {
      if (!stopped) {
        emitStatus({
          state: "unavailable",
          deviceName: inputDevice.name,
          message: "Input stream closed.",
        });
      }
    });

    audioInput.start();

    emitStatus({
      state: "live",
      deviceName: inputDevice.name,
      message: "Sampling default input device.",
    });
  }

  async function stop() {
    stopped = true;

    if (audioInput) {
      try {
        await audioInput.quit();
      } finally {
        audioInput = undefined;
      }
    }
  }

  return {
    start,
    stop,
  };
}

module.exports = {
  createMicSource,
};
