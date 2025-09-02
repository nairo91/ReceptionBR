// Gestion du thème clair/sombre
(() => {
  const KEY = 'theme';
  const root = document.documentElement;
  const body = document.body;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    body.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'
      );
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }

  function initialTheme() {
    return (
      localStorage.getItem(KEY) ||
      (window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light')
    );
  }

  function bindToggleIfNeeded() {
    const btn = document.getElementById('themeToggle');
    if (!btn || btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      apply(next);
    });
    btn.dataset.bound = '1';
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply(initialTheme());
    // Premier essai immédiat
    bindToggleIfNeeded();
    // Filet de sécurité si la sidebar est injectée après coup
    const obs = new MutationObserver(() => bindToggleIfNeeded());
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();

