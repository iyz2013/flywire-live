const expand = 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5';
const collapse = 'M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5';
let expandedPane = null;

for (const pane of document.querySelectorAll('.pane')) {
  const head = pane.querySelector('.pane-head');
  const name = head.querySelector('h2').textContent;
  const actions = document.createElement('div');
  actions.className = 'pane-head-actions';
  actions.append(head.querySelector('.subtle'));
  const button = document.createElement('button');
  button.className = 'fullscreen-button';
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path/></svg>';
  const sync = () => {
    const active = document.fullscreenElement === pane || expandedPane === pane;
    const label = active ? `Exit ${name.toLowerCase()} fullscreen` : `Fullscreen ${name.toLowerCase()}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('path').setAttribute('d', active ? collapse : expand);
  };
  button.onclick = async () => {
    if (expandedPane === pane) {
      pane.classList.remove('pane-expanded');
      document.body.classList.remove('has-expanded-pane');
      expandedPane = null;
    } else if (document.fullscreenElement === pane) {
      await document.exitFullscreen();
    } else {
      try {
        if (!document.fullscreenEnabled) throw new Error('Fullscreen unavailable');
        await pane.requestFullscreen();
        if (document.fullscreenElement !== pane) throw new Error('Fullscreen unavailable');
      } catch {
        // Embedded browsers may deny native fullscreen; retain an in-page view.
        expandedPane = pane;
        pane.classList.add('pane-expanded');
        document.body.classList.add('has-expanded-pane');
      }
    }
    sync();
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expandedPane === pane) {
      pane.classList.remove('pane-expanded');
      document.body.classList.remove('has-expanded-pane');
      expandedPane = null;
      sync();
      button.focus();
    }
  });
  actions.append(button);
  head.append(actions);
  sync();
}
