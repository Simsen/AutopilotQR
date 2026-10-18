import { useCallback, useEffect, useState } from "react";
import type { AccountInfo } from "@azure/msal-browser";
import { initAuth, signIn, signOut } from "./lib/auth";
import { isConfigured } from "./config";
import { DeviceLinkError, looksLikeDeviceLink, scanToDevice, type ScannedDevice } from "./lib/devicelink";
import {
  confirmPreassociated,
  explainError,
  findBySerial,
  getOrganization,
  importDevice,
  listDevicePreparationPolicies,
  type DevicePreparationPolicy,
  type Organization,
  type TenantAssociatedDevice,
} from "./lib/graph";
import { Scanner } from "./components/Scanner";

type Step =
  | { kind: "scan"; notice?: string }
  | { kind: "review"; device: ScannedDevice }
  | { kind: "submitting"; device: ScannedDevice; phase: string }
  | { kind: "done"; device: ScannedDevice; record: TenantAssociatedDevice; policyName: string }
  | { kind: "failed"; device: ScannedDevice; title: string; detail: string; requestId?: string };

const NONE = "";
const lastPolicyKey = (tenantId: string) => `apqr.lastPolicy.${tenantId}`;
const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

export default function App() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured()) {
      setAuthReady(true);
      return;
    }
    initAuth()
      .then(setAccount)
      .catch((e) => setAuthError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAuthReady(true));
  }, []);

  if (!isConfigured())
    return (
      <Shell>
        <div className="card warn">
          <h2>Not configured</h2>
          <p>
            Set <code>VITE_CLIENT_ID</code> to the application (client) ID of your Entra app registration. See the README.
          </p>
        </div>
      </Shell>
    );

  if (!authReady) return <Shell><p className="muted">Loading…</p></Shell>;

  if (!account)
    return (
      <Shell>
        <div className="card">
          <h2>Pre-associate Windows devices from a QR code</h2>
          <ol className="steps">
            <li>Sign in with your Intune admin account.</li>
            <li>On the Windows device in OOBE, press the <b>Windows key five times</b>, select <b>Device association</b>, and scan the QR code shown on screen.</li>
            <li>Pick a Device Preparation policy, confirm the tenant, and associate.</li>
            <li>Click <b>Next</b> on the device to complete association.</li>
          </ol>
          <p className="muted small">
            Runs entirely in your browser. Tokens and device data go only to Microsoft — never to the developer.
          </p>
          {authError && <p className="error">{authError}</p>}
          <button className="btn" onClick={() => signIn()}>Sign in with Microsoft</button>
        </div>
      </Shell>
    );

  return <SignedIn account={account} />;
}

function Shell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="page">
      <div className="app">
        <header className="top">
          <span className="brand">Autopilot QR</span>
          {header}
        </header>
        <main>{children}</main>
      </div>
      <footer className="site-footer">
        AutopilotQR is owned and maintained by{" "}
        <a href="https://www.linkedin.com/in/simoneriksendk/" target="_blank" rel="noopener noreferrer">
          Simon Hartmann Eriksen
        </a>
        .
      </footer>
    </div>
  );
}

function SignedIn({ account }: { account: AccountInfo }) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [policies, setPolicies] = useState<DevicePreparationPolicy[] | null>(null);
  const [loadError, setLoadError] = useState<ReturnType<typeof explainError> | null>(null);
  const [step, setStep] = useState<Step>({ kind: "scan" });

  const tenantId = account.tenantId;

  useEffect(() => {
    Promise.all([getOrganization(), listDevicePreparationPolicies()])
      .then(([o, p]) => {
        setOrg(o);
        setPolicies(p);
      })
      .catch((e) => setLoadError(explainError(e)));
  }, []);

  const onScanText = useCallback(async (text: string) => {
    if (text === "__NO_QR__") {
      setStep({ kind: "scan", notice: "No QR code found in the photo. Try again closer, straight on, without glare." });
      return;
    }
    if (!looksLikeDeviceLink(text)) {
      setStep({ kind: "scan", notice: "That QR code is not a Windows device association code." });
      return;
    }
    try {
      const device = await scanToDevice(text);
      setStep({ kind: "review", device });
    } catch (e) {
      setStep({ kind: "scan", notice: e instanceof DeviceLinkError ? e.message : "Could not read the QR code." });
    }
  }, []);

  const header = (
    <div className="who">
      <div className="tenant">
        <span className="tenant-name">{org?.displayName ?? "…"}</span>
        <span className="tenant-id">{tenantId}</span>
      </div>
      <div className="user">{account.username}</div>
      <div className="actions">
        <button className="link" onClick={() => signIn(true)}>Switch</button>
        <button className="link" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );

  if (loadError)
    return (
      <Shell header={header}>
        <ErrorCard title={loadError.title} detail={loadError.detail} requestId={loadError.requestId} />
      </Shell>
    );

  return (
    <Shell header={header}>
      {step.kind === "scan" && (
        <>
          {step.notice && <div className="card warn small">{step.notice}</div>}
          <Scanner onText={onScanText} paused={false} />
        </>
      )}

      {step.kind === "review" && (
        <Review
          device={step.device}
          org={org}
          tenantId={tenantId}
          policies={policies}
          onCancel={() => setStep({ kind: "scan" })}
          onSubmit={async (policyId) => {
            const device = step.device;
            const policyName = policies?.find((p) => p.id === policyId)?.name ?? "None (user's policy)";
            safeSet(lastPolicyKey(tenantId), policyId ?? NONE);
            try {
              setStep({ kind: "submitting", device, phase: "Importing to Intune…" });
              const created = await importDevice(device.deviceLink, policyId);
              setStep({ kind: "submitting", device, phase: "Confirming in Intune…" });
              const record = await confirmPreassociated(created.id);
              setStep({ kind: "done", device, record, policyName });
            } catch (e) {
              setStep({ kind: "failed", device, ...explainError(e) });
            }
          }}
        />
      )}

      {step.kind === "submitting" && (
        <div className="card">
          <DeviceSummary device={step.device} />
          <p className="progress">{step.phase}</p>
        </div>
      )}

      {step.kind === "done" && (
        <div className="card ok">
          <h2>Pre-associated ✓</h2>
          <DeviceSummary device={step.device} />
          <dl className="kv">
            <dt>Tenant</dt>
            <dd>{org?.displayName} <span className="mono">({tenantId})</span></dd>
            <dt>Policy</dt>
            <dd>{step.policyName}</dd>
            <dt>State</dt>
            <dd className="mono">{step.record.associationState}</dd>
          </dl>
          <p>On the device, click <b>Next</b> to complete association.</p>
          <button className="btn" onClick={() => setStep({ kind: "scan" })}>Scan next device</button>
        </div>
      )}

      {step.kind === "failed" && (
        <>
          <ErrorCard title={step.title} detail={step.detail} requestId={step.requestId} device={step.device} />
          <button className="btn" onClick={() => setStep({ kind: "scan" })}>Scan again</button>
        </>
      )}
    </Shell>
  );
}

