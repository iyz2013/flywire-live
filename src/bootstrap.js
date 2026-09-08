import './observatory.css';
async function start() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Settings unavailable');
    window.__siteConfig = await response.json();
    document.getElementById('notice').hidden = true;
    await import('./observatory.js');
  } catch {
    const notice = document.getElementById('notice');
    notice.hidden = false;
    notice.textContent = 'Connecting to the live room…';
    setTimeout(start, 3000);
  }
}
void start();
