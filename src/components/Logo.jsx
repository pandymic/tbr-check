import React from 'react';

// Mark: a countdown ring (time until release) around a check. Same artwork as public/favicon.svg.
export const LogoMark = ( { size = 32 } ) => (
  <svg className="logo-mark" width={ size } height={ size } viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#D52B1E" />
    <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeDasharray="98 27.66" />
    <path d="M22.5 32.5 29.5 39.5 43 25" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Logo = () => (
  <a className="logo" href="?" title="TBR Check — upcoming .ca releases">
    <LogoMark />
    <span className="wordmark"><b>TBR</b> Check</span>
    <span className="tagline">Upcoming .ca releases</span>
  </a>
);

export default Logo;
