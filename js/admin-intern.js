import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, getAllUsers, chartGridColor } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";

const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

const params      = new URLSearchParams(window.location.search);
let selectedUid   = params.get('uid') || null;
let allEntries    = [];
let usersMap      = new Map();

async function init() {
  if (!selectedUid) { window.location.href = 'admin.html'; return; }

  const { user } = await requireAuth('admin');

  document.getElementById('user-name').textContent = user.displayName ?? user.email;
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ''; }
  document.getElementById('btn-logout').addEventListener('click', logout);

  const users = await getAllUsers();
  usersMap = new Map(users.map(u => [u.uid, u]));

  buildInternPicker(
    document.getElementById('intern-picker-wrap'),
    users, selectedUid,
    (uid) => {
      selectedUid = uid;
      updateBackLink();
      if (!uid) { window.location.href = 'admin.html'; return; }
      window.history.replaceState(null, '', `admin-intern.html?uid=${uid}`);
      renderView();
    }
  );

  updateBackLink();
  renderInternName();

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderView();
  });
}

function updateBackLink() {
  document.getElementById('btn-back').href =
    selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderInternName() {
  const u = usersMap.get(selectedUid);
  if (!u) return;
  const nameEl = document.getElementById('intern-name');
  if (u.photoURL) {
    const img = document.createElement('img');
    img.src       = u.photoURL;
    img.className = 'intern-title-avatar';
    img.alt       = '';
    nameEl.parentElement.insertBefore(img, nameEl.parentElement.firstChild);
  }
  nameEl.textContent = u.name ?? u.email;
  document.title = `Admin — ${u.name ?? u.email}`;
}

function renderView() {
  const entries = selectedUid
    ? allEntries.filter(e => e.uid === selectedUid)
    : allEntries;

  if (!entries.length) {
    document.getElementById('status').textContent = 'Brak wpisów.';
    document.getElementById('total-hours').textContent = '';
    document.getElementById('charts-grid').innerHTML = '';
    return;
  }

  document.getElementById('status').textContent = '';
  const total = entries.reduce((s, e) => s + e.hours, 0);
  document.getElementById('total-hours').textContent =
    `${Math.round(total * 10) / 10}h łącznie · ${entries.length} wpisów`;

  const grid = document.getElementById('charts-grid');
  grid.innerHTML = '';

  [...entries].reverse().forEach((entry, i) => {
    const dateObj    = new Date(entry.date + 'T12:00:00');
    const dateStr    = dateObj.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const uidParam   = `uid=${selectedUid}`;
    const dayUrl     = `admin-day.html?date=${entry.date}&${uidParam}`;
    const projectUrl = `admin-project.html?name=${encodeURIComponent(entry.project)}&${uidParam}`;

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        <div class="entry-meta-row">
          <a href="${dayUrl}" class="entry-date-link">${dateStr}</a>
          <a href="${projectUrl}" class="entry-project-link">${entry.project}</a>
        </div>
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ''}
      </div>
      <div class="entry-canvas-wrap">
        <canvas id="chart-entry-${i}"></canvas>
      </div>
    `;
    grid.appendChild(wrap);

    new Chart(document.getElementById(`chart-entry-${i}`).getContext('2d'), {
      type: 'bar',
      data: {
        labels:   CATEGORIES.map(c => c.label),
        datasets: [{
          data:            CATEGORIES.map(c => entry.ratings[c.key]),
          backgroundColor: CATEGORIES.map(c => c.color + 'bb'),
          borderColor:     CATEGORIES.map(c => c.color),
          borderWidth: 1.5,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 10, ticks: { stepSize: 1 }, grid: { color: chartGridColor() } },
          x: { ticks: { color: '#333', font: { size: 12, weight: '500' } }, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
      },
    });
  });
}

init();
