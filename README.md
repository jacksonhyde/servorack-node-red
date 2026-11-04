# ServoRack Node-RED server

## Fresh installation

From this repository, run:

```sh
docker compose up -d --build
```

Open the servo dashboard at **http://localhost:1880/dashboard/servos**.
From another computer, replace `localhost` with this server's LAN IP address.
The Node-RED flow editor is at http://localhost:1880.

The image includes `flows.json`, containing the dashboard, MIDI routing,
WebSocket connection manager and test controls. On first startup it copies this
flow into the persistent `/data` volume and configures the named `servorack`
context store. No firmware repository or manual flow import is required.
Enter the rack IP under **Rack address**, connect, select a MIDI device and
explicitly arm the desired servos. No rack address, learned mappings or
credentials are included in the initial flow.

## USB MIDI on Linux

To expose hardware and virtual MIDI inputs through ALSA, run instead:

```sh
docker compose -f docker-compose.yaml -f docker-compose.midi.yaml up -d --build
```

This requires `/dev/snd/seq` on the host. If needed, set `MIDI_AUDIO_GID` to
its group ID (`stat -c %g /dev/snd/seq`) in a local `.env` file.
The default Compose configuration can open the dashboard without MIDI hardware.

The custom image includes node-red-contrib-midi 1.1.2, FlowFuse Dashboard 1.34.1,
and the ServoRack MIDI and connection nodes. MIDI device discovery and switching
are handled by the backend; closing the browser does not stop heartbeats.

## Native macOS development (Ableton / CoreMIDI)

Docker Desktop's Linux VM has no ALSA/sound subsystem at all, so the
Dockerized Node-RED can never see any MIDI device on macOS, hardware or
virtual (including Ableton's IAC Driver or virtual ports) — even when Ableton
runs on the same Mac. To develop against real MIDI input locally, run
Node-RED natively instead, so `node-midi` links against CoreMIDI:

```sh
cd mac-dev
npm install
# If npm reports install scripts pending review (midi, core-js):
npm install-scripts approve midi core-js
npm install
npm start
```

This builds the `midi` native addon against CoreMIDI, bootstraps a local
`mac-dev/data` user directory with the same dashboard flow and `servorack`
context store as the Docker image, and starts Node-RED at
**http://localhost:1880/dashboard/servos**. Route Ableton's MIDI track output
to a virtual port (enable the IAC Driver in Audio MIDI Setup, or let Ableton
expose its own virtual port) and select it from the dashboard's MIDI input
list. Requires Xcode Command Line Tools (`xcode-select --install`).

This uses the same `bootstrap.cjs` and `flows.json` as the Docker image, so
edits to those files apply to both. It can't run at the same time as the
Docker stack (both bind port 1880); stop one before starting the other. If
you also need MQTT locally, run `docker compose up -d mosquitto` separately
and point Node-RED at `mqtt://localhost:1883`.

## Persistence and updates

Flows, device selections and mappings live in the `node-red-data` volume.
Rebuilding the image or recreating the container preserves them. Do not use
`docker compose down -v` unless you intend to delete those settings.
Calibration and travel limits are stored separately on each ESP32.

Startup **never overwrites an existing flow file**, even an empty one. On an
existing installation without the dashboard, import this repository's
`flows.json` using the editor's **Import** menu and deploy. Import only once;
existing installations with the ServoRack worksheet should update its existing
nodes rather than create duplicate control flows.

The tracked `flows.json` is the distributable default. To save future worksheet
changes, export the complete ServoRack worksheet including its dashboard
configuration nodes, remove machine-specific addresses, and update this file.
Do not commit `flows_cred.json`, `/data`, local context or credentials.

Run bootstrap regression tests with `node --test tests/bootstrap.test.cjs`.

## Optional MQTT availability

Mosquitto runs alongside Node-RED. Within Compose its address is
`mqtt://mosquitto:1883`. Anonymous MQTT is intended for trusted LAN testing.
By default its published port binds to loopback. To let an ESP32 reach it, set
`MQTT_BIND_ADDRESS` to this computer's LAN IP in `.env` and recreate Mosquitto:

```sh
docker compose up -d mosquitto
```

Configure the ESP32's optional MQTT broker URI to that LAN IP. MQTT reports
availability; servo control uses WebSockets. Broker data is persisted separately
in `mosquitto-data`.

## Rack WebSocket connection

The `servorack-connection` custom node connects from this backend to
`ws://<rack-ip>/servorack/control`; the rack IP is displayed on its LCD.
New installations include the worksheet automatically; existing installations can
import this repository's `flows.json`. Open the MIDI Mapping
dashboard, enter the IP in **Rack address**, and click **Connect**. The rack
must run the ESP-hosted WebSocket server firmware.

The latest runtime address is saved in the existing named `servorack` context
store. Send topic `rack-connect` with an address string to select/reconnect,
or topic `rack-disconnect` to stop and remember that preference. A connected
selection reconnects automatically after a backend restart; browser closure
has no effect. Dashboard Connect/Disconnect controls show status and inline
address errors. Disconnect retains the address while stopping automatic retries.
An invalid new address leaves the active connection intact.

Reconnects never arm or replay commands. Disconnects clear pending MIDI,
learning and profile reads; an interrupted profile save requires verification
before arming. Heartbeats continue through the worksheet every 100 ms, and the
ESP retains its independent 500 ms watchdog. Busy racks return HTTP 503 and
are retried with backoff. Existing mappings and servo names remain in place.

Rack settings are keyed by the identity reported in the WebSocket hello rather
than by IP. Each rack has its own MIDI assignments and servo names, retained
when its address changes. This version selects one connected rack at a time.
Switching clears queued work and requires fresh explicit arming.

The first upgrade snapshots the previous single-rack mappings/names and binds
them only to the first identity at the previously saved rack address. Existing
keys remain as backups; subsequent saves and learning use `rackSettings` in the
named `servorack` context store. Other rack identities start with empty mappings.
Interrupted profile saves block only their owning rack until its profile is
read, and that block survives a backend restart. ESP32 calibration stays on the
individual rack and is never copied on connection.
