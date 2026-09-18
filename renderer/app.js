const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const catsEl = document.getElementById('cats');
const searchEl = document.getElementById('search');
const categoryEl = document.getElementById('category');
const passwordEl = document.getElementById('password-filter');
const typeEl = document.getElementById('type-filter');
const profileEl = document.getElementById('profile');
const dropEl = document.getElementById('drop');
const progressPanel = document.getElementById('progress-panel');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const progressCount = document.getElementById('progress-count');
const progressDetail = document.getElementById('progress-detail');
const toastEl = document.getElementById('toast');
const addDialog = document.getElementById('add-dialog');
const profilesDialog = document.getElementById('profiles-dialog');
const prefsDialog = document.getElementById('prefs-dialog');
const detailDialog = document.getElementById('detail-dialog');
const aboutDialog = document.getElementById('about-dialog');
const addError = document.getElementById('add-error');

const state = {
  accounts: [],
  profiles: [],
  prefs: {},
  counts: {},
  importing: false,
  search: '',
  category: 'All',
  passwordFilter: 'All',
  typeFilter: 'All',
  profile: 'All Profiles',
};

function prettyAccountName(name) {
  if (!name) return '';
  return String(name)
    .replace(/(_|-)?(logo|menu_item)(_)?(url)?$/i, '')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function colorFor(text) {
  let hash = 0;
  for (const char of String(text || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 38% 36%)`;
}

function formatCode(code) {
  if (!code) return '-';
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 1600);
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  const toggle = document.getElementById('theme-switch');
  if (toggle) toggle.checked = next === 'dark';
}

function uiLocked() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.tagName === 'SELECT' || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') return true;
  return Boolean(active.closest('dialog'));
}

function applyState(next, options = {}) {
  state.accounts = next.accounts || [];
  state.profiles = next.profiles || [];
  state.prefs = next.prefs || {};
  state.counts = next.counts || {};
  state.importing = Boolean(next.importing);
  applyTheme(state.prefs.theme);
  if (!state.importing) hideProgress();
  if (!options.soft || !uiLocked()) renderControls();
  if (options.soft) updateCodesInPlace();
  else render();
}

function showProgress(progress) {
  if (!progressPanel) return;
  progressPanel.hidden = false;
  const phase = progress.phase || 'import';
  if (phase === 'scan') {
    progressPanel.classList.add('indeterminate');
    progressFill.style.width = '32%';
    progressLabel.textContent = progress.label || 'Searching folders…';
    progressCount.textContent = progress.found ? `${progress.found} found` : '';
    progressDetail.textContent = progress.scannedDirs
      ? `${progress.scannedDirs} folders checked`
      : '';
    return;
  }
  progressPanel.classList.remove('indeterminate');
  let percent = 0;
  if (progress.total) {
    const done = progress.working ? progress.index : progress.index;
    const current = progress.working ? Math.max(progress.index, 0) + 0.45 : done;
    percent = Math.min(100, Math.round((current / progress.total) * 100));
  }
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = progress.label || 'Importing…';
  progressCount.textContent = `${percent}%`;
  progressDetail.textContent = [
    progress.total ? `${progress.working ? progress.index + 1 : progress.index} / ${progress.total}` : '',
    progress.profile || '',
    progress.file || '',
    progress.error || '',
  ].filter(Boolean).join(' · ');
}

function hideProgress() {
  if (!progressPanel) return;
  progressPanel.hidden = true;
  progressPanel.classList.remove('indeterminate');
  progressFill.style.width = '0%';
}

function visibleAccounts() {
  const query = state.search.trim().toLowerCase();
  const enabled = new Set((state.prefs.enabled_types || []).map((item) => String(item).toLowerCase()));
  return state.accounts.filter((item) => {
    if (state.category !== 'All' && item.category !== state.category) return false;
    if (state.profile !== 'All Profiles' && item.profile !== state.profile) return false;
    if (state.passwordFilter === 'With Passwords' && !item.related_passwords?.length) return false;
    if (state.passwordFilter === 'Without Passwords' && item.related_passwords?.length) return false;
    const type = String(item.type || 'other').toLowerCase();
    if (state.typeFilter !== 'All' && type !== state.typeFilter.toLowerCase()) return false;
    if (enabled.size && !enabled.has(type) && !enabled.has('other')) return false;
    if (query && !`${item.issuer} ${item.account}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function fillSelect(select, values, current) {
  if (document.activeElement === select) return select.value || current;
  const existing = Array.from(select.options).map((option) => option.value);
  const same = existing.length === values.length && existing.every((value, index) => value === values[index]);
  if (!same) {
    select.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  }
  const next = values.includes(current) ? current : values[0];
  if (select.value !== next) select.value = next;
  return next;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderControls() {
  const categories = ['All', ...Array.from(new Set(state.accounts.map((item) => item.category || 'Other'))).sort()];
  state.category = fillSelect(categoryEl, categories, state.category);
  state.profile = fillSelect(profileEl, ['All Profiles', ...state.profiles], state.profile);
  const types = ['All', ...(state.prefs.enabled_types || ['totp', 'hotp', 'authy', 'authy-asset', 'other'])];
  state.typeFilter = fillSelect(typeEl, types, state.typeFilter);
  dropEl.hidden = state.prefs.enable_dnd_overlay === false;
  document.getElementById('import-btn').disabled = state.importing;
  document.getElementById('scrape-btn').disabled = state.importing;
  const noProfile = !state.profile || state.profile === 'All Profiles';
  const selected = document.getElementById('delete-selected-btn');
  if (selected) selected.disabled = noProfile;
}

function render() {
  const items = visibleAccounts();
  countEl.textContent = state.accounts.length
    ? `${items.length} / ${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`
    : 'No accounts yet';
  statusEl.textContent = state.importing ? 'Importing…' : `${items.length} visible`;
  const countParts = Object.keys(state.counts).sort().map((key) => `${key}: ${state.counts[key]}`);
  catsEl.textContent = countParts.join(' | ') || 'No categories';
  emptyEl.hidden = items.length > 0;
  listEl.innerHTML = '';

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = item.id;
    const title = item.issuer || prettyAccountName(item.account) || 'Account';
    const displayAccount = item.is_asset ? prettyAccountName(item.account) : (item.account || '');
    const ratio = item.period ? item.remaining / item.period : 0;
    const tone = item.type === 'hotp' ? '' : item.remaining <= 5 ? 'hot' : item.remaining <= 10 ? 'warn' : '';
    const remainingLabel = item.type === 'hotp' ? 'HOTP' : item.code === 'ASSET' ? 'asset' : `${item.remaining}s`;
    card.innerHTML = `
      <div class="avatar" style="background:${colorFor(title)}">${escapeHtml(title.slice(0, 1).toUpperCase())}</div>
      <div class="meta">
        <div class="issuer">${escapeHtml(title)}</div>
        <div class="account">${escapeHtml(item.issuer ? displayAccount : '')}</div>
        ${item.site ? `<div class="site" data-site="${item.id}">${escapeHtml(item.site)}</div>` : ''}
        ${item.source_label?.label ? `<div class="source" title="${item.source_label.ancestor ? '' : escapeHtml(item.source_path || '')}">${escapeHtml(item.source_label.label)}</div>` : ''}
        <div class="chips">
          <span class="chip" style="background:${item.category_color}">${escapeHtml(item.category || 'Other')}</span>
          <span class="chip profile">Profile: ${escapeHtml(item.profile || 'Unassigned')}</span>
        </div>
      </div>
      <div class="code-wrap">
        <p class="code">${escapeHtml(formatCode(item.code))}</p>
        <div class="remaining">${escapeHtml(remainingLabel)}</div>
        <div class="timer ${tone}"><span style="width:${Math.max(0, ratio) * 100}%"></span></div>
        <div class="card-actions">
          ${item.is_asset ? `
            <button type="button" data-site="${item.id}">Open asset</button>
            <button type="button" data-raw="${item.id}">View raw</button>
          ` : `
            <button type="button" data-copy="${item.id}">Copy code</button>
            <button type="button" data-login="${item.id}">Copy login</button>
            <button type="button" data-show-login="${item.id}">Show login</button>
            <button type="button" data-site="${item.id}">Open site</button>
          `}
          ${item.password_count ? `<button type="button" data-passwords="${item.id}">Passwords (${item.password_count})</button>` : ''}
          ${item.login_count ? `<button type="button" data-logins="${item.id}">Logins (${item.login_count})</button>` : ''}
          ${item.source_path ? `<button type="button" data-dir="${item.id}">Open dir</button>` : ''}
          <button type="button" class="danger" data-del="${item.id}">Delete</button>
        </div>
      </div>
    `;
    card.addEventListener('click', (event) => handleCardClick(event, item));
    card.addEventListener('contextmenu', (event) => showContextMenu(event, item));
    card.addEventListener('dblclick', async () => {
      if (item.is_asset) await safeCall(() => window.otp.openSite(item.id), 'Opened');
      else {
        await window.otp.copyText(item.account || '');
        toast('Login copied');
      }
    });
    listEl.appendChild(card);
  }
}

function updateCodesInPlace() {
  const items = visibleAccounts();
  const existing = Array.from(listEl.querySelectorAll('.card')).map((card) => card.dataset.id);
  const nextIds = items.map((item) => item.id);
  if (existing.length !== nextIds.length || existing.some((id, index) => id !== nextIds[index])) {
    render();
    return;
  }
  countEl.textContent = state.accounts.length
    ? `${items.length} / ${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`
    : 'No accounts yet';
  statusEl.textContent = state.importing ? 'Importing…' : `${items.length} visible`;
  for (const item of items) {
    const card = listEl.querySelector(`.card[data-id="${item.id}"]`);
    if (!card) continue;
    const codeEl = card.querySelector('.code');
    const remainingEl = card.querySelector('.remaining');
    const timer = card.querySelector('.timer > span');
    const track = card.querySelector('.timer');
    if (codeEl) codeEl.textContent = formatCode(item.code);
    if (remainingEl) {
      remainingEl.textContent = item.type === 'hotp' ? 'HOTP' : item.code === 'ASSET' ? 'asset' : `${item.remaining}s`;
    }
    if (timer && item.period) timer.style.width = `${Math.max(0, item.remaining / item.period) * 100}%`;
    if (track) {
      track.classList.toggle('hot', item.type !== 'hotp' && item.remaining <= 5);
      track.classList.toggle('warn', item.type !== 'hotp' && item.remaining > 5 && item.remaining <= 10);
    }
  }
}

async function handleCardClick(event, item) {
  const target = event.target.closest('button, [data-site]');
  if (!target) {
    if (!item.is_asset) {
      await safeCall(() => window.otp.copyCode(item.id), 'Code copied');
    }
    return;
  }
  event.stopPropagation();
  if (target.dataset.copy) return safeCall(() => window.otp.copyCode(item.id), 'Code copied');
  if (target.dataset.login) {
    await window.otp.copyText(item.account || '');
    return toast('Login copied');
  }
  if (target.dataset.showLogin) return showSiteLogins(item);
  if (target.dataset.site) return safeCall(() => window.otp.openSite(item.id), 'Opened site');
  if (target.dataset.dir) return safeCall(() => window.otp.openDir(item.id), 'Opened folder');
  if (target.dataset.raw) return showRaw(item);
  if (target.dataset.passwords) return showItems('Related passwords', passwordItems(item), true);
  if (target.dataset.logins) return showItems('Logins / credentials', item.pass_file_credentials || []);
  if (target.dataset.del && confirm(`Delete ${item.issuer || item.account || 'this entry'}?`)) {
    applyState(await window.otp.remove(item.id));
  }
}

function passwordItems(item) {
  const seen = new Set();
  return (item.related_passwords || []).filter((entry) => {
    const type = String(entry.type || '').toLowerCase();
    const key = String(entry.key || '').toLowerCase();
    const value = entry.value || '';
    const isPassword = type ? type === 'password' : (key.includes('pass') || key.includes('pwd') || key.includes('secret'));
    if (!isPassword || !value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function showSiteLogins(item) {
  try {
    const found = await window.otp.siteLogins(item.id);
    const pairs = found.pairs.length ? found.pairs : found.unmatched;
    const title = found.pairs.length
      ? `Logins for ${found.issuer || found.account || 'this site'}`
      : found.unmatched.length
        ? `No site match — all logins from password.txt`
        : `Logins for ${found.issuer || found.account || 'this site'}`;
    showLoginPairs(title, pairs);
  } catch (error) {
    toast(String(error.message || error));
  }
}

function showLoginPairs(title, pairs) {
  document.getElementById('detail-title').textContent = title;
  const list = document.getElementById('detail-list');
  const raw = document.getElementById('detail-raw');
  raw.hidden = true;
  list.hidden = false;
  list.innerHTML = '';
  if (!pairs.length) {
    list.innerHTML = '<li>No user/pass found in password.txt or passwords.txt</li>';
    detailDialog.showModal();
    return;
  }
  for (const pair of pairs) {
    const li = document.createElement('li');
    li.className = 'login-pair';
    const user = pair.user || '';
    const password = pair.password || '';
    const url = pair.url || '';
    li.innerHTML = `
      <div class="login-pair-body">
        ${url ? `<div class="login-url">${escapeHtml(url)}</div>` : ''}
        <div>USER: ${escapeHtml(user)}</div>
        <div>PASS: ${escapeHtml(password)}</div>
      </div>
    `;
    const actions = document.createElement('span');
    const copyUser = document.createElement('button');
    copyUser.type = 'button';
    copyUser.textContent = 'Copy user';
    copyUser.addEventListener('click', async () => {
      await window.otp.copyText(user);
      toast('User copied');
    });
    const copyPass = document.createElement('button');
    copyPass.type = 'button';
    copyPass.textContent = 'Copy pass';
    copyPass.addEventListener('click', async () => {
      await window.otp.copyText(password);
      toast('Password copied');
    });
    actions.append(copyUser, copyPass);
    li.appendChild(actions);
    list.appendChild(li);
  }
  detailDialog.showModal();
}

function showItems(title, items, cleartextDefault = false) {
  document.getElementById('detail-title').textContent = title;
  const list = document.getElementById('detail-list');
  const raw = document.getElementById('detail-raw');
  raw.hidden = true;
  list.hidden = false;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li>Nothing found</li>';
  } else {
    for (const item of items) {
      const li = document.createElement('li');
      const shown = state.prefs.show_passwords_cleartext || cleartextDefault ? (item.value || '') : (item.masked || item.value || '');
      li.innerHTML = `<span>${escapeHtml(item.key ? `${item.key}: ${shown}` : shown)}</span>`;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      copy.addEventListener('click', async () => {
        await window.otp.copyText(item.value || '');
        toast('Copied');
      });
      li.appendChild(copy);
      list.appendChild(li);
    }
  }
  detailDialog.showModal();
}

function showRaw(item) {
  document.getElementById('detail-title').textContent = 'Raw payload';
  document.getElementById('detail-list').hidden = true;
  const raw = document.getElementById('detail-raw');
  raw.hidden = false;
  raw.textContent = JSON.stringify(item.raw || {}, null, 2);
  detailDialog.showModal();
}

function showContextMenu(event, item) {
  event.preventDefault();
  document.querySelector('.menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu';
  const actions = item.is_asset
    ? [['Open site', () => window.otp.openSite(item.id)], ['Copy source path', () => window.otp.copyText(item.source_path || '')]]
    : [
      ['Copy code', () => window.otp.copyCode(item.id)],
      ['Copy login', () => window.otp.copyText(item.account || '')],
      ['Show login', () => showSiteLogins(item)],
      ['Copy issuer', () => window.otp.copyText(item.issuer || '')],
      ['Copy URI', () => window.otp.copyUri(item.id)],
      ['Open site', () => window.otp.openSite(item.id)],
    ];
  if (item.source_path) {
    actions.push(['Open directory', () => window.otp.openDir(item.id)]);
    actions.push(['Copy source path', () => window.otp.copyText(item.source_path)]);
  }
  actions.push(['Delete', async () => {
    if (confirm(`Delete ${item.issuer || item.account || 'this entry'}?`)) {
      applyState(await window.otp.remove(item.id));
    }
  }]);
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      menu.remove();
      try {
        await action();
        toast(label);
      } catch (error) {
        toast(String(error.message || error));
      }
    });
    menu.appendChild(button);
  }
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  document.body.appendChild(menu);
  const close = () => {
    menu.remove();
    document.removeEventListener('click', close);
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function safeCall(fn, okMessage) {
  try {
    await fn();
    if (okMessage) toast(okMessage);
  } catch (error) {
    toast(String(error.message || error));
  }
}

function openAddDialog() {
  addError.hidden = true;
  document.getElementById('add-form').reset();
  addDialog.showModal();
}

function renderProfileList() {
  const list = document.getElementById('profile-list');
  list.innerHTML = '';
  for (const name of state.profiles) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(name)}</span>`;
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = 'Rename';
    rename.addEventListener('click', async () => {
      const next = prompt('New profile name', name);
      if (!next || next === name) return;
      applyState(await window.otp.renameProfile(name, next));
      renderProfileList();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (!confirm(`Delete profile ${name} and all of its accounts?`)) return;
      if (state.profile === name) state.profile = 'All Profiles';
      applyState(await window.otp.deleteProfile(name));
      renderProfileList();
      toast(`Deleted ${name}`);
    });
    const wrap = document.createElement('span');
    wrap.append(rename, remove);
    li.appendChild(wrap);
    list.appendChild(li);
  }
}

function openPrefs() {
  const prefs = state.prefs || {};
  document.getElementById('pref-cleartext').checked = Boolean(prefs.show_passwords_cleartext);
  document.getElementById('pref-binary').checked = Boolean(prefs.scan_binary_files);
  document.getElementById('pref-dnd').checked = prefs.enable_dnd_overlay !== false;
  document.getElementById('pref-autoprofile').checked = prefs.auto_add_path_to_profile !== false;
  document.getElementById('pref-validate').checked = prefs.validate_otp !== false;
  document.getElementById('pref-workers').value = Number(prefs.max_import_workers || 4);
  const enabled = new Set(prefs.enabled_types || []);
  for (const box of document.querySelectorAll('.pref-type')) box.checked = enabled.has(box.value);
  prefsDialog.showModal();
}

async function refresh() {
  applyState(await window.otp.getState());
}

async function tick() {
  applyState(await window.otp.getState(), { soft: true });
}

document.getElementById('import-btn').addEventListener('click', async () => {
  showProgress({ phase: 'import', label: 'Opening files…', index: 0, total: 0 });
  applyState(await window.otp.importFiles(state.profile));
});
document.getElementById('scrape-btn').addEventListener('click', async () => {
  showProgress({ phase: 'scan', label: 'Opening folder…' });
  const next = await window.otp.scrape();
  applyState(next);
  if (!next.scrapedFiles) toast('No Auth / 2FA / Authenticator logs found');
  else toast(`Loaded ${next.scrapedFiles} log${next.scrapedFiles === 1 ? '' : 's'} into ${next.scannedProfiles.length} profile${next.scannedProfiles.length === 1 ? '' : 's'}`);
});
document.getElementById('add-btn').addEventListener('click', openAddDialog);
document.getElementById('profiles-btn').addEventListener('click', () => {
  renderProfileList();
  profilesDialog.showModal();
});
document.getElementById('prefs-btn').addEventListener('click', openPrefs);
document.getElementById('clear-btn').addEventListener('click', () => {
  searchEl.value = '';
  state.search = '';
  render();
});
document.getElementById('save-account').addEventListener('click', async () => {
  addError.hidden = true;
  try {
    applyState(await window.otp.add({
      uri: document.getElementById('uri').value.trim(),
      issuer: document.getElementById('issuer').value.trim(),
      account: document.getElementById('account').value.trim(),
      secret: document.getElementById('secret').value.trim(),
      profile: state.profile,
    }));
    addDialog.close();
    toast('Account added');
  } catch (error) {
    addError.textContent = String(error.message || error);
    addError.hidden = false;
  }
});
async function deleteSelectedProfile() {
  const name = state.profile;
  if (!name || name === 'All Profiles') {
    toast('Select a profile first');
    return;
  }
  if (!confirm(`Delete profile ${name} and all of its accounts?`)) return;
  state.profile = 'All Profiles';
  applyState(await window.otp.deleteProfile(name));
  toast(`Deleted ${name}`);
}

async function deleteAllProfiles() {
  if (!state.profiles.length && !state.accounts.length) {
    toast('Nothing to delete');
    return;
  }
  if (!confirm('Delete all profiles and every imported account?')) return;
  state.profile = 'All Profiles';
  applyState(await window.otp.deleteAllProfiles());
  renderProfileList();
  toast('All profiles deleted');
}

document.getElementById('delete-selected-btn').addEventListener('click', () => {
  deleteSelectedProfile();
});
document.getElementById('delete-all-btn').addEventListener('click', () => {
  deleteAllProfiles();
});
document.getElementById('delete-all-profiles').addEventListener('click', (event) => {
  event.preventDefault();
  deleteAllProfiles();
});
document.getElementById('create-profile').addEventListener('click', async () => {
  const name = document.getElementById('profile-name').value.trim();
  if (!name) return;
  applyState(await window.otp.createProfile(name));
  document.getElementById('profile-name').value = '';
  renderProfileList();
});
document.getElementById('save-prefs').addEventListener('click', async () => {
  const enabled_types = Array.from(document.querySelectorAll('.pref-type'))
    .filter((box) => box.checked)
    .map((box) => box.value);
  applyState(await window.otp.setPrefs({
    show_passwords_cleartext: document.getElementById('pref-cleartext').checked,
    scan_binary_files: document.getElementById('pref-binary').checked,
    enable_dnd_overlay: document.getElementById('pref-dnd').checked,
    auto_add_path_to_profile: document.getElementById('pref-autoprofile').checked,
    validate_otp: document.getElementById('pref-validate').checked,
    max_import_workers: Number(document.getElementById('pref-workers').value || 4),
    enabled_types,
    theme: state.prefs.theme || 'light',
  }));
  prefsDialog.close();
  toast('Preferences saved');
});
document.getElementById('theme-switch').addEventListener('change', async (event) => {
  const theme = event.target.checked ? 'dark' : 'light';
  applyState(await window.otp.setPrefs({ theme }));
});

searchEl.addEventListener('input', () => {
  state.search = searchEl.value;
  render();
});
categoryEl.addEventListener('change', () => { state.category = categoryEl.value; render(); });
passwordEl.addEventListener('change', () => { state.passwordFilter = passwordEl.value; render(); });
typeEl.addEventListener('change', () => { state.typeFilter = typeEl.value; render(); });
profileEl.addEventListener('change', () => {
  state.profile = profileEl.value;
  document.getElementById('delete-selected-btn').disabled = !state.profile || state.profile === 'All Profiles';
  render();
});

['dragenter', 'dragover'].forEach((name) => {
  document.addEventListener(name, (event) => {
    event.preventDefault();
    dropEl.classList.add('active');
  });
});
['dragleave', 'drop'].forEach((name) => {
  document.addEventListener(name, (event) => {
    event.preventDefault();
    if (name === 'dragleave') dropEl.classList.remove('active');
  });
});
document.addEventListener('drop', async (event) => {
  dropEl.classList.remove('active');
  const files = Array.from(event.dataTransfer?.files || []);
  const paths = files.map((file) => window.otp.pathForFile(file)).filter(Boolean);
  if (!paths.length) return toast('Could not read dropped file path');
  showProgress({ phase: 'import', label: 'Importing dropped files…', index: 0, total: paths.length });
  applyState(await window.otp.importPaths(paths, state.profile));
});

window.otp.onState(applyState);
window.otp.onProgress(showProgress);
window.otp.onMenu((name) => {
  if (name === 'import') document.getElementById('import-btn').click();
  if (name === 'scrape') document.getElementById('scrape-btn').click();
  if (name === 'add') openAddDialog();
  if (name === 'prefs') openPrefs();
  if (name === 'profiles') {
    renderProfileList();
    profilesDialog.showModal();
  }
  if (name === 'delete-all-profiles') deleteAllProfiles();
  if (name === 'about') aboutDialog.showModal();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openAddDialog();
  }
});

refresh();
setInterval(tick, 1000);
