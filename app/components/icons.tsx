/** Small inline icon set — no runtime dependency, no extra network request. */
type P = { className?: string };

export const Search = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const Close = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const Plus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M12 7.5v9M7.5 12h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const Download = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M8 2v8m0 0L5 7m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 11.5v1a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Trash = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Eye = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const ArrowLeft = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M13 8H3.5M7 3.5L2.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Send = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M2.5 8L13.5 2.5 11 13.5 7.6 9.4 2.5 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.6 9.4L13.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Reply = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M6 3.5L2.5 7 6 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 7h6a5 5 0 015 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const Compose = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <path d="M7 2.5H4a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 004 13.5h8a1.5 1.5 0 001.5-1.5V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M11.8 2.2a1.2 1.2 0 011.7 1.7L8.3 9.1l-2.3.6.6-2.3 5.2-5.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const Chat = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v9a1.5 1.5 0 01-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 014 14.5v-9z"
      stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const Question = ({ className }: P) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M6.3 6.3a1.8 1.8 0 113 1.4c-.7.4-1.3.8-1.3 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.3" r=".8" fill="currentColor" />
  </svg>
);
