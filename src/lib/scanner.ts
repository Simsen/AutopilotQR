import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
// Self-host the WASM (no CDN): Vite emits it as a hashed asset next to the app.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
});

const OPTIONS: ReaderOptions = {
  formats: ["QRCode"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
};

/** Decode a QR code from a camera frame or a photo. Returns the raw text or null. */
export async function decode(input: ImageData | Blob): Promise<string | null> {
  const results = await readBarcodes(input, OPTIONS);
  const hit = results.find((r) => r.isValid && r.text);
  return hit ? hit.text : null;
}
