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
