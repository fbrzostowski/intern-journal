import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, getAllUsers, chartGridColor } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";

const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

const params    = new URLSearchParams(window.location.search);
const date      = params.get('date');
let selectedUid = params.get('uid') || null;
let allEntries  = [];
let usersMap    = new Map();

async function init() {
  if (!date) { window.location.href = 'admin.html'; return; }

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

function navUrl(d) {
  return `admin-day.html?date=${d}${selectedUid ? `&uid=${selectedUid}` : ''}`;
}

function renderView() {
  const visibleEntries = selectedUid
    ? allEntries.filter(e => e.uid === selectedUid)
    : allEntries;

  const dayEntries = visibleEntries.filter(e => e.date === date);

  // Nawigacja prev/next po unikatowych datach w bieżącym filtrze
  const allDates = [...new Set(visibleEntries.map(e => e.date))].sort();
  const idx      = allDates.indexOf(date);
  const prevEl   = document.getElementById('nav-prev');
  const nextEl   = document.getElementById('nav-next');
  prevEl.classList.toggle('nav-arrow--disabled', idx <= 0);
  nextEl.classList.toggle('nav-arrow--disabled', idx >= allDates.length - 1);
  prevEl.href = idx > 0                   ? navUrl(allDates[idx - 1]) : '#';
  nextEl.href = idx < allDates.length - 1 ? navUrl(allDates[idx + 1]) : '#';

  if (!dayEntries.length) {
    document.getElementById('day-title').textContent = 'Brak wpisów dla tego dnia';
    document.getElementById('total-hours').textContent = '';
    document.getElementById('charts-grid').innerHTML = '';
    document.getElementById('status').textContent = '';
    return;
  }

  document.getElementById('status').textContent = '';
  const dateObj = new Date(date + 'T12:00:00');
  document.getElementById('day-title').textContent =
    dateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  const total = dayEntries.reduce((s, e) => s + e.hours, 0);
  document.getElementById('total-hours').textContent = `${Math.round(total * 10) / 10}h łącznie`;

  const grid = document.getElementById('charts-grid');
  grid.innerHTML = '';

  dayEntries.forEach((entry, i) => {
    const uidParam   = selectedUid ? `&uid=${selectedUid}` : '';
    const projectUrl = `admin-project.html?name=${encodeURIComponent(entry.project)}${uidParam}`;

    const author = usersMap.get(entry.uid);
    const authorHtml = author ? `
      <div class="entry-author">
        ${author.photoURL ? `<img src="${author.photoURL}" class="entry-author-avatar" alt="">` : ''}
        <span class="entry-author-name">${author.name ?? author.email}</span>
      </div>` : '';

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        ${authorHtml}
        <a href="${projectUrl}" class="entry-project-link">${entry.project}</a>
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
