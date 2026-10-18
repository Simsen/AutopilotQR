import { useEffect, useState } from "react";

/** QR code with this app's URL, generated locally (no third-party service). */
export function OpenOnPhone() {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const [cells, setCells] = useState<boolean[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      const grid = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
      if (!cancelled) setCells(grid);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const n = cells?.length ?? 0;
  const q = 4; // quiet zone
  return (
    <div className="phone-qr">
      <div className="qr-frame">
        {cells ? (
          <svg viewBox={`0 0 ${n + 2 * q} ${n + 2 * q}`} role="img" aria-label={`QR code linking to ${url}`} shapeRendering="crispEdges">
            <rect width="100%" height="100%" fill="#fff" />
            {cells.flatMap((row, r) =>
              row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c + q} y={r + q} width="1" height="1" fill="#000" /> : null)),
            )}
          </svg>
        ) : (
          <div className="qr-placeholder" />
        )}
      </div>
      <p className="small muted">
        Scan with your phone's camera to open this page there.
        <br />
        <span className="mono">{url.replace(/^https?:\/\//, "")}</span>
      </p>
    </div>
  );
}
