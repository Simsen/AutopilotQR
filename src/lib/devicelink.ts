/**
 * Windows Autopilot Device Preparation — OOBE "Scan QR code" payload.
 *
 * QR text:  devicelink:/1/?sn=<serial>&data=<urlencoded base64(gzip(JSON))>
 * JSON uses short keys (ver, dlict, di{kl,man,mod,sn,sbu,li,lict}, dlkd{sa,skn,sig,pssAlg,pssSaltCb}).
 *
 * Graph `importTenantAssociatedDevice` expects `deviceLink` = base64 of the long-key JSON that
 * Windows writes to the "Data" column of *.devicelink.csv. This module converts between the two.
 * Verified end-to-end against Intune on 2026-10-17 (201 Created → associated). The QR omits the
 * EK public key; the service accepts the payload without it.
 */

export interface QrKey {
  kn: string; // key name, e.g. EK_1, IDK_1
  id: string; // 32 hex chars
  kt: number; // key type
  kp?: string; // public key blob (base64), absent for EK in the QR
}

export interface QrPayload {
  ver: string;
  dlict: string | number; // unix seconds — QR generation time
  di: {
    kl: QrKey[];
    man: string;
    mod: string;
    sn: string;
    sbu: string; // SMBIOS UUID, 32 hex
    li: string; // DeviceLinkId, 32 hex
    lict: string | number; // unix seconds — link id creation
  };
  dlkd: {
    sa: string;
    skn: string;
    sig: string;
    pssAlg: string;
    pssSaltCb: number;
  };
}

/** What the app shows and stores per scanned device. */
export interface ScannedDevice {
  serialNumber: string;
  manufacturer: string;
  model: string;
  linkId: string;
  generatedAt: Date;
  /** base64 value for Graph `deviceLink`. */
  deviceLink: string;
}

export class DeviceLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceLinkError";
  }
}

const SCHEME = /^devicelink:\/1\/\?/i;
const HEX32 = /^[0-9a-fA-F]{32}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_QR_LENGTH = 4096; // QR v40 holds < 3 KB; anything larger is not ours
const MAX_JSON_BYTES = 16 * 1024; // gzip-bomb guard

/** Quick check used by the scanner to ignore unrelated QR codes without throwing. */
export function looksLikeDeviceLink(text: string): boolean {
  return SCHEME.test(text.trim());
}

/** Parse the raw QR text. Throws DeviceLinkError with a user-readable message. */
export async function parseQr(text: string): Promise<QrPayload> {
  const raw = text.trim();
  if (raw.length > MAX_QR_LENGTH) throw new DeviceLinkError("QR code is too large to be a device association code.");
  if (!SCHEME.test(raw)) throw new DeviceLinkError("This is not a Windows device association QR code.");

  // Parse the query manually: URLSearchParams would turn a literal "+" into a space.
  const query = raw.replace(SCHEME, "");
  const params = new Map<string, string>();
  for (const part of query.split("&")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    try {
      params.set(part.slice(0, i), decodeURIComponent(part.slice(i + 1)));
    } catch {
      throw new DeviceLinkError("QR code contains invalid encoding.");
    }
  }
  const sn = params.get("sn");
  const data = params.get("data");
  if (!sn || !data) throw new DeviceLinkError("QR code is missing the serial number or data.");
  if (!BASE64.test(data)) throw new DeviceLinkError("QR data is not valid base64.");

  let json: string;
  try {
    json = await gunzipToString(base64ToBytes(data));
  } catch (e) {
    if (e instanceof DeviceLinkError) throw e;
    throw new DeviceLinkError("QR data could not be decompressed.");
  }

  let payload: QrPayload;
  try {
    payload = JSON.parse(json) as QrPayload;
  } catch {
    throw new DeviceLinkError("QR data is not valid JSON.");
  }

  validate(payload, sn);
  return payload;
}

