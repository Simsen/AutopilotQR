# Autopilot QR

Scan the **Windows Autopilot Device Preparation** OOBE QR code with a phone or webcam and pre-associate the device in Intune — no CSV, no USB stick.

**Sign in → Scan → Pick policy → Confirm tenant → Associate → click Next on the device.**

> Status: early preview. Uses Microsoft Graph **beta** (`deviceManagement/tenantAssociatedDevices`), the same API the Intune admin center uses. It can change without notice.

## How it works

1. On the device in OOBE (region screen), press the **Windows key five times** → **Scan QR code**.
2. The QR contains a TPM-signed device identity (`devicelink:/1/?sn=…&data=…`, gzip + base64 JSON).
3. The app converts it to the format Windows writes to `*.devicelink.csv` and calls
   `POST /beta/deviceManagement/tenantAssociatedDevices/importTenantAssociatedDevice`.
4. It reads the record back and only reports success when Intune says `preassociated`.
5. Click **Next** on the device; Intune then shows `associated`.

Everything runs in your browser. Tokens and device data go only to Microsoft. There is no backend and no telemetry.

## Requirements

**Device** (Microsoft's requirements for device association):
- Physical device, Windows 11 24H2/25H2 with **KB5120998** or later (build 26100/26200 **.9278+**)
- TPM 2.0 enabled and ready, UEFI, **Secure Boot on**
- Network access to `ztd.dds.microsoft.com` and `*.attest.azure.net`

**Admin**: an account with Intune rights to manage device association and Device Preparation policies, in the tenant the device should join.

## Why these permissions

All **delegated** — the app acts as you and can never do more than your Intune role allows.

| Scope | Used for |
|---|---|
| `DeviceManagementServiceConfig.ReadWrite.All` | Import the device and read the association record back |
| `DeviceManagementConfiguration.Read.All` | List Device Preparation policies for the picker |
| `User.Read` | Show who you are and which tenant you are in |

## Use the hosted version

Open the site, sign in, and an admin consents once for your tenant. If your tenant only allows consent to verified publishers, ask your admin to grant consent, or self-host.

## Self-host (bring your own app registration)

1. **Entra admin center → App registrations → New registration**
   - Supported account types: *single tenant* (self-host) or *multitenant* (public instance)
   - Platform: **Single-page application**, redirect URI = your site origin with a trailing slash, e.g. `https://qr.contoso.com/`
   - No client secret.
2. API permissions → Microsoft Graph → **Delegated**: the three scopes above → *Grant admin consent*.
3. Copy the **Application (client) ID**.

### Run locally

```bash
cp .env.example .env.local     # set VITE_CLIENT_ID; add http://localhost:5173/ as SPA redirect URI on a *dev* registration
npm ci
npm run dev
```

Camera access needs HTTPS or `localhost`. To test on a phone, deploy or use an HTTPS tunnel.

### Deploy to GitHub Pages

1. Repo → Settings → Pages → Source: **GitHub Actions**
2. Repo → Settings → Variables → Actions: `VITE_CLIENT_ID` and, optionally, `PAGES_DOMAIN` (custom domain)
3. Tag a release: `git tag v0.1.0 && git push --tags` — only tags deploy.

## Security notes

- Public client, auth code + PKCE (MSAL.js). No secrets anywhere.
- Strict Content-Security-Policy: scripts only from this origin; network only to `login.microsoftonline.com` and `graph.microsoft.com`. The QR decoder (WASM) is self-hosted.
- QR payloads are never logged or sent anywhere except Graph.
- The target tenant (name + ID) must be confirmed before every import.
- Treat the OOBE QR like a device credential: don't post photos of it.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Microsoft could not import this device" (HTTP 500) | Device doesn't meet requirements — check **Secure Boot**, TPM, build. Retrying won't help. Quote the request ID to Microsoft support. |
| "Not allowed" (401/403) | Missing Intune role or admin consent |
| No "Scan QR code" option in OOBE | Build below .9278 — install the latest cumulative update |
| QR won't scan | Fill the frame, straight on, no glare — or use "Take a photo" |

## Development

```bash
npm test         # unit tests (synthetic fixtures; real-device golden test runs if fixtures-private/ exists)
npm run typecheck
npm run build
```

`src/lib/devicelink.ts` — QR parsing and conversion (no dependencies).
`src/lib/graph.ts` — the only module that knows Graph URLs.

## Credits

Graph contract and DeviceLink internals: [call4cloud Autopilot Device Association Script](https://github.com/call4cloud-code/Autopilot-Device-Association-Script) by Rudy Ooms. QR decoding: [zxing-wasm](https://github.com/Sec-ant/zxing-wasm).

## License

MIT
