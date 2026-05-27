"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase =
  | { kind: "idle" }
  | { kind: "denied"; reason: string }
  | { kind: "ready" }
  | { kind: "analyzing" }
  | { kind: "result"; isCroissant: boolean; label: string }
  | { kind: "paywall" }
  | { kind: "error"; message: string };

type CameraAppProps = {
  initialCount: number;
  paid: boolean;
  freeLimit: number;
};

export default function CameraApp({ initialCount, paid, freeLimit }: CameraAppProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [count, setCount] = useState(initialCount);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase({ kind: "ready" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Camera unavailable";
      setPhase({ kind: "denied", reason });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) setPhase({ kind: "ready" });
      } catch (err) {
        if (!cancelled) {
          const reason = err instanceof Error ? err.message : "Camera unavailable";
          setPhase({ kind: "denied", reason });
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = useCallback(async () => {
    if (!paid && count >= freeLimit) {
      setPhase({ kind: "paywall" });
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setCapturedImage(dataUrl);
    setPhase({ kind: "analyzing" });
    try {
      const resp = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await resp.json();
      if (resp.status === 402 && data.paywall) {
        if (typeof data.count === "number") setCount(data.count);
        setPhase({ kind: "paywall" });
        return;
      }
      if (!data.success) {
        setPhase({ kind: "error", message: data.error ?? "Unknown error" });
        return;
      }
      if (typeof data.count === "number") setCount(data.count);
      setPhase({ kind: "result", isCroissant: data.isCroissant, label: data.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setPhase({ kind: "error", message });
    }
  }, [count, freeLimit, paid]);

  const retake = useCallback(() => {
    setCapturedImage(null);
    if (!paid && count >= freeLimit) {
      setPhase({ kind: "paywall" });
      return;
    }
    setPhase({ kind: "ready" });
  }, [count, freeLimit, paid]);

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true);
    try {
      const resp = await fetch("/api/checkout", { method: "POST" });
      const data = await resp.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setPhase({ kind: "error", message: data.error ?? "Checkout failed" });
        setCheckoutLoading(false);
      }
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
      setCheckoutLoading(false);
    }
  }, []);

  const remaining = paid ? null : Math.max(0, freeLimit - count);

  return (
    <>
      <div className="px-5 py-2 text-xs text-zinc-400 border-b border-zinc-900 flex items-center justify-between">
        <span>Photos: {count}</span>
        <span>
          {paid ? (
            <span className="text-amber-400">Unlimited ✦</span>
          ) : (
            <>
              <span className={remaining === 0 ? "text-red-400" : ""}>{remaining}</span> of {freeLimit} free left
            </>
          )}
        </span>
      </div>

      <main className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        {capturedImage && (
          <img
            src={capturedImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />

        {phase.kind === "denied" && (
          <div className="relative z-10 max-w-sm text-center px-6">
            <p className="text-lg font-semibold">Camera access denied</p>
            <p className="mt-2 text-sm text-zinc-400">{phase.reason}</p>
            <button
              onClick={startCamera}
              className="mt-6 px-5 py-2 rounded-full bg-white text-black font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {phase.kind === "analyzing" && (
          <div className="spinner-wrap">
            <div className="spinner">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <span className="label">Evaluating...</span>
          </div>
        )}

        {phase.kind === "result" && phase.isCroissant && (
            <div className="result-banner success">
              <div className="result-label">Croissant</div>
              <div className="result-circle">
                <img src="check.svg" className="h-8 w-8" />
              </div>
            </div>
        )}

        {phase.kind === "result" && !phase.isCroissant && (
            <div className="result-banner failed">
              <div className="result-label">Not croissant</div>
              <div className="result-circle">
                <img src="cross.svg" className="h-8 w-8" />
              </div>
            </div>
        {phase.kind === "result" && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center z-10 ${
              phase.isCroissant ? "bg-green-600/95" : "bg-red-600/95"
            }`}
          >
            <p className="text-5xl sm:text-7xl font-black tracking-tight text-center px-4">
              {phase.isCroissant ? "CROISSANT" : "NOT CROISSANT"}
            </p>
          </div>
        )}

        {phase.kind === "paywall" && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 px-6 text-center">
            <p className="text-3xl font-black tracking-tight">
              You&apos;ve used your <span className="text-amber-400">{freeLimit} free</span> photos
            </p>
            <p className="mt-3 text-sm text-zinc-400 max-w-xs">
              Unlock unlimited croissant detection for a one-time payment.
            </p>
            <button
              onClick={startCheckout}
              disabled={checkoutLoading}
              className="mt-8 px-8 py-3 rounded-full bg-amber-400 text-black font-bold disabled:opacity-50"
            >
              {checkoutLoading ? "Loading…" : "Unlock for $1"}
            </button>
            <button
              onClick={() => setPhase({ kind: "ready" })}
              className="mt-4 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Not now
            </button>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 px-6 text-center">
            <p className="text-lg font-semibold">Something went wrong</p>
            <p className="mt-2 text-sm text-zinc-400">{phase.message}</p>
            <button
              onClick={retake}
              className="mt-6 px-5 py-2 rounded-full bg-white text-black font-medium"
            >
              Try again
            </button>
          </div>
        )}
      </main>

      <footer className="px-5 py-6 border-t border-zinc-800 flex items-center justify-center">
        {(phase.kind === "ready" || phase.kind === "idle") && (
          <button
            onClick={capture}
            disabled={phase.kind !== "ready"}
            className="w-20 h-20 rounded-full bg-white border-4 border-zinc-300 active:scale-95 transition disabled:opacity-40"
            aria-label="Take photo"
          />
        )}
        {(phase.kind === "result" || phase.kind === "error") && (
          <button
            onClick={retake}
            className="px-8 py-3 rounded-full bg-white text-black font-semibold"
          >
            Retake
          </button>
        )}
        {phase.kind === "analyzing" && (
          <div className="w-20 h-20 rounded-full bg-zinc-700 animate-pulse" />
        )}
        {phase.kind === "paywall" && (
          <div className="w-20 h-20" />
        )}
      </footer>
    </>
  );
}
