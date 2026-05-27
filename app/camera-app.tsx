"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase =
  | { kind: "idle" }
  | { kind: "denied"; reason: string }
  | { kind: "ready" }
  | { kind: "analyzing" }
  | { kind: "result"; isCroissant: boolean; label: string }
  | { kind: "error"; message: string };

export default function CameraApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
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
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera]);

  const capture = useCallback(async () => {
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
      if (!data.success) {
        setPhase({ kind: "error", message: data.error ?? "Unknown error" });
        return;
      }
      setPhase({ kind: "result", isCroissant: data.isCroissant, label: data.label });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setPhase({ kind: "error", message });
    }
  }, []);

  const retake = useCallback(() => {
    setCapturedImage(null);
    setPhase({ kind: "ready" });
  }, []);

  return (
    <>
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
      </footer>
    </>
  );
}
