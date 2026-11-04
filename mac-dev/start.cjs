#!/usr/bin/env node
// Bootstraps a native macOS Node-RED userDir and launches Node-RED directly on
// the host (not in Docker), so node-midi links against CoreMIDI instead of
// ALSA. This lets Ableton's IAC Driver / virtual MIDI ports show up in the
// ServoRack MIDI input node. Not used in production; see docker-compose.yaml
// for the Linux rack host.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bootstrap = require('../bootstrap.cjs');

const here = __dirname;
const dataDir = path.join(here, 'data');
const defaultsDir = path.resolve(here, '..');
const defaultSettings = path.join(here, 'node_modules', 'node-red', 'settings.js');

bootstrap(dataDir, defaultsDir, defaultSettings, process.env.FLOWS);

const nodeRedBin = path.join(here, 'node_modules', '.bin', 'node-red');
const result = spawnSync(nodeRedBin, ['--userDir', dataDir, ...process.argv.slice(2)], {
    stdio: 'inherit',
});
process.exit(result.status ?? 1);
