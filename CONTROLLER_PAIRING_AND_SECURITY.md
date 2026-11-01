# ServoRack controller pairing and security architecture

## Status and scope

This document describes a proposed design. USB pairing, TLS credentials, access roles, and the setup interface are not implemented yet. Existing session tokens, heartbeat checks, and arm masks provide control-state safeguards; they do not currently authenticate an owner or encrypt the network connection.

The initial product has one customer managing their own users. It does not require cloud accounts or a central user directory. The controller trusts specific ServoRack installations, and one installation controls it at a time.

Downloading the application is separate from obtaining permission to control a particular ESP32. The Render download-site password grants access to software downloads only.

## User experience

### First launch with an unowned controller

1. The user downloads and installs ServoRack from the protected download page.
2. A fresh installation opens first-time setup instead of the MIDI Mapping dashboard.
3. The user connects the ESP32 to their computer over USB.
4. The user performs a physical action on the ESP32, such as holding a designated button, to open a short pairing window. The LCD indicates that pairing is available.
5. The user chooses **Pair controller**. In a browser, the browser presents its serial-device permission picker; the desktop app can present its own device picker.
6. The application and controller create their own identities and exchange public certificates and trust information over USB. Neither private key is transferred.
7. The controller registers this installation as its owner. The application records the paired controller's identity.
8. Setup configures the control server's LAN address or stable hostname and validates the Ethernet connection.
9. The controller connects to the application over authenticated WSS. Successful authentication leaves every servo disarmed.
10. Setup opens MIDI Mapping. The user selects a MIDI device and explicitly arms the required servos.

Ownership is established only after a complete provisioning transaction. Interrupted setup must leave the controller either unowned and unable to accept network control, or consistently paired. It must not create a partially trusted network session.

### Subsequent launches

- Load installation credentials and paired-controller settings from persistent storage.
- Locate the controller or offer a manually entered address when discovery fails.
- Establish the authenticated Ethernet connection automatically.
- Open MIDI Mapping with every servo disarmed following a new control session.
- Require explicit per-servo arming before admitting movement commands.

USB is not required for everyday operation. Normal operation works without internet access.

### Controller settings

The proposed **Controller settings** dialog provides:

- Pair controller / first-time setup.
- Add this computer to an already-owned controller.
- Controller identity and connection configuration.
- An owner-only list of authorised installations, with names and permissions.
- Owner-only grant, revoke, and transfer-control actions.
- A clearly separate physical ownership-reset procedure.

These controls belong in a setup/settings area, rather than adding explanatory text or extra controls to each servo row.

## Browser-based setup and the desktop application

Pairing can be implemented before the desktop wrapper using Web Serial in a supported browser. The page must be delivered in a secure context, such as HTTPS or localhost; the current plain HTTP LAN-IP dashboard URL does not qualify.

The ESP32 must be connected to the computer running the browser. Browser-side USB access does not require passing the serial device into the Node-RED Docker container. The serial port must be available rather than held by a serial monitor or another application.

The browser transports provisioning messages between the controller and the local runtime. The runtime and ESP32 manage their respective private keys; private keys should not be passed through dashboard JavaScript.

For the desktop application, Electron manages the local runtime, device access, and credential storage. An installation identity belongs to that runtime, not to a browser tab. Clearing browser storage must not silently discard ownership or create a new owner.

For the initial browser prototype, support a dashboard running on the same computer as the Node-RED runtime. Supporting a remote browser pairing a different server requires an explicit, authenticated setup channel to that server and should be treated as a separate feature.

References:

