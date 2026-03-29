const assert = require("node:assert/strict");

const { __private } = require("../src/mic-source");

function testWindowsPrefersWasapiOverMMe() {
  const device = __private.resolveDefaultInputDevice({
    devices: [
      {
        id: 1,
        maxInputChannels: 2,
        name: "��˷����� (Realtek(R) Audio)",
      },
      {
        id: 31,
        maxInputChannels: 2,
        name: "麦克风阵列 (Realtek(R) Audio)",
      },
      {
        id: 69,
        maxInputChannels: 2,
        name: "麦克风阵列 (Realtek HD Audio Mic Array input)",
      },
    ],
    hostApis: {
      defaultHostAPI: 0,
      HostAPIs: [
        { id: 0, name: "MME", defaultInput: 1 },
        { id: 1, name: "Windows WASAPI", defaultInput: 31 },
        { id: 2, name: "Windows WDM-KS", defaultInput: 69 },
      ],
    },
    platform: "win32",
  });

  assert.equal(device.id, 31);
  assert.equal(device.name, "麦克风阵列 (Realtek(R) Audio)");
}

function testNonWindowsUsesDefaultHostApi() {
  const device = __private.resolveDefaultInputDevice({
    devices: [
      {
        id: 4,
        maxInputChannels: 1,
        name: "Built-in Input",
      },
      {
        id: 8,
        maxInputChannels: 1,
        name: "USB Mic",
      },
    ],
    hostApis: {
      defaultHostAPI: 0,
      HostAPIs: [{ id: 0, name: "Core Audio", defaultInput: 4 }],
    },
    platform: "darwin",
  });

  assert.equal(device.id, 4);
}

function testFallbackUsesFirstInputDevice() {
  const device = __private.resolveDefaultInputDevice({
    devices: [
      {
        id: 12,
        maxInputChannels: 0,
        name: "Output Only",
      },
      {
        id: 15,
        maxInputChannels: 1,
        name: "Fallback Mic",
      },
    ],
    hostApis: {
      defaultHostAPI: 0,
      HostAPIs: [{ id: 0, name: "MME", defaultInput: 999 }],
    },
    platform: "win32",
  });

  assert.equal(device.id, 15);
}

testWindowsPrefersWasapiOverMMe();
testNonWindowsUsesDefaultHostApi();
testFallbackUsesFirstInputDevice();

console.log("Mic source tests passed.");
