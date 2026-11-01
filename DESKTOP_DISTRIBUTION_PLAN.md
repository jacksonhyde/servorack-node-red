# ServoRack desktop application and release plan

## Objective

Distribute ServoRack as an installable desktop application that opens directly into the MIDI Mapping dashboard. Node-RED runs locally in the background; users do not need Docker, Node.js, a terminal, or the Node-RED editor.

Users download installers from a password-protected frontend hosted on Render. GitHub Actions builds releases, Amazon S3 stores the artifacts, and CloudFront delivers them. CloudFront is the delivery layer, not a bucket.

```text
GitHub Actions -> signed installers -> private S3 bucket -> CloudFront
                                                             ^
Render download page -> authentication/download service -> signed link

Installed ServoRack -> local Node-RED + MIDI -> Ethernet -> ESP32
```

The performance runtime stays on the user's computer so it can access USB MIDI devices and the local network without depending on internet connectivity. Render and AWS provide distribution infrastructure.

## 1. Create the desktop application

Use Electron Forge to package Electron, Node-RED, the dashboard, and our custom MIDI node.

- Open directly into MIDI Mapping.
- Run Node-RED in a background process managed by the application.
- Display a loading screen until the dashboard is ready.
- Stop the runtime cleanly when the application quits.
- Keep the Node-RED editor out of the normal user interface.
- Prevent multiple application instances from competing for MIDI devices or network ports.

Node-RED supports embedding in another application. Forge provides packaging, installer generation, and native-module rebuilding.

References:

- [Node-RED embedding](https://nodered.org/docs/user-guide/runtime/embedding)
- [Electron Forge build lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle)

## 2. Make the runtime portable

Replace development assumptions with application configuration:

- Remove hardcoded controller identities and computer IP addresses.
- Provide controller discovery or a simple address-entry screen.
- Keep dashboard access local to the computer, while exposing the WebSocket control endpoint to the ESP32 on the LAN.
- Bundle every required dependency so users never need to run npm or install Docker.
- Remove unused MQTT dependencies from desktop starter flows unless a retained feature requires them.
- Preserve explicit per-servo arming and connection-loss disarming.

Test the native MIDI binding on each supported operating system and architecture. This is the main packaging compatibility risk. Native modules must match the runtime that actually loads them.

Reference: [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

## 3. Separate installed software from persistent data

Store writable data in the operating system's application-data directory, outside the installed application:

```text
ServoRack/
  settings/
  node-red/
    flows.json
    flows_cred.json
    servorack-context/
  backups/
  logs/
```

- Seed starter flows only on first launch.
- Preserve user flows, mappings, credentials, and selected devices during updates.
- Use versioned migrations and create a backup before migrating.
- Provide project export and import.
- Keep the Node-RED credential encryption secret stable across restarts and updates.
- Flush persistent context and stop Node-RED cleanly before shutdown or update installation.

Existing servo calibration remains on the ESP32. Importing the current Docker instance should transfer its flows, credentials and their encryption secret, and persistent context. Do not copy its platform-specific dependencies into the desktop installation.

Reference: [Electron application API and userData](https://www.electronjs.org/docs/latest/api/app)

## 4. Build platform-specific installers

Decide the supported operating system and architecture matrix before implementing the release pipeline. Start with one platform, then expand.

| Platform | Typical download |
| --- | --- |
| Windows | Signed installer `.exe` |
| macOS | Signed and notarized `.dmg` |
| Linux | `.AppImage` and/or `.deb` |

Build native dependencies for the packaged runtime on corresponding runners. Configure application identity, icons, version information, signing, and installer behavior.

Reference: [Electron Forge packaging and installer lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle)

## 5. Add GitHub Actions workflows

### Pull requests: desktop-ci.yml

1. Install pinned dependencies.
2. Run existing flow and protocol tests.
3. Test first launch, persistence, and migrations.
4. Build the desktop application.
5. Run packaged-application smoke tests with a simulated controller and MIDI source.

CI can simulate devices, but physical USB MIDI and Ethernet acceptance testing is also required on each supported platform.

### Version tags: desktop-release.yml

Trigger on version tags such as `desktop-v1.0.0`:

1. Verify that the tag matches the application version.
2. Run the test suite.
3. Build each supported platform and architecture.
4. Sign installers and notarize macOS builds.
5. Generate SHA-256 checksums and release metadata.
6. Upload installers to immutable, versioned S3 paths.
7. Publish the stable release manifest only after all required builds succeed.

Use GitHub OIDC to obtain temporary AWS deployment credentials, restricted to this repository's release workflow and required artifact paths. Store application-signing credentials in protected release secrets; do not expose them to untrusted pull-request jobs.

Reference: [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)

## 6. Configure S3 and CloudFront

Use versioned artifact paths:

```text
releases/1.0.0/windows/x64/ServoRack-Setup.exe
releases/1.0.0/macos/arm64/ServoRack.dmg
releases/1.0.0/checksums.sha256
channels/stable.json
```

- Keep the S3 bucket private.
- Grant CloudFront access through Origin Access Control.
- Require signed CloudFront URLs for installer downloads.
- Cache immutable, versioned installers for a long time.
- Give the stable manifest a short cache lifetime.
- Roll back a release by pointing the stable manifest at a previous complete release.

Origin Access Control protects access to S3; signed URLs separately protect viewer access through CloudFront.

References:

- [CloudFront private content](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html)
- [CloudFront signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)
- [Electron Forge S3 publisher](https://www.electronforge.io/config/publishers/s3)

## 7. Build the Render download page and access gate

Keep the download frontend static on Render. Display the latest version, release notes, and platform-specific download buttons.

Password protection requires a trusted server or access proxy. A password check implemented entirely in static JavaScript does not protect installers. If the page itself must be inaccessible before login, its access layer must enforce that too.

Add a small Render authentication/download web service that:

1. Validates the password and establishes a session.
2. Returns release information.
3. Checks the session when a download is requested.
4. Generates a short-lived CloudFront signed URL for the requested installer.

Keep the CloudFront signing key in service secrets, never in frontend code. Restrict download requests to known artifacts from the release manifest. The browser downloads the installer directly from CloudFront, rather than sending large files through Render.

Protecting only the download page would otherwise leave direct installer URLs accessible.

References:

- [Render static sites](https://render.com/docs/static-sites)
- [CloudFront signed URLs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)

## 8. Validate installation and upgrades

Test on clean machines without Docker, Node.js, or developer tools:

- Install, open the dashboard, select MIDI, and connect the controller.
- Restart and confirm mappings and settings persist.
- Upgrade and confirm existing projects survive.
- Verify initial migration from the current Docker instance.
- Disconnect MIDI or Ethernet and verify disarming.
- Quit the application and verify the controller watchdog stops control.
- Confirm downloads require authorization and signed links expire.
- Confirm the application works offline after installation.

Ship manual installer updates first. Add automatic updates later using the same release infrastructure. Update installation must wait until servos are disarmed, persistent data is flushed, and the runtime has stopped. Private update downloads also need an authentication design; the installed application should not contain a shared website password or a CloudFront signing key.

Reference: [Electron application updates](https://www.electronjs.org/docs/latest/tutorial/updates)

## Implementation order

1. Desktop runtime opening the existing dashboard.
2. Persistent storage, migrations, and import/export.
3. One working platform-specific installer.
4. GitHub Actions release pipeline.
5. Protected Render download frontend and CloudFront delivery.
6. Additional operating systems and architectures.
7. Automatic updates.