- [Web Serial in Chrome](https://developer.chrome.com/docs/capabilities/serial)
- [MDN Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)

## Security boundaries

```text
Protected download page -> permission to download ServoRack
                                      |
                                      v
Local ServoRack installation -- physical USB pairing --> ESP32
       |                                                    |
       | owns private application keys                      | owns private device key
       | trusts paired device identity                      | trusts authorised application identities
       |                                                    |
       +<========== mutually authenticated WSS ==============+
                    ESP32 initiates the connection
```

### Installation and controller identities

- Each ESP32 has a unique device identity and private key.
- Each ServoRack installation has its own identity and private key.
- Device names, IP addresses, MAC-derived names, and discovery advertisements are not authentication credentials.
- Store trusted public identities and role assignments on the controller.
- Private keys remain with the installation or controller that generated them.
- Use separate ownership-authorisation keys if required by the chosen grant protocol; do not casually reuse a TLS key for custom signing operations.

There is no release-wide master password, embedded universal credential, or permanent recovery backdoor.

### Network connection

The existing direction is retained: the ESP32 is the WebSocket client and ServoRack is the server.

Replace plain `ws://` with `wss://` using TLS with mutual authentication:

- The ESP32 verifies the server is an authorised ServoRack installation.
- ServoRack verifies the client is a paired controller.
- Both sides reject untrusted identities before admitting control traffic.
- Bind the authenticated identity to its application role and control session.
- Continue to validate protocol messages, session tokens, counters, and heartbeat freshness after authentication.

TLS proves identity and protects transport; the controller's authorisation policy determines what that identity may do. Trusting an issuer must not automatically make every certificate it issues an owner.

The implementation must define certificate issuance, trust anchors, hostname/SAN verification, key rotation, and any clock requirements. Do not solve changing LAN addresses by disabling certificate verification. Expiring certificates require a reliable approach to time and renewal.

Reference: [Espressif WebSocket TLS and client-certificate support](https://docs.espressif.com/projects/esp-protocols/esp_websocket_client/docs/latest/index.html)

### Local application access

Keep the dashboard and administrative interfaces bound to localhost in the desktop application. Expose only the necessary authenticated controller transport to the LAN. Do not expose an unauthenticated Node-RED editor, dashboard command endpoint, or legacy movement transport as an alternative way to control the ESP32.

A paired installation represents a computer/runtime, not a person. Different people using the same unlocked computer share that installation's authority. User restrictions on that computer remain the customer's responsibility unless application-level user management is added later.

## Granting access to another person

Their ServoRack installation generates its own credentials. Do not copy the owner's private keys to their computer.

### Proposed roles

| Role | Permissions |
| --- | --- |
| Operator | Control servos and edit servo mappings/calibration within the application's supported operations |
| Owner | Operator permissions plus authorise/revoke installations and change ownership/security/connection settings |

The ESP32 enforces these roles. Hiding an owner-only dashboard button is not enforcement.

### In-person access grant

1. The new user installs ServoRack and connects the already-owned ESP32 over USB.
2. They open Controller settings and choose **Add this computer**.
3. A physical action opens the controller's pairing window.
4. Their installation provides a public identity/access request.
5. The existing owner approves that exact identity and its requested role through an authenticated owner connection or a verifiable owner-signed grant.
6. The controller verifies approval and persists the additional trusted identity without removing the existing owner.
7. The owner may deliberately transfer active control to the new installation.

USB access and the physical pairing window alone must not add an owner or bypass an existing owner's approval. An access request must be bound to the target controller, requested public identity and role, and include replay protection. Use established cryptographic primitives rather than a custom password or encryption scheme.

An installation with download access can start setup, but cannot claim an already-owned ESP32 simply by being the first application to connect.

### Later extension: access requests without both computers present

The new installation exports a request containing its public identity. The owner imports and approves it, then registers the grant with the controller or returns a signed grant for verification over USB. This requires the same controller, role, and replay bindings as an in-person grant.

The first version can limit this to an owner-approved in-person workflow. The exchange format and approval UI must be specified before implementation.

## One active control installation

A list of trusted installations does not mean simultaneous control.

The ESP32 currently connects to one configured server. Switching computers requires an explicit transfer that:

1. Authenticates and authorises the request.
2. Disarms every servo and invalidates the old control session and pending targets.
3. Selects the new authorised server destination.
4. Establishes a fresh authenticated connection.
5. Requires new explicit arming on the receiving installation.

Network discovery locates candidate endpoints but never grants access or transfers control. Adding a trusted identity does not automatically change the active server.

If the owner is not the active server, changes may require USB access or an explicitly designed management channel. Merely having an owner app installed elsewhere does not give it an inbound connection to the ESP32.

## Revocation and recovery

### Revoke an installation

An authenticated owner removes the installation from the controller's authorisation list. The controller must re-evaluate access on future connections and terminate an active revoked control session immediately, disarming all outputs. Removing the entry only from a desktop app is insufficient.

Changes to roles and permissions take effect on the controller, not just in the UI. Revocation requires delivering the change to the controller; it cannot be guaranteed while that controller is unreachable.

### Lost owner installation

Provide a deliberate physical ownership reset, using a distinct button/USB procedure. Reset clears prior trust and leaves all servos disarmed. A controller awaiting new ownership must not accept network control.

Specify whether calibration survives ownership reset. The recommended default is to preserve calibration and travel limits while clearing identities, server destinations, and active sessions. A separate factory reset can clear calibration too.

This makes physical access the recovery authority. If the customer needs protection against a person who can physically reset or reflash the board, that is an additional requirement rather than something the pairing password silently solves.

### Firmware and application updates

- Preserve ownership and credentials across routine updates.
- Do not reopen initial setup or install a new shared password on each release.
- Back up and migrate application trust records carefully.
- Do not put private installation credentials into ordinary shared project exports.
- Define recovery if an installation backup containing credentials is restored on another computer; that copy would otherwise share its identity.

## Credential protection and production hardening

Store desktop private keys in appropriately protected local storage, using operating-system credential facilities where practical. Store device credentials in a dedicated protected storage design, separate from ordinary exported servo settings.

For production, evaluate ESP32-P4 secure boot, flash/NVS encryption, signed firmware updates, and debug/recovery policy. These protect against credential extraction or firmware replacement and complement network authentication. Irreversible production security settings require a separately reviewed provisioning and recovery process; this design does not enable them automatically.

Reference: [ESP32-P4 security overview](https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/security/security.html)

## Control invariants

- Unowned controllers admit no network control commands.
- Pairing is available only during an explicit, time-limited physical pairing window.
- Existing ownership cannot be replaced by an ordinary Add this computer operation.
- Pairing, authentication, reconnecting, and transferring control never arm a servo.
- A lost, expired, or revoked control session closes admission and disarms all outputs.
- Old commands and targets cannot replay into a new session.
- There is one active controlling installation at a time.
- Normal performance operation has no dependency on Render, AWS, or internet availability.

## Suggested implementation sequence

1. Define the ownership state machine, roles, physical controls, reset behavior, and USB provisioning protocol.
2. Add device/installation identity generation, protected persistence, and transactional first-owner enrolment.
3. Add WSS mutual authentication and enforce authorised identities and roles before admitting application commands.
4. Add first-time setup and Controller settings to the browser dashboard, initially using local Web Serial.
5. Add owner-approved additional-installation grants, revocation, and deliberate transfer of active control.
6. Integrate the same protocol and persistence into the desktop wrapper.
7. Review and implement production firmware/credential protection separately.

## Acceptance tests

- An unowned device refuses network control before USB pairing.
- Pairing outside the physical window fails.
- An interrupted provisioning transaction never leaves unauthenticated network control available.
- Initial pairing registers exactly one owner and does not move a servo.
- Untrusted servers and unpaired controllers fail authentication.
- Operators cannot grant access, revoke an owner, or change ownership settings.
- An already-owned controller rejects an unapproved additional installation.
- A valid grant cannot be replayed for a different controller, identity, or role.
- Transfer and revocation terminate old control authority and disable pulses.
- Network or process loss still triggers the existing watchdog behavior.
- Updates preserve trust; physical ownership reset clears it without automatically moving outputs.
- Recovery, expired certificates, changing addresses, and lost credentials have tested behavior.
