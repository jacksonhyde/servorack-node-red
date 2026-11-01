# ServoRack Node-RED, MIDI and MQTT

Start the broker alongside the existing Node-RED instance:

```sh
docker compose up -d mosquitto
docker compose logs -f mosquitto
```

Node-RED remains at http://192.168.88.100:1880.
Configure its MQTT connection with server `mosquitto`, port `1883`, without
credentials. Subscribe an **mqtt in** node to `servorack/+/availability` at
QoS 1 and wire it to a **debug** node.

Configure the ESP32 broker URI as `mqtt://192.168.88.100:1883` through
`idf.py menuconfig` > ServoRack MQTT, then rebuild and flash.

Watch availability from the broker container:

```sh
docker compose exec mosquitto mosquitto_sub -t 'servorack/+/availability' -q 1 -v
```

Expect retained `online` after connection and `offline` after the broker detects
power/cable loss. Reconnect to verify recovery. A new subscriber should receive
the latest retained value immediately.

Anonymous plain MQTT is enabled for LAN testing. The published port binds only
to 192.168.88.100; reserve this address in DHCP. Retained state is persisted in
the mosquitto-data volume. Existing Node-RED flows and data are preserved.


## USB MIDI and servo dashboard

The custom Dockerfile adds node-red-contrib-midi 1.1.2 and FlowFuse Dashboard
1.34.1 to the pinned Node-RED base. Compose exposes only the ALSA sequencer and
adds the host audio group (MIDI_AUDIO_GID, default 29). Node-RED stays non-root.

Rebuild and start with:

    docker compose up -d --build node-red

The dashboard is at http://192.168.88.100:1880/dashboard/servos. Import the
companion firmware repository's examples/node-red/websocket-control.json to
install the MIDI routing and dashboard worksheet on a fresh instance.

The worksheet uses the named servorack context store for learned mappings and
servo names. Append persistent-context.js to /data/settings.js, preserving the
existing settings, then restart Node-RED before deploying that worksheet.
This setup has already been applied to the current persistent data volume.
The existing channel 9 / CC22 assignment was migrated before restart.

Profile calibration and angle limits are stored separately on the ESP32. Saving
requires DISARMED state and a matching profile revision; it never moves a servo.
USB reconnection requires restarting Node-RED to reopen the MIDI input, but the
learned mappings survive. Select the source and explicitly Arm after recovery.

## Rack WebSocket connection

The `servorack-connection` custom node connects from this backend to
`ws://<rack-ip>/servorack/control`; the rack IP is displayed on its LCD.
Rebuild the image, then import the firmware repository's updated
`examples/node-red/websocket-control.json` and deploy. Open the MIDI Mapping
dashboard, enter the IP in **Rack address**, and click **Connect**. Deploy this worksheet before flashing the
ESP-hosted WebSocket server firmware; it replaces the old incoming endpoint.

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
