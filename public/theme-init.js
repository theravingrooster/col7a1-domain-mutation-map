// Applied before the stylesheet loads to avoid a flash of the wrong appearance.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('col7a1-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}
  const theme = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111b19' : '#f6f7f3';
})();
