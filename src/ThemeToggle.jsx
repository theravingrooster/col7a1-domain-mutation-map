import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'col7a1-theme';
const OPTIONS = [
  { value: 'light', label: 'Light mode', icon: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></> },
  { value: 'dark', label: 'Dark mode', icon: <path d="M20.7 13.1A8.9 8.9 0 0 1 10.9 3.3 9 9 0 1 0 20.7 13.1Z"/> },
  { value: 'system', label: 'Use system theme', icon: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></> },
];

function initialPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* Theme selection still works when storage is unavailable. */ }
  return 'system';
}

export default function ThemeToggle() {
  const [preference, setPreference] = useState(initialPreference);

  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111b19' : '#f6f7f3');
    };
    apply();
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch { /* Browsing must remain usable when storage is unavailable. */ }
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [preference]);

  return <div className="theme-toggle" role="group" aria-label="Color theme">
    {OPTIONS.map(option => <button key={option.value} type="button" aria-label={option.label} title={option.label} aria-pressed={preference === option.value} onClick={() => setPreference(option.value)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{option.icon}</svg>
    </button>)}
  </div>;
}
