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
let chartInstances = {};

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
    (uid) => { selectedUid = uid; updateBackLink(); renderAll(); }
  );

  updateBackLink();

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activePeriod = btn.dataset.period;
      updatePeriodBtns();
      renderAll();
    });
  });
  updatePeriodBtns();

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderAll();
  });

  subscribeProjectTasks(projectName, (tasks) => {
    allTasks = tasks;
    renderAll();
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
  document.getElementById('btn-back').href = selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderAll() {
  const start = periodStart();
  const filtered = allEntries
    .filter(e => (e.projectName || e.project) === projectName)
    .filter(e => !selectedUid || e.uid === selectedUid)
    .filter(e => !start || e.timestamp >= start);

  document.getElementById('project-title').textContent = projectName;

  const total = filtered.reduce((s, e) => s + e.hours, 0);
  document.getElementById('total-hours').textContent = filtered.length
    ? `${Math.round(total * 10) / 10}h łącznie · ${filtered.length} wpisów`
    : '';

  // Destroy old charts to avoid canvas reuse errors
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};

  const container = document.getElementById('tasks-container');
  container.innerHTML = '';

  if (!allTasks.length) return; // czekaj aż zadania się załadują

  // Group entries by taskId
  const byTask = {};
  filtered.forEach(e => {
    if (!e.taskId) return;
    if (!byTask[e.taskId]) byTask[e.taskId] = [];
    byTask[e.taskId].push(e);
  });

  allTasks.forEach(task => {
    const entries = byTask[task.id] || [];
    container.appendChild(buildTaskSection(task, entries));
  });
}

function buildTaskSection(task, entries) {
  const owner     = usersMap.get(task.uid);
  const ownerName = owner ? (owner.displayName || owner.name || owner.email || 'Stażysta') : 'Stażysta';
  const s         = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
  const canApprove = task.status === 'reviewing';
  const taskHours  = entries.reduce((sum, e) => sum + e.hours, 0);

  const section = document.createElement('div');
  section.className = 'admin-task-section';

  const ownerAvatar = owner?.photoURL
    ? `<img src="${owner.photoURL}" class="task-owner-avatar" referrerpolicy="no-referrer" alt="">`
    : `<span class="task-owner-initials">${ownerName[0].toUpperCase()}</span>`;

  section.innerHTML = `
    <div class="admin-task-header">
      <div class="admin-task-title-row">
        <span class="task-name">${task.title}</span>
        <div class="task-card-actions">
          <span class="task-status-badge ${s.cls}">${s.label}</span>
          ${taskHours ? `<span class="task-hours">${Math.round(taskHours * 10) / 10}h</span>` : ''}
          ${canApprove ? `<button class="btn-approve-task btn-add">Zatwierdź ✓</button>` : ''}
        </div>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ''}
      <div class="task-owner">
        ${ownerAvatar}
        <span class="task-owner-name">${ownerName}</span>
      </div>
    </div>
    <div class="admin-task-entries"></div>
  `;

  if (canApprove) {
    section.querySelector('.btn-approve-task').addEventListener('click', async (e) => {
      e.target.disabled = true;
      await updateTaskStatus(task.id, 'done');
    });
  }

  const entriesEl = section.querySelector('.admin-task-entries');
  if (!entries.length) {
    entriesEl.innerHTML = '<p class="admin-task-no-entries">Brak wpisów w wybranym okresie.</p>';
  } else {
    renderEntriesGrid(entriesEl, entries);
  }

  return section;
}

function renderEntriesGrid(container, entries) {
  const grid = document.createElement('div');
  grid.className = 'charts-grid admin-entries-grid';
  container.appendChild(grid);

  entries.forEach((entry) => {
    const author  = usersMap.get(entry.uid);
    const authorName = author ? (author.displayName || author.name || author.email || 'Stażysta') : 'Stażysta';
    const authorAvatar = author?.photoURL
      ? `<img src="${author.photoURL}" class="entry-author-avatar" referrerpolicy="no-referrer" alt="">`
      : `<div class="entry-author-initials">${authorName[0].toUpperCase()}</div>`;

    const dateObj = new Date(entry.date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    const canvasId = `chart-${entry.id}`;

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap entry-card';
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <span class="entry-hours">${entry.hours}h</span>
        </div>
        <div class="entry-author-block">
          <div class="entry-author">
            ${authorAvatar}
            <span class="entry-author-name">${authorName}</span>
          </div>
          <a href="admin-day.html?date=${entry.date}${selectedUid ? `&uid=${selectedUid}` : ''}" class="entry-date-link">${dateStr}</a>
        </div>
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ''}
      </div>
      <div class="entry-canvas-wrap">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;
    grid.appendChild(wrap);

    chartInstances[entry.id] = new Chart(wrap.querySelector('canvas').getContext('2d'), {
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
