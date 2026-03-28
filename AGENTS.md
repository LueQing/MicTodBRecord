# Project Guide

## Project

Mic dB Record is a local-only web tool that listens to the system default microphone,
converts the signal to relative decibels (`dBFS`), draws a 5-minute timeline chart,
and broadcasts the rolling 5-minute max and average over localhost TCP.

## Runtime

- HTTP site: `http://127.0.0.1:3000`
- TCP stream: `127.0.0.1:7070`
- Node: `>=18`
- Start command: `npm start`
- Test command: `npm test`

## Constraints

- Keep the app local-only unless the user explicitly asks for network exposure.
- Treat all measurements as `dBFS` unless a real calibration flow is added.
- Prefer Node built-ins and simple browser APIs over extra dependencies.

## Files

- `server.js`: process entry point
- `src/app-server.js`: HTTP/TCP server and rolling stats
- `public/`: browser UI and microphone capture
- `.planning/`: GSD project artifacts
