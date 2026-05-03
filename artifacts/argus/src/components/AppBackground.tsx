import type { CSSProperties } from "react";

/* Each blob gets its own GPU compositing layer via will-change:transform.
   contain:strict prevents layout/paint from spilling to siblings.
   Smaller blur radii (40-48px vs 50-60px) cut fill-rate cost significantly. */
const BLOB: CSSProperties = {
  willChange: "transform",
  contain: "strict",
  position: "absolute",
  borderRadius: "50%",
};

export function AppBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-background" />

      {/* Blob 1 — top-left dominant */}
      <div style={{
        ...BLOB,
        top: "-20%", left: "-15%",
        width: "70vw", height: "70vw",
        maxWidth: 800, maxHeight: 800,
        background: "radial-gradient(ellipse at 40% 40%, hsl(var(--blob-1)) 0%, hsl(var(--blob-1) / 0.55) 45%, transparent 70%)",
        filter: "blur(40px)",
        opacity: 0.9,
        animation: "blob-drift-1 44s ease-in-out infinite",
      }} />

      {/* Blob 2 — right accent */}
      <div style={{
        ...BLOB,
        top: "5%", right: "-18%",
        width: "58vw", height: "58vw",
        maxWidth: 700, maxHeight: 700,
        background: "radial-gradient(ellipse at 55% 45%, hsl(var(--blob-2)) 0%, hsl(var(--blob-2) / 0.45) 48%, transparent 72%)",
        filter: "blur(44px)",
        opacity: 0.82,
        animation: "blob-drift-2 54s ease-in-out infinite",
      }} />

      {/* Blob 3 — bottom-left */}
      <div style={{
        ...BLOB,
        bottom: "-20%", left: "8%",
        width: "52vw", height: "52vw",
        maxWidth: 640, maxHeight: 640,
        background: "radial-gradient(ellipse at 50% 55%, hsl(var(--blob-3)) 0%, hsl(var(--blob-3) / 0.38) 50%, transparent 72%)",
        filter: "blur(48px)",
        opacity: 0.75,
        animation: "blob-drift-3 50s ease-in-out infinite",
      }} />

      {/* Blob 4 — top-right accent (smallest) */}
      <div style={{
        ...BLOB,
        top: "-8%", right: "5%",
        width: "36vw", height: "36vw",
        maxWidth: 440, maxHeight: 440,
        background: "radial-gradient(ellipse at 50% 40%, hsl(var(--blob-4)) 0%, hsl(var(--blob-4) / 0.30) 55%, transparent 78%)",
        filter: "blur(40px)",
        opacity: 0.65,
        animation: "blob-drift-4 60s ease-in-out infinite",
      }} />

      {/* Grain texture */}
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "128px",
        opacity: 0.022,
        mixBlendMode: "overlay",
      }} />
    </div>
  );
}
