# AutopilotQR

**Scan. Associate. Deploy.**

**AutopilotQR** is a free, open-source browser app for **Windows Autopilot device preparation – Device Association**. Sign in to your own Microsoft Entra tenant, scan the QR code displayed during Windows out-of-box experience (OOBE), and pre-associate the device with Microsoft Intune.

**No CSV exports. No USB drives. No installation.** Just a modern browser on your phone or computer.

### [🚀 Launch AutopilotQR](https://autopilotqr.app/) · [💻 Source code](https://github.com/Simsen/AutopilotQR) · [🐛 Report an issue](https://github.com/Simsen/AutopilotQR/issues)

> [!IMPORTANT]
> **Early preview.** AutopilotQR relies on a **Microsoft Graph beta** Device Association API that may change. Validate the complete workflow in a test tenant and on supported physical hardware before wider deployment.

## How it works

**Sign in → Scan → Choose policy → Confirm tenant → Associate → Continue OOBE**

1. On a supported Windows 11 device at the **OOBE region screen**, press the **Windows key five times** and select **Scan QR code**.
2. Open [autopilotqr.app](https://autopilotqr.app/) on your phone or computer and **sign in with your Microsoft Entra account**.
3. **Scan the QR code** using your camera (or use the app's photo option).
4. **Select the Device Preparation policy**, review the destination tenant, and confirm the association.
5. AutopilotQR submits the DeviceLink information to Microsoft Graph and checks for the **`preassociated`** status.
6. Continue on the Windows device. After the device completes the required association steps, its status can become **`associated`**.

> [!TIP]
> The QR code contains sensitive device-association information. Don't publish photos of real OOBE QR codes or paste the payload into public issues.

## Why AutopilotQR?

| Feature | What it means |
| --- | --- |
| **Works on your phone** | Scan an OOBE QR code using a mobile browser. |
| **Your own tenant** | Multitenant Microsoft Entra sign-in; no separate app registration required for the hosted version, subject to tenant consent policy. |
| **No backend** | The application runs in your browser and communicates directly with Microsoft identity services and Graph. |
| **Delegated permissions** | Operations use the signed-in account and remain subject to Graph permissions and Intune RBAC. |
| **Open source** | Review the implementation, report issues, or self-host. |

## Requirements

**Windows device**

- Physical, supported **Windows 11** device in OOBE.
- As documented for this project's current preview: Windows 11 **24H2 or 25H2**, with **KB5120998 or later** (build **26100/26200.9278+**). Verify against Microsoft's current requirements before deployment.
- **TPM 2.0**, **UEFI**, and **Secure Boot** enabled and ready.
- Connectivity to `ztd.dds.microsoft.com` and `*.attest.azure.net`.
- **Windows 11 26H2** and **Arm64** have not been established as supported by this project's testing; validate separately.

**Administrator and tenant**

- A Microsoft Entra work or school account in the **destination tenant**.
- Appropriate **Intune RBAC** permissions to manage Device Association and access Device Preparation policies.
- Consent for the app's **delegated Microsoft Graph permissions** (an administrator may need to approve these depending on tenant policy).

## Permissions and privacy

AutopilotQR requests these **delegated Microsoft Graph scopes**:

| Permission | Why it is needed |
| --- | --- |
| `DeviceManagementServiceConfig.ReadWrite.All` | Import the association data and read the association record. |
| `DeviceManagementConfiguration.Read.All` | Read Device Preparation policies for selection. |
| `User.Read` | Identify the signed-in account and tenant. |

The hosted app uses **MSAL.js with authorization code + PKCE**; it does not use a client secret. Authentication tokens and association data are processed in the browser and sent to Microsoft services, **not to a developer-hosted backend**. The project states that it does not collect application telemetry. The destination tenant must be confirmed before import.

> [!NOTE]
> Delegated OAuth consent does **not** replace Intune RBAC. A successful sign-in does not guarantee that a user is authorized to associate devices.

## Technical details

The Windows OOBE QR payload uses a DeviceLink format similar to:

```text
devicelink:/1/?sn=…&data=…
```

AutopilotQR decodes the DeviceLink payload, converts it to the import format, and calls the Graph beta operation:

```http
POST /beta/deviceManagement/tenantAssociatedDevices/importTenantAssociatedDevice
```

The app then reads the association record and reports success only after Intune returns **`preassociated`**. This is distinct from the subsequent **`associated`** state.

Core implementation files:

- `src/lib/devicelink.ts` — DeviceLink parsing and conversion.
- `src/lib/graph.ts` — Microsoft Graph operations.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| **No “Scan QR code” option in OOBE** | Check the supported Windows build and applicable updates. |
| **QR code won't scan** | Avoid glare, move closer, center the QR code, or use **Take a photo**. |
| **401 / 403** | Check delegated permission consent and the account's Intune RBAC role. |
| **Import fails / HTTP 500** | Check device prerequisites, TPM, Secure Boot, build, and networking. Record the Graph request ID for investigation. A 500 response is not definitive proof of a device prerequisite failure. |
| **Arm64 or Windows 11 26H2 issue** | Test against the documented baseline first and report reproducible differences. |

If you encounter a reproducible problem, [open an issue](https://github.com/Simsen/AutopilotQR/issues). Include the browser, Windows version/build, device architecture, sanitized error message and Graph request ID where available. **Never include QR payloads, access tokens, or customer identifiers.**

## Self-hosting

You can run AutopilotQR with your **own Microsoft Entra app registration**.

1. Create an application registration under **Microsoft Entra admin center → App registrations**.
2. Select **Single-page application (SPA)** and register the exact URL you will use, including the trailing slash (for example, `https://qr.contoso.com/`).
3. Add the three **delegated Microsoft Graph permissions** listed above and grant consent as appropriate.
4. Copy the **Application (client) ID** and set `VITE_CLIENT_ID`.
5. Build and publish the static site over HTTPS. **No client secret is needed.**

### Run locally

```bash
git clone https://github.com/Simsen/AutopilotQR.git
cd AutopilotQR
cp .env.example .env.local
# Set VITE_CLIENT_ID in .env.local.
# Add http://localhost:5173/ as a SPA redirect URI in your development app registration.
npm ci
npm run dev
```

Browser camera access requires **HTTPS** or a trustworthy local origin such as `localhost`.

### GitHub Pages deployment

1. In your fork: **Settings → Pages → Source: GitHub Actions**.
2. Set repository **Actions variables**: `VITE_CLIENT_ID` and optionally `PAGES_DOMAIN`.
3. Push a release tag to trigger the configured deployment workflow.

```bash
git tag v0.1.0
git push --tags
```

For development checks:

```bash
npm test
npm run typecheck
npm run build
```

## Contributing and feedback

AutopilotQR is a community project. Real-device testing and clear issue reports are especially valuable while the Device Association API is in beta.

- [Report a bug or request an improvement](https://github.com/Simsen/AutopilotQR/issues)
- [Explore the code](https://github.com/Simsen/AutopilotQR)

## Credits

- [Rudy Ooms / call4cloud — Autopilot Device Association Script](https://github.com/call4cloud-code/Autopilot-Device-Association-Script), for research into DeviceLink and the Graph integration.
- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm), for QR decoding.

## License and disclaimer

Licensed under the **MIT License** — see [LICENSE](LICENSE).

AutopilotQR is an **independent community project**, not an official Microsoft product and not affiliated with, endorsed by, or supported by Microsoft. Microsoft, Windows, Intune and Autopilot are trademarks of the Microsoft group of companies.
