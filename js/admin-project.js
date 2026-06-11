import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, subscribeProjectTasks, getAllUsers, updateTaskStatus, deleteTask } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";
import { setupAddTaskModal, openAddTaskModal } from "./add-task-modal.js";

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
    (uid) => { selectedUid = uid; updateBackLink(); renderAll(); }
  );

  setupAddTaskModal(user.uid, { allUsers: users });
  document.getElementById('btn-add-task').addEventListener('click', () =>
    openAddTaskModal(projectName)
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
  if (activePeriod === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function updateBackLink() {
  document.getElementById('btn-back').href = selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderAll() {
  if (!allTasks.length) return;

  document.getElementById('project-title').textContent = projectName;

  const start = periodStart();

  // Godziny per zadanie (filtrowane po okresie i ewentualnym stażyście)
  const hoursByTask = {};
  allEntries
    .filter(e => (e.projectName || e.project) === projectName)
    .filter(e => !selectedUid || e.uid === selectedUid)
    .filter(e => !start || e.timestamp >= start)
    .forEach(e => {
      if (!e.taskId) return;
      hoursByTask[e.taskId] = (hoursByTask[e.taskId] || 0) + e.hours;
    });

  // Filtruj zadania po stażyście (właściciel)
  const tasks = selectedUid ? allTasks.filter(t => t.uid === selectedUid) : allTasks;

  const totalHours = tasks.reduce((s, t) => s + (hoursByTask[t.id] || 0), 0);
  document.getElementById('total-hours').textContent = totalHours
    ? `${Math.round(totalHours * 10) / 10}h łącznie · ${tasks.length} zadań`
    : `${tasks.length} zadań`;

  const container = document.getElementById('tasks-container');
  container.innerHTML = '';

  if (!tasks.length) {
    container.innerHTML = '<p class="status">Brak zadań dla wybranego stażysty.</p>';
    return;
  }

  tasks.forEach(task => {
    container.appendChild(buildTaskCard(task, hoursByTask[task.id] || 0));
  });
}

function buildTaskCard(task, hours) {
  const owner     = usersMap.get(task.uid);
  const ownerName = owner ? (owner.displayName || owner.name || owner.email || 'Stażysta') : 'Stażysta';
  const s         = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
  const hoursStr  = hours ? `${Math.round(hours * 10) / 10}h` : '0h';
  const taskUrl   = `task.html?id=${task.id}&title=${encodeURIComponent(task.title)}&project=${encodeURIComponent(projectName)}`;

  const ownerAvatar = owner?.photoURL
    ? `<img src="${owner.photoURL}" class="task-owner-avatar" referrerpolicy="no-referrer" alt="">`
    : `<span class="task-owner-initials">${ownerName[0].toUpperCase()}</span>`;

  const a = document.createElement('a');
  a.href      = taskUrl;
  a.className = 'task-card task-card--admin';
  a.innerHTML = `
    <div class="task-card-header">
      <span class="task-name">${task.title}</span>
      <div class="task-card-actions">
        <span class="task-status-badge ${s.cls}">${s.label}</span>
        <span class="task-hours">${hoursStr}</span>
        ${task.status === 'reviewing' ? `<button class="btn-approve-task btn-add" type="button">Zatwierdź ✓</button>` : ''}
        <button class="btn-delete-task" title="Usuń zadanie" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
    ${task.description ? `<p class="task-desc">${task.description}</p>` : ''}
    <div class="task-owner">
      ${ownerAvatar}
      <span class="task-owner-name">${ownerName}</span>
    </div>
  `;

  if (task.status === 'reviewing') {
    a.querySelector('.btn-approve-task').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.target.disabled = true;
      await updateTaskStatus(task.id, 'done');
    });
  }

  a.querySelector('.btn-delete-task').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Usunąć zadanie „${task.title}" wraz ze wszystkimi wpisami?`)) return;
    try { await deleteTask(task.id); }
    catch (err) { alert('Błąd usuwania: ' + err.message); }
  });

  return a;
}

init();
