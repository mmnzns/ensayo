import { useId } from "react";

/** "ensayo" in the sunrise gradient with the drawn sunrise e. One piece with the design's logo; never next to the icon. */
export default function Wordmark({ size = 26 }: { size?: number }) {
  const grad = `egs${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, letterSpacing: "-0.03em", display: "inline-block", lineHeight: 1, fontSize: `${size}px`, whiteSpace: "nowrap" }}>
      <svg viewBox="5 0 54 61" aria-hidden="true" style={{ height: "1.1em", width: "0.975em", verticalAlign: "-0.19em", marginRight: "0.03em", overflow: "visible" }}>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E8603C" />
            <stop offset="1" stopColor="#F2A33A" />
          </linearGradient>
        </defs>
        <g transform="translate(0 5)">
          <path d="M50 40 A20 20 0 1 1 52 31 L14 31" fill="none" strokeLinecap="round" strokeLinejoin="round" stroke={`url(#${grad})`} strokeWidth="6.5" />
        </g>
        <path d="M32 2.5 V8.5 M16.5 8 L20 12.5 M47.5 8 L44 12.5" fill="none" strokeLinecap="round" strokeLinejoin="round" stroke={`url(#${grad})`} strokeWidth="4.5" />
      </svg>
      <span style={{ background: "linear-gradient(135deg, #E8603C 0%, #F2A33A 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>nsayo</span>
    </span>
  );
}
