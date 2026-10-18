import { useEffect, useState } from "react";
import { OpenOnPhone } from "./OpenOnPhone";

const REPO = "https://github.com/Simsen/AutopilotQR";
const WIDE = "(min-width: 900px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Landing({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  const wide = useWide();
  const [more, setMore] = useState(false);

  return (
    <div className="landing">
      <section className="hero">
        <h1>Pre-associate Windows devices from a QR code</h1>
        <p className="lead">
          Scan the Windows Autopilot Device Preparation QR code in OOBE and add the device to Intune — no CSV export, no USB stick.
        </p>
        <ol className="steps">
          <li>Sign in with your Intune admin account.</li>
          <li>
            On the Windows device in OOBE, press the <b>Windows key five times</b>, select <b>Device association</b>, and scan the QR code shown on screen.
          </li>
          <li>Pick a Device Preparation policy, confirm the tenant, and associate.</li>
          <li>
            Click <b>Next</b> on the device to complete association.
          </li>
        </ol>
      </section>

      <aside className="cta">
        <div className="card">
          <h2>{wide ? "Scan with this computer's webcam" : "Get started"}</h2>
          <p className="small muted">Runs entirely in your browser. Tokens and device data go only to Microsoft — never to the developer.</p>
          {error && <p className="error">{error}</p>}
          <button className="btn" onClick={onSignIn}>Sign in with Microsoft</button>
        </div>
        {wide && (
          <div className="card">
            <h2>Or use your phone</h2>
            <OpenOnPhone />
          </div>
        )}
      </aside>

      {!wide && (
        <button className="btn secondary more-toggle" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          {more ? "Show less" : "Requirements, permissions & troubleshooting"}
        </button>
      )}

      {(wide || more) && (
        <div className="details">
          <section className="card">
            <h2>Requirements</h2>
            <h3>Device</h3>
            <ul>
              <li>Physical device (no VMs)</li>
              <li>Windows 11 24H2 or 25H2 with <b>KB5120998</b> or later (build .9278+)</li>
              <li>TPM 2.0 enabled and ready, UEFI, <b>Secure Boot on</b></li>
              <li>
                Network access to <span className="mono">ztd.dds.microsoft.com</span> and <span className="mono">*.attest.azure.net</span>
              </li>
            </ul>
            <h3>Admin</h3>
            <ul>
              <li>An Intune role that can manage device association and Device Preparation policies</li>
              <li>Admin consent for this app in your tenant (asked on first sign-in)</li>
              <li>At least one Device Preparation policy (optional — you can also use the signing-in user's policy)</li>
            </ul>
          </section>

          <section className="card">
            <h2>Permissions</h2>
            <p className="small muted">All delegated — the app acts as you and can never do more than your Intune role allows.</p>
            <dl className="perm">
              <dt className="mono">DeviceManagementServiceConfig.ReadWrite.All</dt>
              <dd>Import the device and read the association record back</dd>
              <dt className="mono">DeviceManagementConfiguration.Read.All</dt>
              <dd>List Device Preparation policies</dd>
              <dt className="mono">User.Read</dt>
              <dd>Show who you are and which tenant you are in</dd>
            </dl>
          </section>

          <section className="card">
            <h2>Privacy &amp; security</h2>
            <ul>
              <li>Static site, no backend, no analytics, no telemetry.</li>
              <li>Sign-in with Microsoft (MSAL, auth code + PKCE). No secrets anywhere.</li>
              <li>Strict Content Security Policy: the page can only talk to Microsoft sign-in and Microsoft Graph.</li>
              <li>The target tenant (name and ID) must be confirmed before every import.</li>
              <li>
                Open source —{" "}
                <a href={REPO} target="_blank" rel="noopener noreferrer">
                  review the code on GitHub
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="card">
            <h2>Troubleshooting</h2>
            <dl className="trouble">
              <dt>"Microsoft could not import this device" (HTTP 500)</dt>
              <dd>The device doesn't meet requirements — check Secure Boot, TPM and build. Retrying won't help.</dd>
              <dt>"Not allowed" (401/403)</dt>
              <dd>Missing Intune role or admin consent.</dd>
              <dt>No "Device association" option in OOBE</dt>
              <dd>The build is below .9278 — install the latest cumulative update.</dd>
              <dt>The QR code won't scan</dt>
              <dd>Fill the frame, hold it straight, avoid glare — or use "Take a photo".</dd>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
