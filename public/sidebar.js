(function () {
  let keyHandler = null;
  /**
   * (Re)render the sidebar when the user is authenticated.
   * - If no user session, clears the holder.
   * - If session exists, injects sidebar.html and wires events.
   */
  async function renderSidebar() {
    const holder = document.getElementById('sidebar-holder');
    if (!holder) return;

    // Check session
    let me = null;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) me = await res.json();
    } catch (_) {}

    if (!me || !me.user) {
      holder.innerHTML = '';
      document.body.classList.remove('with-sidebar', 'menu-open');
      document.getElementById('sidebar-toggle')?.remove();
      document.querySelector('.sidebar-overlay')?.remove();
      if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
      return;
    }

    // Inject sidebar
    const html = await fetch('/sidebar.html', { credentials: 'include' }).then(r => r.text());
    holder.innerHTML = html;
    document.body.classList.add('with-sidebar');

    // Fill user email
    const span = holder.querySelector('#sidebar-user');
    if (span) span.textContent = me.user.email || '—';

    // Wire logout button inside the sidebar
    holder.querySelector('#sidebar-logout')?.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } finally {
        // Clear sidebar and reload to go back to login
        holder.innerHTML = '';
        document.body.classList.remove('with-sidebar', 'menu-open');
        document.getElementById('sidebar-toggle')?.remove();
        document.querySelector('.sidebar-overlay')?.remove();
        if (keyHandler) {
          document.removeEventListener('keydown', keyHandler);
          keyHandler = null;
        }
        location.reload();
      }
    });

    // Create overlay and burger toggle for opening/closing sidebar
    const sidebar = holder.querySelector('.sidebar');
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    let toggle = document.getElementById('sidebar-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'sidebar-toggle';
      toggle.textContent = '☰';
      document.body.appendChild(toggle);
    }
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
    toggle.setAttribute('aria-expanded', 'false');

    function openSidebar() {
      sidebar.classList.add('open');
      overlay.classList.add('show');
      document.body.classList.add('menu-open');
      toggle.setAttribute('aria-expanded', 'true');
    }
    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
      document.body.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.onclick = () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    overlay.onclick = closeSidebar;

    // Close with Escape
    keyHandler = (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        closeSidebar();
        if (typeof toggle.focus === 'function') toggle.focus();
      }
    };
    document.addEventListener('keydown', keyHandler);

  }

  // Expose globally so pages can call it after login
  window.renderSidebar = renderSidebar;

  // First render on load (will show nothing if not logged in)
  document.addEventListener('DOMContentLoaded', renderSidebar);
})();

