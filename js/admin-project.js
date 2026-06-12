import { requireAuth, logout } from "./auth.js";
import { subscribeAllEntries, subscribeProjectTasks, getAllUsers, updateTaskStatus, deleteTask, subscribeProject, chartGridColor } from "./store.js";
import { buildInternPicker } from "./intern-picker.js";
import { setupAddTaskModal, openAddTaskModal, updateAddTaskModalUsers } from "./add-task-modal.js";
import { setupMembersModal, openMembersModal, updateMembersModal } from "./task-members-modal.js";
import { setupFinishProjectModal, openFinishProjectModal } from "./finish-project-modal.js";
import { setupProjectMembersModal, openProjectMembersModal, updateProjectMembersModal } from "./project-members-modal.js";

const PEOPLE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="7" r="4"/>
  <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
  <circle cx="19" cy="19" r="2"/>
  <path d="M19 15v2"/><path d="M19 21v2"/><path d="M15 19h2"/><path d="M21 19h2"/>
</svg>`;

const STATUS_MAP = {
  todo:      { label: "Nie zrobione",   cls: "status-todo" },
  reviewing: { label: "Do sprawdzenia", cls: "status-reviewing" },
  done:      { label: "Wykonane",       cls: "status-done" },
};

const CATEGORIES = [
  { key: "interest",   label: "Ciekawość",    color: "#534AB7" },
  { key: "learning",   label: "Nauka",        color: "#0F6E56" },
  { key: "difficulty", label: "Trudność",     color: "#993C1D" },
  { key: "mood",       label: "Samopoczucie", color: "#B8860B" },
];

const params      = new URLSearchParams(window.location.search);
const projectName = params.get('name');
let selectedUid      = params.get('uid') || null;
let allEntries       = [];
let allTasks         = [];
let usersMap         = new Map();
let currentAdminUser = null;
let currentProject   = null;

async function init() {
  if (!projectName) { window.location.href = 'admin.html'; return; }

  const { user } = await requireAuth('admin');
  currentAdminUser = user;

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
  setupMembersModal();
  setupFinishProjectModal();
  setupProjectMembersModal();
  document.getElementById('btn-add-task').addEventListener('click', () =>
    openAddTaskModal(projectName)
  );

  const btnFinish = document.getElementById('btn-finish-project');
  const btnManageAccess = document.getElementById('btn-manage-project-access');
  subscribeProject(projectName, (project) => {
    currentProject = project;
    const projectUids = new Set([
      ...(project?.uid ? [project.uid] : []),
      ...Object.keys(project?.members || {}),
    ]);
    updateAddTaskModalUsers(users.filter(u => projectUids.has(u.uid)));

    if (project) {
      const isDone = project.status === "done";
      btnFinish.textContent = isDone ? "Wznów projekt" : "Zakończ projekt";
      btnFinish.classList.toggle("btn-finish--resume", isDone);
      btnFinish.onclick     = () => openFinishProjectModal(project);
      updateProjectMembersModal({ project, currentUser: user, currentUserRole: 'admin' });
    }
  });

  btnManageAccess.addEventListener('click', () => {
    if (currentProject) openProjectMembersModal({ project: currentProject, currentUser: user, currentUserRole: 'admin' });
  });

  updateBackLink();

  subscribeAllEntries((entries) => {
    allEntries = entries;
    renderAll();
  });

  subscribeProjectTasks(projectName, (tasks) => {
    allTasks = tasks;
    renderAll();
    tasks.forEach(t => updateMembersModal({ task: t, currentUser: user, currentUserRole: 'admin' }));
  });
}

function updateBackLink() {
  document.getElementById('btn-back').href = selectedUid ? `admin.html?uid=${selectedUid}` : 'admin.html';
}

function renderAll() {
  if (!allTasks.length) return;

  document.getElementById('project-title').textContent = projectName;

  // Godziny + wpisy per zadanie (filtrowane po ewentualnym stażyście)
  const hoursByTask   = {};
  const entriesByTask = {};
  allEntries
    .filter(e => (e.projectName || e.project) === projectName)
    .filter(e => !selectedUid || e.uid === selectedUid)
    .forEach(e => {
      if (!e.taskId) return;
      hoursByTask[e.taskId]   = (hoursByTask[e.taskId] || 0) + e.hours;
      (entriesByTask[e.taskId] ??= []).push(e);
    });

  // Wszyscy autorzy wpisów per zadanie (niezależnie od wybranego stażysty)
  const contributorsByTask = {};
  allEntries
    .filter(e => (e.projectName || e.project) === projectName)
    .forEach(e => {
      if (!e.taskId || !e.uid) return;
      (contributorsByTask[e.taskId] ??= new Set()).add(e.uid);
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
    const entries = entriesByTask[task.id] || [];
    // Twórca zawsze pierwszy, potem pozostali autorzy wpisów
    const contributors = contributorsByTask[task.id] ?? new Set();
    const peopleUids = [task.uid, ...[...contributors].filter(uid => uid !== task.uid)];
    container.appendChild(buildTaskCard(task, hoursByTask[task.id] || 0, entries, peopleUids));
    renderTaskChart(task.id, entries);
  });
}

// Średnia ważona ocen (waga = czas wpisu); fallback do zwykłej średniej gdy 0h
function weightedRatings(entries) {
  const totals = { interest: 0, learning: 0, difficulty: 0, mood: 0 };
  let totalW = 0;
  entries.forEach(e => {
    const w = e.hours > 0 ? e.hours : 0;
    totalW += w;
    CATEGORIES.forEach(c => { totals[c.key] += w * (e.ratings[c.key] || 0); });
  });
  if (totalW > 0) {
    CATEGORIES.forEach(c => { totals[c.key] /= totalW; });
  } else if (entries.length) {
    CATEGORIES.forEach(c => {
      totals[c.key] = entries.reduce((s, e) => s + (e.ratings[c.key] || 0), 0) / entries.length;
    });
  }
  return totals;
}

function renderTaskChart(taskId, entries) {
  const canvas = document.getElementById(`chart-task-${taskId}`);
  if (!canvas || !entries.length) return;

  const r = weightedRatings(entries);
  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: CATEGORIES.map(c => c.label),
      datasets: [{
        data:            CATEGORIES.map(c => Math.round(r[c.key] * 10) / 10),
        backgroundColor: CATEGORIES.map(c => c.color + "bb"),
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
        x: { ticks: { color: "#333", font: { size: 12, weight: "500" } }, grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function buildTaskCard(task, hours, entries = [], peopleUids = [task.uid]) {
  const s         = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
  const hoursStr  = hours ? `${Math.round(hours * 10) / 10}h` : '0h';
  const taskUrl   = `task.html?id=${task.id}&title=${encodeURIComponent(task.title)}&project=${encodeURIComponent(projectName)}`;

  // Etykiety dostępu pokazujemy tylko gdy w zadaniu jest więcej niż jedna osoba
  const showBadges = peopleUids.length > 1;

  const personHtml = (uid) => {
    const u    = usersMap.get(uid);
    const name = u ? (u.displayName || u.name || u.email || 'Stażysta') : 'Stażysta';
    const avatar = u?.photoURL
      ? `<img src="${u.photoURL}" class="task-owner-avatar" referrerpolicy="no-referrer" alt="">`
      : `<span class="task-owner-initials">${name[0].toUpperCase()}</span>`;

    let badge = "";
    if (showBadges) {
      if (uid === task.uid) {
        badge = `<span class="task-person-badge task-person-badge--owner">Twórca</span>`;
      } else {
        const access = task.members?.[uid];
        const label  = access === "write" ? "Edycja" : access === "read" ? "Odczyt" : null;
        badge = label
          ? `<span class="task-person-badge task-person-badge--${access}">${label}</span>`
          : `<span class="task-person-badge task-person-badge--empty"></span>`;
      }
    }

    return `<div class="task-person">
      ${badge}
      <span class="task-person-info">${avatar}<span class="task-owner-name">${name}</span></span>
    </div>`;
  };
  const peopleHtml = peopleUids.map(personHtml).join('');

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
        <button class="btn-manage-members" title="Zarządzaj dostępem" type="button">${PEOPLE_SVG}</button>
        <button class="btn-delete-task" title="Usuń zadanie" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
    ${task.description ? `<p class="task-desc">${task.description}</p>` : ''}
    <div class="task-people">
      ${peopleHtml}
    </div>
    ${entries.length
      ? `<div class="task-chart-wrap"><canvas id="chart-task-${task.id}"></canvas></div>`
      : `<p class="task-chart-empty">Brak wpisów — wykres pojawi się po dodaniu ocen.</p>`}
  `;

  a.querySelector('.btn-manage-members').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMembersModal({ task, currentUser: currentAdminUser, currentUserRole: 'admin' });
  });

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
