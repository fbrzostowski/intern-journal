import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, subscribeProjectTasks, getAllUsers, updateTaskStatus, chartGridColor } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";

const CATEGORIES = [
  { key: 'interest',   label: 'Ciekawość',    color: '#534AB7' },
  { key: 'learning',   label: 'Nauka',        color: '#0F6E56' },
  { key: 'difficulty', label: 'Trudność',     color: '#993C1D' },
  { key: 'mood',       label: 'Samopoczucie', color: '#B8860B' },
];

const STATUS_MAP = {
  todo:      { label: "Nie zrobione",   cls: "status-todo" },
  reviewing: { label: "Do sprawdzenia", cls: "status-reviewing" },
  done:      { label: "Wykonane",       cls: "status-done" },
};

const params      = new URLSearchParams(window.location.search);
const projectName = params.get('name');
let selectedUid   = params.get('uid') || null;
let allEntries    = [];
let allTasks      = [];
let usersMap      = new Map();
let activePeriod  = 'all';

async function init() {
  if (!projectName) { window.location.href = 'admin.html'; return; }

  const { user } = await requireAuth('admin');

  document.getElementById('user-name').textContent = user.displayName ?? user.email;
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ''; }
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.title = `Admin — ${projectName}`;

  const users = await getAllUsers();
  usersMap = new Map(users.map(u => [u.uid, u]));
  buildInternPicker(
    document.getElementById('intern-picker-wrap'),
    users, selectedUid,
    (uid) => { selectedUid = uid; updateBackLink(); renderView(); }
  );

  updateBackLink();

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activePeriod = btn.dataset.period;
      updatePeriodBtns();
      renderView();
    });
  });
  updatePeriodBtns();

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderView();
  });

  subscribeProjectTasks(projectName, (tasks) => {
    allTasks = tasks;
    renderTasks();
  });
}

function updatePeriodBtns() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('period-btn--active', btn.dataset.period === activePeriod);
  });
}

function periodStart() {
  const now = new Date();
  if (activePeriod === 'week') {
    const d = new Date(now);
    d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (activePeriod === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}


function updateBackLink() {
  const back = document.getElementById('btn-back');
  back.href = selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderView() {
  const start = periodStart();
  const entries = allEntries
    .filter(e => e.project === projectName)
    .filter(e => !selectedUid || e.uid === selectedUid)
    .filter(e => !start || e.timestamp >= start);

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

    const author = usersMap.get(entry.uid);
    const authorHtml = author ? `
      <a href="admin-intern.html?uid=${entry.uid}" class="entry-author">
        ${author.photoURL ? `<img src="${author.photoURL}" class="entry-author-avatar" alt="">` : ''}
        <span class="entry-author-name">${author.name ?? author.email}</span>
      </a>` : '';

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        ${authorHtml}
        <a href="admin-day.html?date=${entry.date}${selectedUid ? `&uid=${selectedUid}` : ''}" class="entry-date-link">${dateStr}</a>
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

function renderTasks() {
  const section = document.getElementById("tasks-review-section");
  const list    = document.getElementById("tasks-review-list");
  if (!allTasks.length) { section.style.display = "none"; return; }
  section.style.display = "";
  list.innerHTML = "";

  allTasks.forEach(task => {
    const owner  = usersMap.get(task.uid);
    const name   = owner ? (owner.displayName || owner.name || owner.email || "Stażysta") : "Stażysta";
    const s      = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
    const canApprove = task.status === "reviewing";

    const card = document.createElement("div");
    card.className = "task-review-card";
    card.innerHTML = `
      <div class="task-review-header">
        <span class="task-name">${task.title}</span>
        <div class="task-card-actions">
          <span class="task-status-badge ${s.cls}">${s.label}</span>
          ${canApprove ? `<button class="btn-approve-task btn-add" data-id="${task.id}">Zatwierdź ✓</button>` : ""}
        </div>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ""}
      <div class="task-owner">
        ${owner?.photoURL ? `<img src="${owner.photoURL}" class="task-owner-avatar" referrerpolicy="no-referrer" alt="">` : `<span class="task-owner-initials">${name[0].toUpperCase()}</span>`}
        <span class="task-owner-name">${name}</span>
      </div>
    `;

    if (canApprove) {
      card.querySelector(".btn-approve-task").addEventListener("click", async (e) => {
        e.target.disabled = true;
        await updateTaskStatus(task.id, "done");
      });
    }

    list.appendChild(card);
  });
}

init();
