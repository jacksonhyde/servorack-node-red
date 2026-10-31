# ServoRack Node-RED and MQTT

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
