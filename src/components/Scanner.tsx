import { useEffect, useRef, useState } from "react";
import { decode } from "../lib/scanner";

interface Props {
  onText: (text: string) => void;
  paused: boolean;
}

type CamState = "starting" | "live" | "denied" | "unavailable";

/**
 * Continuous camera scan + "take a photo" fallback. The OOBE QR is dense (~1.3 KB),
 * so we ask for a high-resolution stream and crop to a centre square before decoding.
 */
export function Scanner({ onText, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState<CamState>("starting");
  const [busy, setBusy] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const lastRef = useRef({ text: "", at: 0 });
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (e) {
        setCam(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setCam("live");
      loop();
    }

    async function loop() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!pausedRef.current && video && canvas && video.videoWidth > 0) {
        const side = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - side) / 2;
        const sy = (video.videoHeight - side) / 2;
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, sx, sy, side, side, 0, 0, side, side);
        try {
          const text = await decode(ctx.getImageData(0, 0, side, side));
          const now = Date.now();
          // Same code seen again within 3 s: ignore (avoids re-render storms on an unsupported QR).
          if (text && !pausedRef.current && !(text === lastRef.current.text && now - lastRef.current.at < 3000)) {
            lastRef.current = { text, at: now };
            onTextRef.current(text);
          }
        } catch {
          /* decoder hiccup — keep scanning */
        }
      }
      timer = window.setTimeout(loop, 200);
    }

    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await decode(file);
      onText(text ?? "__NO_QR__");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scanner">
      <div className="viewport">
        <video ref={videoRef} playsInline muted />
        <div className="guide" aria-hidden="true" />
        {cam === "starting" && <div className="overlay">Starting camera…</div>}
        {cam === "denied" && <div className="overlay">Camera access was denied. Allow it in your browser settings, or take a photo instead.</div>}
        {cam === "unavailable" && <div className="overlay">No camera available. Take or choose a photo of the QR code instead.</div>}
      </div>
      <canvas ref={canvasRef} hidden />
      <p className="hint">Hold the QR code on the device screen inside the frame. Fill the frame and avoid glare.</p>
      <label className="btn secondary">
        {busy ? "Reading photo…" : "Take or choose a photo"}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
      </label>
    </div>
  );
}
