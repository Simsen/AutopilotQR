import { APDP_TEMPLATE_ID, GRAPH_BASE } from "../config";
import { getToken } from "./auth";

/**
 * The only module that knows Graph URLs and shapes. Uses Graph beta
 * (deviceManagement/tenantAssociatedDevices) — the same calls the Intune portal makes.
 */

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export interface Organization {
  id: string;
  displayName: string;
}

export interface DevicePreparationPolicy {
  id: string;
  name: string;
}

export type AssociationState = "preassociated" | "associated" | "pendingRemoval" | string;

export interface TenantAssociatedDevice {
  id: string;
  serialNumber: string | null;
  manufacturerName: string | null;
  modelName: string | null;
  associationState: AssociationState;
  devicePreparationPolicyId: string | null;
  preassociationDateTime: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = await getToken();
  const res = await fetch(path.startsWith("https://") ? path : `${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  // Throttling: honour Retry-After, max 3 attempts. 5xx is NOT retried — import 500s are deterministic.
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("Retry-After")) || 2 ** attempt * 2;
    await sleep(Math.min(wait, 30) * 1000);
    return graph<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    let code = `HTTP${res.status}`;
    let message = res.statusText;
    let requestId = res.headers.get("request-id") ?? undefined;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
      requestId = body?.error?.innerError?.["request-id"] ?? requestId;
    } catch {
      /* non-JSON error body */
    }
    throw new GraphError(message, res.status, code, requestId);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getOrganization(): Promise<Organization> {
  const r = await graph<{ value: Organization[] }>("https://graph.microsoft.com/v1.0/organization?$select=id,displayName");
  const org = r.value?.[0];
  if (!org) throw new GraphError("Could not read tenant information.", 0, "NoOrganization");
  return org;
}

export async function listDevicePreparationPolicies(): Promise<DevicePreparationPolicy[]> {
  const filter =
    `(technologies has 'enrollment') and (platforms eq 'windows10') and ` +
    `(TemplateReference/templateId eq '${APDP_TEMPLATE_ID}') and (Templatereference/templateFamily eq 'enrollmentConfiguration')`;
  let url: string | undefined = `/deviceManagement/configurationPolicies?$select=id,name&$filter=${encodeURIComponent(filter)}`;
  const out: DevicePreparationPolicy[] = [];
  while (url) {
    const page: { value: DevicePreparationPolicy[]; "@odata.nextLink"?: string } = await graph(url);
    out.push(...page.value);
    url = page["@odata.nextLink"];
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const DEVICE_SELECT =
  "id,serialNumber,manufacturerName,modelName,associationState,devicePreparationPolicyId,preassociationDateTime";

export async function findBySerial(serial: string): Promise<TenantAssociatedDevice[]> {
  const escaped = serial.replace(/'/g, "''");
  const filter = encodeURIComponent(`contains(serialNumber,'${escaped}')`);
  const r = await graph<{ value: TenantAssociatedDevice[] }>(
    `/deviceManagement/tenantAssociatedDevices?$select=${DEVICE_SELECT}&$top=100&$filter=${filter}`,
  );
  // contains() is fuzzy — keep exact matches only.
  return r.value.filter((d) => (d.serialNumber ?? "").toLowerCase() === serial.toLowerCase());
}

export async function importDevice(deviceLink: string, policyId: string | null): Promise<TenantAssociatedDevice> {
  const body: Record<string, string> = { deviceLink };
  if (policyId) body.devicePreparationPolicyId = policyId;
  return graph<TenantAssociatedDevice>("/deviceManagement/tenantAssociatedDevices/importTenantAssociatedDevice", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getDevice(id: string): Promise<TenantAssociatedDevice> {
  return graph<TenantAssociatedDevice>(
    `/deviceManagement/tenantAssociatedDevices/${encodeURIComponent(id)}?$select=${DEVICE_SELECT}`,
  );
}

/** Read back until the service reports preassociated/associated. Success = state, never timestamps. */
export async function confirmPreassociated(id: string, timeoutMs = 30_000): Promise<TenantAssociatedDevice> {
  const deadline = Date.now() + timeoutMs;
  let last: TenantAssociatedDevice | null = null;
  while (Date.now() < deadline) {
    try {
      last = await getDevice(id);
      if (last.associationState === "preassociated" || last.associationState === "associated") return last;
    } catch (e) {
      if (!(e instanceof GraphError && e.status === 404)) throw e; // briefly 404 right after import
    }
    await sleep(3000);
  }
  throw new GraphError(
    `Import accepted, but the record did not reach "preassociated" in time (last state: ${last?.associationState ?? "not found"}).`,
    0,
    "ConfirmTimeout",
  );
}

/** Human-readable explanation for the field technician. */
export function explainError(e: unknown): { title: string; detail: string; requestId?: string } {
  if (e instanceof GraphError) {
    if (e.status === 401 || e.status === 403)
      return {
        title: "Not allowed",
        detail:
          "Your account or this app lacks permission. You need an Intune role that can manage device association, and admin consent for this app in your tenant.",
        requestId: e.requestId,
      };
    if (e.status === 400)
      return { title: "Rejected by Microsoft", detail: "The device data was not accepted. Rescan the QR code.", requestId: e.requestId };
    if (e.status >= 500)
      return {
        title: "Microsoft could not import this device",
        detail:
          "Intune returned an internal error. In testing this happens when the device does not meet requirements (Secure Boot on, TPM 2.0, Windows 11 24H2/25H2 with KB5120998+) or is already claimed elsewhere. It will fail the same way if retried — check the device, or contact Microsoft support with the request ID.",
        requestId: e.requestId,
      };
    if (e.status === 429) return { title: "Throttled", detail: "Too many requests. Wait a minute and retry.", requestId: e.requestId };
    return { title: `Error ${e.status || ""}`.trim(), detail: e.message, requestId: e.requestId };
  }
  return { title: "Error", detail: e instanceof Error ? e.message : String(e) };
}
