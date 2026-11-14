/* Hand-drawn-ish line icons, stroke 1.5, currentColor. */
type P = { size?: number; className?: string };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconNetwork = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <rect x="9" y="2.5" width="6" height="4.5" />
    <rect x="2.5" y="16.5" width="5" height="4.5" />
    <rect x="9.5" y="16.5" width="5" height="4.5" />
    <rect x="16.5" y="16.5" width="5" height="4.5" />
    <path d="M12 7v4.5M5 16.5v-3h14v3M12 13.5v3" />
  </svg>
);

export const IconArrow = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const IconRestart = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V9h4.5" />
  </svg>
);
