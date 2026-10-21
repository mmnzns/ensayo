import type { ReactNode } from "react";

function Svg({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const HomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Svg>
);
export const StoriesIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2z" />
    <path d="M6 21h13" />
  </Svg>
);
export const ApplicationsIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </Svg>
);
export const ProgressIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 20V11" />
    <path d="M12 20V4" />
    <path d="M19 20v-6" />
  </Svg>
);
export const SettingsIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Svg>
);
export const FeedbackIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    <path d="M8.5 11h7M8.5 14.5h4" />
  </Svg>
);
