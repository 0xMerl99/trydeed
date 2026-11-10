import type { SVGProps } from "react";

/** Minimal line-icon set (24px grid, 1.8 stroke). Decorative by default — pass `aria-label` to expose one. */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});

export const SearchIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const MenuIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const CloseIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>);
export const HeartIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 20s-7-4.4-9-8.6C1.6 8.5 3.4 5 6.8 5c2 0 3.3 1.1 4.2 2.4C11.9 6.1 13.2 5 15.2 5c3.4 0 5.2 3.5 3.8 6.4C19 15.6 12 20 12 20z" /></svg>);
export const ClockIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const TrophyIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4v2a3 3 0 0 0 3 3M16 6h4v2a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" /></svg>);
export const RocketIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 15c-1 1-1.5 3.5-1.5 5 1.5 0 4-.5 5-1.5M14 4c3.5-.5 6 0 6 0s.5 2.5 0 6l-6 6-6-6 6-6zM9.5 14.5 7 17M13 8.5h.01" /></svg>);
export const GavelIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m14 5 5 5M10 9l5 5M7.5 11.5l5 5M3 21h9M13 7l-3 3M18 12l-3 3" /></svg>);
export const ArrowRightIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const ArrowLeftIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const ExternalIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
export const CopyIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>);
export const CheckIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const BellIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17zM10 21a2 2 0 0 0 4 0" /></svg>);
export const WalletIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01" /></svg>);
export const InfoIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const CoinIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>);
export const TrendUpIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M4 16 10 10l4 4 6-7M15 7h5v5" /></svg>);
export const ShieldIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3zM9 12l2 2 4-4" /></svg>);
export const ChevronDownIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="m6 9 6 6 6-6" /></svg>);
export const UploadIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>);
export const LinkIcon = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></svg>);
/** The X logo (filled). */
export const XIcon = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
