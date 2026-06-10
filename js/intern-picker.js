const ALL_OPTION = { uid: '', name: 'Wszyscy stażyści', photoURL: null };

function avatar(photoURL, size = 24) {
  if (photoURL) {
    const img = document.createElement('img');
    img.src       = photoURL;
    img.alt       = '';
    img.className = 'ip-avatar';
    img.style.width = img.style.height = size + 'px';
    return img;
  }
  const span = document.createElement('span');
  span.className = 'ip-avatar ip-avatar--all';
  span.style.width = span.style.height = size + 'px';
  span.textContent = '👥';
  return span;
}

// Builds and inserts a custom intern-picker into `container`.
// `users`      — array from getAllUsers()
// `initialUid` — preselected uid string or null
// `onChange`   — called with uid string or null on selection
export function buildInternPicker(container, users, initialUid, onChange) {
  const options = [
    ALL_OPTION,
    ...users
      .filter(u => u.role === 'intern')
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
      .map(u => ({ uid: u.uid, name: u.name ?? u.email, photoURL: u.photoURL ?? null })),
  ];

  let selectedUid = initialUid ?? '';

  const wrap = document.createElement('div');
  wrap.className = 'intern-picker';

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'ip-btn';

  const dropdown = document.createElement('div');
  dropdown.className = 'ip-dropdown';
  dropdown.hidden    = true;

  function currentOpt() {
    return options.find(o => o.uid === selectedUid) ?? ALL_OPTION;
  }

  function renderBtn() {
    btn.innerHTML = '';
    const opt = currentOpt();
    btn.appendChild(avatar(opt.photoURL, 22));
    const name = document.createElement('span');
    name.textContent = opt.name;
    btn.appendChild(name);
    const arrow = document.createElement('span');
    arrow.className  = 'ip-arrow';
    arrow.textContent = '▾';
    btn.appendChild(arrow);
  }

  function renderDropdown() {
    dropdown.innerHTML = '';
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'ip-option';
      if (opt.uid === selectedUid) item.classList.add('ip-option--active');
      item.appendChild(avatar(opt.photoURL, 26));
      const name = document.createElement('span');
      name.textContent = opt.name;
      item.appendChild(name);
      item.addEventListener('click', () => {
        selectedUid = opt.uid;
        renderBtn();
        renderDropdown();
        dropdown.hidden = true;
        onChange(opt.uid || null);
      });
      dropdown.appendChild(item);
    });
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  });

  document.addEventListener('click', () => { dropdown.hidden = true; });

  renderBtn();
  renderDropdown();

  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
  container.appendChild(wrap);
}
