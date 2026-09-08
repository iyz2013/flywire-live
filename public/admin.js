const $ = id => document.getElementById(id);
async function request(path, data) {
  const response = await fetch('/api/admin/' + path, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) show(false);
    throw new Error(result.error || 'Request failed. Please try again.');
  }
  return result;
}
function show(authenticated, config) {
  $('login').hidden = authenticated; $('settings').hidden = !authenticated;
  if (config) $('ca').value = config.homeToken;
  $('password').value = '';
}
for (const [id, action] of [['login', async () => { const config = await request('login', { password: $('password').value }); show(true, config); $('status').textContent = ''; }], ['settings', async () => { const config = await request('settings', { homeToken: $('ca').value.trim() }); show(true, config); $('status').textContent = 'Saved. The home room and pinned coin are updated. Open home rooms switch within 10 seconds.'; }]]) {
  $(id).onsubmit = async event => {
    event.preventDefault(); const button = $(id).querySelector('button'); button.disabled = true;
    try { await action(); } catch (error) { $('status').textContent = error.message; } finally { button.disabled = false; }
  };
}
$('logout').onclick = async () => { try { await request('logout', {}); show(false); $('status').textContent = 'Signed out.'; } catch (error) { $('status').textContent = error.message; } };
request('session').then(config => show(true, config)).catch(() => show(false));
