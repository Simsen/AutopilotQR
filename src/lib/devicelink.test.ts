import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeviceLinkError, looksLikeDeviceLink, parseQr, scanToDevice, toDeviceLink, toGuid, unixToIso, type QrPayload } from "./devicelink";

// ---- synthetic fixture (no real device data in the repo) ----
const SAMPLE: QrPayload = {
  ver: "1.0",
  dlict: "1792213878",
  di: {
    kl: [
      { kn: "EK_1", id: "00112233445566778899AABBCCDDEEFF", kt: 1 },
      { kn: "IDK_1", id: "FFEEDDCCBBAA99887766554433221100", kt: 2, kp: "UlNBMQAIAAADAAAAAAEAAA==" },
    ],
    man: "CONTOSO",
    mod: "Model 1",
    sn: "SN12345",
    sbu: "0123456789ABCDEF0123456789ABCDEF",
    li: "AABBCCDDEEFF00112233445566778899",
    lict: "1792210217",
  },
  dlkd: { sa: "RSA2048-SHA256", skn: "IDK_1", sig: "c2lnbmF0dXJl", pssAlg: "SHA256", pssSaltCb: 222 },
};

async function gzipBase64(s: string): Promise<string> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return Buffer.from(buf).toString("base64");
}

async function makeQr(p: unknown, sn = "SN12345", scheme = "devicelink"): Promise<string> {
  const data = encodeURIComponent(await gzipBase64(JSON.stringify(p)));
  return `${scheme}:/1/?sn=${sn}&data=${data}`;
}

describe("helpers", () => {
  it("formats GUIDs uppercase 8-4-4-4-12", () => {
    expect(toGuid("7abadd81f0e14796906e75f83caa27d5")).toBe("7ABADD81-F0E1-4796-906E-75F83CAA27D5");
  });
  it("formats unix seconds as ISO without millis", () => {
    expect(unixToIso("1792210217")).toBe("2026-10-17T04:10:17Z");
  });
  it("detects the scheme case-insensitively", () => {
    expect(looksLikeDeviceLink("deviceLink:/1/?sn=x&data=y")).toBe(true);
    expect(looksLikeDeviceLink("https://example.com")).toBe(false);
  });
});

describe("parseQr + toDeviceLink (synthetic)", () => {
  it("round-trips to the long-key Windows export shape in the right key order", async () => {
    const dev = await scanToDevice(await makeQr(SAMPLE));
    expect(dev.serialNumber).toBe("SN12345");
    expect(dev.linkId).toBe("AABBCCDD-EEFF-0011-2233-445566778899");
    const json = Buffer.from(dev.deviceLink, "base64").toString("utf8");
    expect(json.startsWith('{"Version":"1.0","DeviceLinkCreationTimeUtc":"2026-10-17T05:11:18Z","DeviceInfo":{"DeviceIdKeyList":[')).toBe(true);
    const o = JSON.parse(json);
    expect(Object.keys(o.DeviceInfo)).toEqual(["DeviceIdKeyList", "Manufacturer", "ModelName", "SerialNumber", "SmbiosUuid", "LinkId", "LinkIdCreationTimeUtc"]);
    expect(o.DeviceInfo.DeviceIdKeyList[0]).toEqual({ KeyName: "EK_1", KeyId: "00112233-4455-6677-8899-AABBCCDDEEFF", KeyType: 1 });
    expect(o.DeviceInfo.DeviceIdKeyList[1].KeyPub).toBe("UlNBMQAIAAADAAAAAAEAAA==");
    expect(o.DeviceLinkKeyData.DeviceInfoSignaturePssSaltLength).toBe(222);
  });

  it("accepts the uppercase deviceLink: scheme seen on real devices", async () => {
    await expect(parseQr(await makeQr(SAMPLE, "SN12345", "deviceLink"))).resolves.toBeTruthy();
  });

  it("does not turn a literal + into a space", async () => {
    // A raw '+' must survive (URLSearchParams would corrupt it).
    const b64 = await gzipBase64(JSON.stringify(SAMPLE));
    await expect(parseQr(`devicelink:/1/?sn=SN12345&data=${b64}`)).resolves.toBeTruthy();
  });

  const reject = async (qr: string, msg: RegExp) => {
    await expect(parseQr(qr)).rejects.toThrow(DeviceLinkError);
    await expect(parseQr(qr)).rejects.toThrow(msg);
  };

  it("rejects non-devicelink QR codes", () => reject("https://contoso.com", /not a Windows device association/));
  it("rejects serial mismatch", async () => reject(await makeQr(SAMPLE, "OTHER"), /serial number mismatch/));
  it("rejects wrong version", async () => reject(await makeQr({ ...SAMPLE, ver: "2.0" }), /version/));
  it("rejects missing signing key", async () =>
    reject(await makeQr({ ...SAMPLE, dlkd: { ...SAMPLE.dlkd, skn: "NOPE" } }), /signing key/));
  it("rejects malformed link id", async () => reject(await makeQr({ ...SAMPLE, di: { ...SAMPLE.di, li: "xyz" } }), /link ID/));
  it("rejects non-gzip data", () => reject("devicelink:/1/?sn=SN12345&data=aGVsbG8=", /decompress/));
  it("rejects oversize input", () => reject("devicelink:/1/?" + "a".repeat(5000), /too large/));
});

// ---- golden test against the real payload that Intune accepted (201 → associated) ----
// Lives in fixtures-private/ (gitignored). Skipped in CI / public clones.
const priv = resolve(__dirname, "../../fixtures-private");
const goldenQr = resolve(priv, "thinkbook.qr.txt");
const goldenOut = resolve(priv, "thinkbook.expected-devicelink.txt");

describe.skipIf(!existsSync(goldenQr))("golden: real device accepted by Intune", () => {
  it("produces byte-identical deviceLink", async () => {
    const dev = await scanToDevice(readFileSync(goldenQr, "utf8"));
    expect(dev.deviceLink).toBe(readFileSync(goldenOut, "utf8").trim());
  });

  it("parses the other lab QR codes", async () => {
    for (const f of ["t480.qr.txt", "t480-26h2.qr.txt"]) {
      const p = resolve(priv, f);
      if (existsSync(p)) await expect(parseQr(readFileSync(p, "utf8"))).resolves.toBeTruthy();
    }
  });

  it("toDeviceLink is deterministic", async () => {
    const p = await parseQr(readFileSync(goldenQr, "utf8"));
    expect(toDeviceLink(p)).toBe(toDeviceLink(p));
  });
});
