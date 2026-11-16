export function Logo({ large = false, light = true }) {
  const ink = light ? 'text-white' : 'text-ink';
  return (
    <div className={`brand-logo ${ink}`} style={large ? { transform: 'scale(1.35)', transformOrigin: 'left center', marginBottom: '10px' } : undefined}>
      <svg viewBox="0 0 383 418" aria-hidden="true">
        <g fill="currentColor">
          <polygon points="67,0 383,0 320,88 120,88" />
          <polygon points="67,165 383,165 320,253 120,253" />
          <polygon points="67,329 383,329 320,418 125,418" />
        </g>
        <g fill="#7747C7">
          <polygon points="0,88 67,0 120,88" />
          <polygon points="0,253 67,165 120,253" />
          <polygon points="0,418 67,329 125,418" />
        </g>
        <g fill="#532A9B"><polygon points="0,88 120,88 62,163" /><polygon points="0,253 120,253 62,328" /></g>
      </svg>
      <div><b>EXCELLIUM</b><small>GLOBAL SERVICES</small></div>
    </div>
  );
}