function validate(p: QrPayload, snFromUrl: string): void {
  const fail = (m: string): never => {
    throw new DeviceLinkError(`Unsupported QR payload: ${m}`);
  };
  if (!p || typeof p !== "object") fail("not an object");
  if (p.ver !== "1.0") fail(`version ${String(p.ver)} (expected 1.0)`);
  const di = p.di;
  const dk = p.dlkd;
  if (!di || !dk) fail("missing device info or signature block");
  for (const f of ["man", "mod", "sn"] as const) {
    if (typeof di[f] !== "string" || !di[f]) fail(`missing ${f}`);
  }
  if (di.sn !== snFromUrl) fail("serial number mismatch");
  if (!HEX32.test(di.sbu ?? "")) fail("invalid SMBIOS UUID");
  if (!HEX32.test(di.li ?? "")) fail("invalid link ID");
  if (!isUnixSeconds(p.dlict) || !isUnixSeconds(di.lict)) fail("invalid timestamps");
  if (!Array.isArray(di.kl) || di.kl.length === 0) fail("no device keys");
  for (const k of di.kl) {
    if (typeof k.kn !== "string" || !HEX32.test(k.id ?? "") || typeof k.kt !== "number") fail("malformed key entry");
    if (k.kp !== undefined && !BASE64.test(k.kp)) fail("malformed public key");
  }
  const signer = di.kl.find((k) => k.kn === dk.skn);
  if (!signer?.kp) fail("signing key not present");
  if (typeof dk.sig !== "string" || !BASE64.test(dk.sig)) fail("invalid signature");
  if (typeof dk.sa !== "string" || typeof dk.pssAlg !== "string" || typeof dk.pssSaltCb !== "number") {
    fail("invalid signature metadata");
  }
}

/**
 * Convert to the long-key JSON that Windows exports, base64-encoded, for Graph `deviceLink`.
 * Key order and formats mirror the Windows export exactly.
 */
export function toDeviceLink(p: QrPayload): string {
  const out = {
    Version: p.ver,
    DeviceLinkCreationTimeUtc: unixToIso(p.dlict),
    DeviceInfo: {
      DeviceIdKeyList: p.di.kl.map((k) => {
        const entry: Record<string, string | number> = {
          KeyName: k.kn,
          KeyId: toGuid(k.id),
          KeyType: k.kt,
        };
        if (k.kp) entry.KeyPub = k.kp;
        return entry;
      }),
      Manufacturer: p.di.man,
      ModelName: p.di.mod,
      SerialNumber: p.di.sn,
      SmbiosUuid: toGuid(p.di.sbu),
      LinkId: toGuid(p.di.li),
      LinkIdCreationTimeUtc: unixToIso(p.di.lict),
    },
    DeviceLinkKeyData: {
      DeviceInfoSigningAlgorithm: p.dlkd.sa,
      DeviceInfoSigningKeyName: p.dlkd.skn,
      DeviceInfoSignature: p.dlkd.sig,
      DeviceInfoSignaturePssHashSchemeAlgorithm: p.dlkd.pssAlg,
      DeviceInfoSignaturePssSaltLength: p.dlkd.pssSaltCb,
    },
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(out)));
}

/** Parse + convert in one step. */
export async function scanToDevice(text: string): Promise<ScannedDevice> {
  const p = await parseQr(text);
  return {
    serialNumber: p.di.sn,
    manufacturer: p.di.man,
    model: p.di.mod,
    linkId: toGuid(p.di.li),
    generatedAt: new Date(Number(p.dlict) * 1000),
    deviceLink: toDeviceLink(p),
  };
}

// ---------- helpers ----------

export function toGuid(hex: string): string {
  const h = hex.toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function isUnixSeconds(v: unknown): boolean {
  const n = Number(v);
  return Number.isInteger(n) && n > 1_500_000_000 && n < 4_000_000_000;
}

export function unixToIso(v: string | number): string {
  return new Date(Number(v) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function gunzipToString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new DeviceLinkError("QR data is unexpectedly large.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(all);
}