function Review(props: {
  device: ScannedDevice;
  org: Organization | null;
  tenantId: string;
  policies: DevicePreparationPolicy[] | null;
  onCancel: () => void;
  onSubmit: (policyId: string | null) => void;
}) {
  const { device, org, tenantId, policies } = props;
  const remembered = safeGet(lastPolicyKey(tenantId));
  const initial =
    remembered !== null && (remembered === NONE || policies?.some((p) => p.id === remembered))
      ? remembered
      : policies?.[0]?.id ?? NONE;
  const [policyId, setPolicyId] = useState<string>(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [existing, setExisting] = useState<TenantAssociatedDevice[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    findBySerial(device.serialNumber)
      .then(setExisting)
      .catch((e) => setCheckError(explainError(e).detail));
  }, [device.serialNumber]);

  const ageMin = Math.round((Date.now() - device.generatedAt.getTime()) / 60000);
  const blocked = (existing?.length ?? 0) > 0;

  return (
    <div className="card">
      <h2>Review</h2>
      <DeviceSummary device={device} />
      <p className="muted small">QR generated {ageMin <= 0 ? "just now" : `${ageMin} min ago`}.</p>

      {existing === null && !checkError && <p className="muted small">Checking whether this device already exists…</p>}
      {checkError && <p className="warn-text small">Could not check for an existing record: {checkError}</p>}
      {blocked && (
        <div className="warn-text">
          This serial number already has a device association record in this tenant
          (state: <span className="mono">{existing![0].associationState}</span>). Importing again is blocked.
        </div>
      )}

      <label className="field">
        <span>Device Preparation policy</span>
        <select value={policyId} onChange={(e) => setPolicyId(e.target.value)} disabled={!policies}>
          {policies?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value={NONE}>None — use the signing-in user's policy</option>
        </select>
      </label>
      {policies && policies.length === 0 && (
        <p className="muted small">No Device Preparation policies found in this tenant.</p>
      )}

      <label className="confirm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>
          Associate with <b>{org?.displayName ?? "this tenant"}</b>
          <br />
          <span className="mono small">{tenantId}</span>
        </span>
      </label>

      <div className="row">
        <button className="btn secondary" onClick={props.onCancel}>Cancel</button>
        <button
          className="btn"
          disabled={!confirmed || blocked || existing === null && !checkError}
          onClick={() => props.onSubmit(policyId === NONE ? null : policyId)}
        >
          Associate device
        </button>
      </div>
    </div>
  );
}

function DeviceSummary({ device }: { device: ScannedDevice }) {
  return (
    <dl className="kv">
      <dt>Serial</dt>
      <dd className="mono">{device.serialNumber}</dd>
      <dt>Device</dt>
      <dd>{device.manufacturer} {device.model}</dd>
    </dl>
  );
}

function ErrorCard(props: { title: string; detail: string; requestId?: string; device?: ScannedDevice }) {
  return (
    <div className="card error-card">
      <h2>{props.title}</h2>
      {props.device && <DeviceSummary device={props.device} />}
      <p>{props.detail}</p>
      {props.requestId && (
        <p className="small">
          Request ID: <span className="mono selectable">{props.requestId}</span>
        </p>
      )}
    </div>
  );
}
