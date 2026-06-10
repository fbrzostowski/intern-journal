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
const projectName = params.get('name');
let selectedUid   = params.get('uid') || null;
let allEntries    = [];

async function init() {
  if (!projectName) { window.location.href = 'admin.html'; return; }

  const { user } = await requireAuth('admin');

  document.getElementById('user-name').textContent = user.displayName ?? user.email;
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ''; }
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.title = `Admin — ${projectName}`;

  const users = await getAllUsers();
  buildInternPicker(
    document.getElementById('intern-picker-wrap'),
    users, selectedUid,
    (uid) => { selectedUid = uid; updateBackLink(); renderView(); }
  );

  updateBackLink();

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderView();
  });
}


function updateBackLink() {
  const back = document.getElementById('btn-back');
  back.href = selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderView() {
  const entries = allEntries
    .filter(e => e.project === projectName)
    .filter(e => !selectedUid || e.uid === selectedUid);

  document.getElementById('project-title').textContent = projectName;

  if (!entries.length) {
    document.getElementById('status').textContent = 'Brak wpisów dla tego projektu.';
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

  entries.forEach((entry, i) => {
    const dateObj = new Date(entry.date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        <span class="entry-date-link">${dateStr}</span>
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
