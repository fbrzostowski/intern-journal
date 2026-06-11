import { requireAuth } from "./auth.js";
import { subscribeProjectTasks, subscribeUserEntries, getAllUsers } from "./store.js";
import { setupAddTaskModal, openAddTaskModal } from "./add-task-modal.js";

async function init() {
  const params = new URLSearchParams(window.location.search);
  const name   = params.get("name");
  if (!name) { window.location.href = "index.html"; return; }

  const { user } = await requireAuth();

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  document.title = `Projekt: ${name}`;
  document.getElementById("project-title").textContent = name;

  setupAddTaskModal(user.uid);
  document.getElementById("btn-add-task").addEventListener("click", () => openAddTaskModal(name));

  // Pobierz mapę uid→user raz
  const usersMap = new Map();
  try {
    const users = await getAllUsers();
    users.forEach(u => usersMap.set(u.uid, u));
  } catch (_) {}

  // Wpisy zalogowanego — do liczenia godzin własnych zadań
  let myEntries = [];
  subscribeUserEntries(user.uid, (entries) => {
    myEntries = entries;
    render(tasks, myEntries);
  });

  let tasks = [];
  subscribeProjectTasks(name, (allTasks) => {
    tasks = allTasks;
    render(tasks, myEntries);
  });

  function render(allTasks, userEntries) {
    const list   = document.getElementById("tasks-list");
    const empty  = document.getElementById("tasks-empty");
    const totalEl = document.getElementById("total-hours");

    if (!allTasks.length) {
      list.innerHTML = "";
      empty.style.display = "";
      totalEl.textContent = "";
      return;
    }
    empty.style.display = "none";

    // Sumaryczne godziny własnych wpisów w tym projekcie
    const myProjectHours = userEntries
      .filter(e => e.projectName === name)
      .reduce((s, e) => s + e.hours, 0);
    totalEl.textContent = myProjectHours
      ? `${Math.round(myProjectHours * 10) / 10}h Twoich godzin`
      : "";

    // Mapa taskId → godziny z wpisów zalogowanego
    const hoursByTask = {};
    userEntries.forEach(e => {
      if (!e.taskId) return;
      hoursByTask[e.taskId] = (hoursByTask[e.taskId] || 0) + e.hours;
    });

    list.innerHTML = "";

    // Własne zadania najpierw, potem cudze
    const ownTasks   = allTasks.filter(t => t.uid === user.uid);
    const otherTasks = allTasks.filter(t => t.uid !== user.uid);

    if (ownTasks.length) {
      const section = document.createElement("div");
      section.className = "tasks-group";
      section.innerHTML = `<h3 class="tasks-group-label">Twoje zadania</h3>`;
      ownTasks.forEach(task => section.appendChild(buildOwnCard(task, hoursByTask)));
      list.appendChild(section);
    }

    if (otherTasks.length) {
      const section = document.createElement("div");
      section.className = "tasks-group";
      section.innerHTML = `<h3 class="tasks-group-label">Zadania innych</h3>`;
      otherTasks.forEach(task => section.appendChild(buildOtherCard(task, usersMap)));
      list.appendChild(section);
    }
  }

  function buildOwnCard(task, hoursByTask) {
    const hours      = hoursByTask[task.id] || 0;
    const hoursStr   = hours ? `${Math.round(hours * 10) / 10}h` : "0h";
    const taskUrl    = `task.html?id=${task.id}&title=${encodeURIComponent(task.title)}&project=${encodeURIComponent(name)}&owner=${user.uid}`;

    const a = document.createElement("a");
    a.href      = taskUrl;
    a.className = "task-card task-card--own";
    a.innerHTML = `
      <div class="task-card-header">
        <span class="task-name">${task.title}</span>
        <span class="task-hours">${hoursStr}</span>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ""}
    `;
    return a;
  }

  function buildOtherCard(task, usersMap) {
    const owner    = usersMap.get(task.uid);
    const ownerName = owner ? (owner.displayName || owner.name || owner.email || "Stażysta") : "Stażysta";
    const ownerAvatar = owner?.photoURL
      ? `<img src="${owner.photoURL}" class="task-owner-avatar" alt="">`
      : `<span class="task-owner-initials">${ownerName[0].toUpperCase()}</span>`;

    const div = document.createElement("div");
    div.className = "task-card task-card--locked";
    div.innerHTML = `
      <div class="task-card-header">
        <span class="task-name">${task.title}</span>
        <svg class="task-lock-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ""}
      <div class="task-owner">
        ${ownerAvatar}
        <span class="task-owner-name">${ownerName}</span>
      </div>
    `;
    return div;
  }
}

init();
