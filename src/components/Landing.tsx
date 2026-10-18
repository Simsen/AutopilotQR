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

const STEPS: { title: string; body: React.ReactNode }[] = [
  { title: "Sign in", body: "Use your Intune admin account in the tenant the device should join." },
  {
    title: "Open on the device",
    body: (
      <>
        In OOBE, press the <b>Windows key five times</b> and select <b>Device association</b>.
      </>
    ),
  },
  { title: "Scan and confirm", body: "Scan the QR code, pick a Device Preparation policy and confirm the tenant." },
  {
    title: "Finish",
    body: (
      <>
        Click <b>Next</b> on the device to complete association.
      </>
    ),
  },
];

export function Landing({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  const wide = useWide();

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-text">
          <h1>Pre-associate Windows devices with a QR code</h1>
          <p className="lead">
            Scan the Autopilot Device Preparation QR code shown in OOBE and add the device to Intune — no CSV export, no USB stick.
          </p>
          {error && <p className="error">{error}</p>}
          <button className="btn hero-btn" onClick={onSignIn}>
            Sign in with Microsoft
          </button>
          <p className="small muted note">
            {wide ? "Scan with this computer's webcam, or open the page on your phone. " : ""}
            Runs entirely in your browser — tokens and device data go only to Microsoft.
          </p>
        </div>
        {wide && (
          <div className="hero-qr card">
            <h2>On your phone?</h2>
            <OpenOnPhone />
          </div>
        )}
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="section-title">How it works</h2>
        <ol className="step-grid">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="details" className="faq">
        <h2 id="details" className="section-title">Before you start</h2>

        <details>
          <summary>Requirements</summary>
          <div className="faq-body">
            <h4>Device</h4>
            <ul>
              <li>Physical device (no VMs)</li>
              <li>
                Windows 11 24H2 or 25H2 with <b>KB5120998</b> or later (build .9278+) — documented by Microsoft
              </li>
              <li>Windows 11 26H2 — not yet in Microsoft's documented list; test before you roll out</li>
              <li>x64 is the safest choice. Arm64 devices (e.g. Snapdragon) have been reported to be less reliable — test before you roll out</li>
              <li>
                TPM 2.0 enabled and ready, UEFI, <b>Secure Boot on</b>
              </li>
              <li>
                Network access to <code>ztd.dds.microsoft.com</code> and <code>*.attest.azure.net</code>
              </li>
            </ul>
            <h4>Admin</h4>
            <ul>
              <li>An Intune role that can manage device association and Device Preparation policies</li>
              <li>Admin consent for this app in your tenant (asked on first sign-in)</li>
              <li>A Device Preparation policy — optional; without one the signing-in user's policy applies</li>
            </ul>
          </div>
        </details>

        <details>
          <summary>Permissions</summary>
          <div className="faq-body">
            <p className="muted">All delegated — the app acts as you and can never do more than your Intune role allows.</p>
            <dl className="kv-list">
              <div>
                <dt><code>DeviceManagementServiceConfig.ReadWrite.All</code></dt>
                <dd>Import the device and read the association record back</dd>
              </div>
              <div>
                <dt><code>DeviceManagementConfiguration.Read.All</code></dt>
                <dd>List Device Preparation policies</dd>
              </div>
              <div>
                <dt><code>User.Read</code></dt>
                <dd>Show who you are and which tenant you are in</dd>
              </div>
            </dl>
          </div>
        </details>

        <details>
          <summary>Privacy &amp; security</summary>
          <div className="faq-body">
            <ul>
              <li>Static site — no backend, no analytics, no telemetry.</li>
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
          </div>
        </details>

        <details>
          <summary>Troubleshooting</summary>
          <div className="faq-body">
            <dl className="kv-list">
              <div>
                <dt>"Microsoft could not import this device" (HTTP 500)</dt>
                <dd>The device doesn't meet requirements — check Secure Boot, TPM and build. Retrying won't help.</dd>
              </div>
              <div>
                <dt>"Not allowed" (401/403)</dt>
                <dd>Missing Intune role or admin consent.</dd>
              </div>
              <div>
                <dt>No "Device association" option in OOBE</dt>
                <dd>The build is below .9278 — install the latest cumulative update.</dd>
              </div>
              <div>
                <dt>It fails on an Arm64 or 26H2 device</dt>
                <dd>
                  These are less tested. Try an x64 device on 25H2 to rule out tenant issues, and{" "}
                  <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
                    report it on GitHub
                  </a>
                  .
                </dd>
              </div>
              <div>
                <dt>The QR code won't scan</dt>
                <dd>Fill the frame, hold it straight, avoid glare — or use "Take a photo".</dd>
              </div>
            </dl>
          </div>
        </details>
      </section>
    </div>
  );
}
