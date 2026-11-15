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

export const IconFolder = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2.2h8.5A1.5 1.5 0 0 1 21 9.8v7.7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);

export const IconGitBranch = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <circle cx="6.5" cy="5.5" r="2" />
    <circle cx="6.5" cy="18.5" r="2" />
    <circle cx="17.5" cy="9.5" r="2" />
    <path d="M6.5 7.5v9M17.5 11.5c0 3.2-3 3.5-6.2 4.6" />
  </svg>
);

export const IconCheck = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />
  </svg>
);

export const IconClose = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconSpark = ({ size, className }: P) => (
  <svg {...base(size)} className={className} aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
  </svg>
);
