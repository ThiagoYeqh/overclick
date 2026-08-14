/** Inline SVG logos for the CLIs (offline, faithful to the approved mockup). Server-safe. */
export function CliLogo({ id }: { id: string }) {
  switch (id) {
    case "claude-code":
      return (
        <svg viewBox="0 0 24 24">
          <g stroke="#D97757" strokeWidth="2" strokeLinecap="round">
            {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((a) => (
              <line key={a} x1="12" y1="4.5" x2="12" y2="8.6" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
        </svg>
      );
    case "gemini-cli":
      return (
        <svg viewBox="0 0 24 24">
          <defs>
            <linearGradient id="lg-gem" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#E491F2" />
              <stop offset=".5" stopColor="#8B7CF6" />
              <stop offset="1" stopColor="#3E8FF7" />
            </linearGradient>
          </defs>
          <path fill="url(#lg-gem)" d="M12 2.6c.55 4.6 2.8 6.9 7.4 7.4l2 .3-2 .3c-4.6.55-6.85 2.8-7.4 7.4l-.3 2-.3-2c-.55-4.6-2.8-6.85-7.4-7.4l-2-.3 2-.3c4.6-.55 6.85-2.8 7.4-7.4l.3-2z" />
          <circle cx="20.3" cy="12" r="1.35" fill="#F7D154" />
        </svg>
      );
    case "codex":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#46A08C" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="7.8" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(15 12 7.8)" />
          <circle cx="15.6" cy="9.9" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(75 15.6 9.9)" />
          <circle cx="15.6" cy="14.1" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(135 15.6 14.1)" />
          <circle cx="12" cy="16.2" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(195 12 16.2)" />
          <circle cx="8.4" cy="14.1" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(255 8.4 14.1)" />
          <circle cx="8.4" cy="9.9" r="4.5" strokeDasharray="20.5 7.8" transform="rotate(315 8.4 9.9)" />
        </svg>
      );
    case "kimi":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M7.6 4.6v14.8M15.8 4.6L8.2 12l7.9 7.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="16.4" y="3.8" width="2.5" height="2.5" rx="0.6" fill="#4C8DFF" transform="rotate(14 17.6 5)" />
        </svg>
      );
    case "antigravity":
      return (
        <svg viewBox="0 0 24 24">
          <defs>
            <linearGradient id="lg-ag" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6EA8FF" />
              <stop offset="1" stopColor="#3B6FF0" />
            </linearGradient>
          </defs>
          <path d="M5.2 19.4C7 12.2 8.8 5.6 12 5.6s5 6.6 6.8 13.8" fill="none" stroke="url(#lg-ag)" strokeWidth="3.1" strokeLinecap="round" />
        </svg>
      );
    case "cursor":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 3.6l7.4 4.25v8.3L12 20.4l-7.4-4.25v-8.3z" />
          <path d="M12 12l7.4-4.15M12 12L4.6 7.85M12 12v8.4" />
        </svg>
      );
    case "github-copilot":
      return (
        <svg viewBox="0 0 24 24">
          <path fill="#fff" d="M12 6.1c-3.2 0-5.7 2.3-5.7 5.1 0 2.5 1.8 4.3 4.4 4.7.3.1.4-.1.4-.3v-1.1c-1.8.2-2.2-.8-2.2-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.7.1 1 .7 1 .7.6 1 1.6.7 2 .5.1-.4.2-.8.4-.9-1.5-.2-3-.8-3-3 0-.7.2-1.2.6-1.7-.1-.1-.3-.8.1-1.6 0 0 .5-.2 1.7.7.5-.1 1-.2 1.5-.2s1 .1 1.5.2c1.2-.9 1.7-.7 1.7-.7.4.8.2 1.5.1 1.6.4.5.6 1 .6 1.7 0 2.2-1.5 2.8-3 3 .2.2.4.6.4 1.3v1.8c0 .2.1.4.4.3 2.6-.4 4.4-2.2 4.4-4.7 0-2.8-2.5-5.1-5.7-5.1z" />
        </svg>
      );
    case "grok":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff">
          <circle cx="12" cy="12" r="7.6" strokeWidth="1.7" />
          <path d="M6.4 17.6L17.6 6.4" strokeWidth="2.4" />
        </svg>
      );
    case "opencode":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="5.6" y="5.6" width="12.8" height="12.8" fill="none" stroke="#fff" strokeWidth="2.1" />
          <rect x="9.4" y="10.1" width="4.5" height="4.5" fill="#fff" />
        </svg>
      );
    case "muse-code":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="2.1" strokeLinecap="round">
          <path d="M12 12c-1.1-2.5-2.7-4.1-4.7-4.1-2.3 0-3.8 1.8-3.8 4.1s1.5 4.1 3.8 4.1c2 0 3.6-1.6 4.7-4.1zm0 0c1.1-2.5 2.7-4.1 4.7-4.1 2.3 0 3.8 1.8 3.8 4.1s-1.5 4.1-3.8 4.1c-2 0-3.6-1.6-4.7-4.1z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 4l7 8-7 8-7-8z" />
        </svg>
      );
  }
}
