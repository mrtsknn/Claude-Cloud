/** Inline SVG icons (no emoji: they render differently on every OS). */
const svg = (body: string, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICON = {
  honey: svg('<path d="M12 3c3 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 3-6.5 6-11z" fill="#ffc83d" stroke="#b57d10" stroke-width="1.8"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><path d="M12 8v8" stroke="#b57d10" stroke-width="2"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  gift: svg('<rect x="4" y="10" width="16" height="10" rx="2" fill="#ff6b8b"/><rect x="3" y="7" width="18" height="4" rx="1.5" fill="#ff8fa6"/><path d="M12 7v13" stroke="#fff2b0" stroke-width="3"/><path d="M12 7c-2-4-6-3-5-1s5 1 5 1c0 0 4 1 5-1s-3-3-5 1z" fill="#fff2b0" stroke="none"/>'),
  share: svg('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" fill="none" stroke="currentColor" stroke-width="2.4"/>'),
  flag: svg('<path d="M6 21V4" stroke="currentColor" stroke-width="2.4"/><path d="M6 4.5h11l-2.5 4 2.5 4H6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2"/>'),
};

/** World picker icons. */
export const WORLD_ICON: Record<string, string> = {
  meadow: svg('<path d="M12 21v-7" stroke="#3f8f3a" stroke-width="2.4"/><path d="M12 15c-3 0-5-2-5-4 2 0 4 1 5 4z" fill="#5dbb4e" stroke="none"/><circle cx="12" cy="8" r="2.4" fill="#ffd23f" stroke="none"/><g fill="#ff7aa8" stroke="none"><circle cx="12" cy="4.2" r="2.2"/><circle cx="15.6" cy="7" r="2.2"/><circle cx="14.3" cy="11" r="2.2"/><circle cx="9.7" cy="11" r="2.2"/><circle cx="8.4" cy="7" r="2.2"/></g><circle cx="12" cy="8" r="2" fill="#ffd23f" stroke="none"/>'),
  orchard: svg('<path d="M12 21v-6" stroke="#8a5a2b" stroke-width="2.6"/><circle cx="12" cy="10" r="7" fill="#5dbb4e" stroke="none"/><g fill="#ff4d4d" stroke="none"><circle cx="9" cy="9" r="1.6"/><circle cx="14.5" cy="8" r="1.6"/><circle cx="13" cy="12.5" r="1.6"/></g>'),
  forest: svg('<path d="M12 2.5l6.5 9h-3l4 6h-15l4-6h-3z" fill="#2f8f5b" stroke="none"/><path d="M12 17.5V22" stroke="#8a5a2b" stroke-width="2.6"/>'),
  mountain: svg('<path d="M2 20l7-12 4 6 3-4 6 10z" fill="#7a86b8" stroke="none"/><path d="M9 8l2.2 3.8-1.6-.8-1.2 1.2-1.3-1.1-.9.6z" fill="#fff" stroke="none"/>'),
};
