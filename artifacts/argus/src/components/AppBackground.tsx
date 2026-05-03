import type { CSSProperties } from "react";

const BLOB_STYLE: CSSProperties = {
  willChange: "transform",
  contain: "layout style paint",
};

export function AppBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Base background fill */}
      <div className="absolute inset-0 bg-background" />

      {/* ── Blob 1 — dominant, top-left ── */}
      <div
        className="absolute rounded-full"
        style={{
          ...BLOB_STYLE,
          top: "-30%",
          left: "-25%",
          width: "80vw",
          height: "80vw",
          maxWidth: 960,
          maxHeight: 960,
          background: "radial-gradient(ellipse at 40% 40%, hsl(var(--blob-1)) 0%, hsl(var(--blob-1) / 0.6) 40%, transparent 70%)",
          filter: "blur(50px)",
          animation: "blob-drift-1 42s ease-in-out infinite",
          opacity: 0.95,
        }}
      />

      {/* ── Blob 2 — right accent, warm ── */}
      <div
        className="absolute rounded-full"
        style={{
          ...BLOB_STYLE,
          top: "10%",
          right: "-22%",
          width: "65vw",
          height: "65vw",
          maxWidth: 780,
          maxHeight: 780,
          background: "radial-gradient(ellipse at 55% 45%, hsl(var(--blob-2)) 0%, hsl(var(--blob-2) / 0.5) 45%, transparent 72%)",
          filter: "blur(55px)",
          animation: "blob-drift-2 52s ease-in-out infinite",
          opacity: 0.88,
        }}
      />

      {/* ── Blob 3 — bottom-left deep ── */}
      <div
        className="absolute rounded-full"
        style={{
          ...BLOB_STYLE,
          bottom: "-25%",
          left: "10%",
          width: "60vw",
          height: "60vw",
          maxWidth: 720,
          maxHeight: 720,
          background: "radial-gradient(ellipse at 50% 55%, hsl(var(--blob-3)) 0%, hsl(var(--blob-3) / 0.4) 50%, transparent 72%)",
          filter: "blur(60px)",
          animation: "blob-drift-3 48s ease-in-out infinite",
          opacity: 0.82,
        }}
      />

      {/* ── Blob 4 — top-right accent ── */}
      <div
        className="absolute rounded-full"
        style={{
          ...BLOB_STYLE,
          top: "-12%",
          right: "2%",
          width: "42vw",
          height: "42vw",
          maxWidth: 500,
          maxHeight: 500,
          background: "radial-gradient(ellipse at 50% 40%, hsl(var(--blob-4)) 0%, hsl(var(--blob-4) / 0.35) 55%, transparent 78%)",
          filter: "blur(50px)",
          animation: "blob-drift-4 58s ease-in-out infinite",
          opacity: 0.72,
        }}
      />

      {/* Grain texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px",
          opacity: 0.024,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
