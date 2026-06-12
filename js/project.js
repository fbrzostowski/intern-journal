import { requireAuth } from "./auth.js";
import { subscribeProjectTasks, subscribeUserEntries, getAllUsers, deleteTask, updateTaskStatus } from "./store.js";
import { setupAddTaskModal, openAddTaskModal } from "./add-task-modal.js";
import { setupMembersModal, openMembersModal, updateMembersModal } from "./task-members-modal.js";

const PEOPLE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="7" r="4"/>
  <path d="M3 21v-2a4 4 0 0 1 4-4h4"/>
  <circle cx="19" cy="19" r="2"/>
  <path d="M19 15v2"/><path d="M19 21v2"/><path d="M15 19h2"/><path d="M21 19h2"/>
</svg>`;

async function init() {
  const params = new URLSearchParams(window.location.search);
  const name   = params.get("name");
  if (!name) { window.location.href = "index.html"; return; }

  const { user, role } = await requireAuth();

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  document.title = `Projekt: ${name}`;
  document.getElementById("project-title").textContent = name;

  // Pobierz mapę uid→user raz
  let allUsers = [];
  const usersMap = new Map();
  try {
    allUsers = await getAllUsers();
    allUsers.forEach(u => usersMap.set(u.uid, u));
  } catch (_) {}

  setupAddTaskModal(user.uid, { allUsers, showOwnerPicker: false });
  setupMembersModal();
  document.getElementById("btn-add-task").addEventListener("click", () => openAddTaskModal(name));

  let myEntries = [];
  let tasks     = [];

  subscribeUserEntries(user.uid, (entries) => {
    myEntries = entries;
    render(tasks, myEntries);
  });

  subscribeProjectTasks(name, (allTasks) => {
    tasks = allTasks;
    render(tasks, myEntries);
    allTasks.forEach(t => updateMembersModal({ task: t, currentUser: user, currentUserRole: role }));
  });

  function render(allTasks, userEntries) {
    const list    = document.getElementById("tasks-list");
    const empty   = document.getElementById("tasks-empty");
    const totalEl = document.getElementById("total-hours");

    if (!allTasks.length) {
      list.innerHTML = "";
      empty.style.display = "";
      totalEl.textContent = "";
      return;
    }
    empty.style.display = "none";

    const myProjectHours = userEntries
      .filter(e => e.projectName === name)
      .reduce((s, e) => s + e.hours, 0);
    totalEl.textContent = myProjectHours
      ? `${Math.round(myProjectHours * 10) / 10}h Twoich godzin`
      : "";

    const hoursByTask = {};
    userEntries.forEach(e => {
      if (!e.taskId) return;
      hoursByTask[e.taskId] = (hoursByTask[e.taskId] || 0) + e.hours;
    });

    list.innerHTML = "";

    const ownTasks    = allTasks.filter(t => t.uid === user.uid);
    const memberTasks = allTasks.filter(t => t.uid !== user.uid && t.members?.[user.uid]);
    const otherTasks  = allTasks.filter(t => t.uid !== user.uid && !t.members?.[user.uid]);

    if (ownTasks.length) {
      const section = document.createElement("div");
      section.className = "tasks-group";
      section.innerHTML = `<h3 class="tasks-group-label">Twoje zadania</h3>`;
      ownTasks.forEach(task => section.appendChild(buildOwnCard(task, hoursByTask)));
      list.appendChild(section);
    }

    if (memberTasks.length) {
      const section = document.createElement("div");
      section.className = "tasks-group";
      section.innerHTML = `<h3 class="tasks-group-label">Zadania z dostępem</h3>`;
      memberTasks.forEach(task => section.appendChild(buildMemberCard(task, hoursByTask, usersMap)));
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
    const hours   = hoursByTask[task.id] || 0;
    const hoursStr = hours ? `${Math.round(hours * 10) / 10}h` : "0h";
    const taskUrl = `task.html?id=${task.id}&title=${encodeURIComponent(task.title)}&project=${encodeURIComponent(name)}`;

    const a = document.createElement("a");
    a.href      = taskUrl;
    a.className = "task-card task-card--own";
    a.innerHTML = `
      <div class="task-card-header">
        <span class="task-name">${task.title}</span>
        <div class="task-card-actions">
          ${statusBadge(task.status)}
          <span class="task-hours">${hoursStr}</span>
          <button class="btn-manage-members" title="Zarządzaj dostępem" type="button">${PEOPLE_SVG}</button>
          <button class="btn-delete-task" title="Usuń zadanie" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ""}
    `;

    a.querySelector(".btn-manage-members").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMembersModal({ task, currentUser: user, currentUserRole: role });
    });

    a.querySelector(".btn-delete-task").addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Usunąć zadanie „${task.title}" wraz ze wszystkimi wpisami?`)) return;
      try { await deleteTask(task.id); }
      catch (err) { alert("Błąd usuwania: " + err.message); }
    });

    if (task.status === "reviewing") {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!confirm(`Wejście do zadania cofnie status „Do sprawdzenia" z powrotem na „Nie Zrobione". Kontynuować?`)) return;
        await updateTaskStatus(task.id, "todo");
        window.location.href = taskUrl;
      });
    }

    return a;
  }

  function buildMemberCard(task, hoursByTask, usersMap) {
    const hours    = hoursByTask[task.id] || 0;
    const hoursStr = hours ? `${Math.round(hours * 10) / 10}h` : "";
    const memberRole = task.members[user.uid];
    const roleLabel  = memberRole === "write" ? "Edycja" : "Odczyt";
    const taskUrl    = `task.html?id=${task.id}&title=${encodeURIComponent(task.title)}&project=${encodeURIComponent(name)}`;

    const owner     = usersMap.get(task.uid);
    const ownerName = owner ? (owner.displayName || owner.name || owner.email || "Stażysta") : "Stażysta";
    const ownerAvatar = owner?.photoURL
      ? `<img src="${owner.photoURL}" class="task-owner-avatar" alt="" referrerpolicy="no-referrer">`
      : `<span class="task-owner-initials">${ownerName[0].toUpperCase()}</span>`;

    const a = document.createElement("a");
    a.href      = taskUrl;
    a.className = "task-card task-card--member";
    a.innerHTML = `
      <div class="task-card-header">
        <span class="task-name">${task.title}</span>
        <div class="task-card-actions">
          ${statusBadge(task.status)}
          ${hoursStr ? `<span class="task-hours">${hoursStr}</span>` : ""}
          <span class="member-access-badge">${roleLabel}</span>
        </div>
      </div>
      ${task.description ? `<p class="task-desc">${task.description}</p>` : ""}
      <div class="task-owner">
        ${ownerAvatar}
        <span class="task-owner-name">${ownerName}</span>
      </div>
    `;

    if (task.status === "reviewing") {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!confirm(`Wejście do zadania cofnie status „Do sprawdzenia" z powrotem na „Nie Zrobione". Kontynuować?`)) return;
        await updateTaskStatus(task.id, "todo");
        window.location.href = taskUrl;
      });
    }

    return a;
  }

  function buildOtherCard(task, usersMap) {
    const owner     = usersMap.get(task.uid);
    const ownerName = owner ? (owner.displayName || owner.name || owner.email || "Stażysta") : "Stażysta";
    const ownerAvatar = owner?.photoURL
      ? `<img src="${owner.photoURL}" class="task-owner-avatar" alt="" referrerpolicy="no-referrer">`
      : `<span class="task-owner-initials">${ownerName[0].toUpperCase()}</span>`;

    const div = document.createElement("div");
    div.className = "task-card task-card--locked";
    div.innerHTML = `
      <div class="task-card-header">
        <span class="task-name">${task.title}</span>
        <div class="task-card-actions">
          ${statusBadge(task.status)}
          <svg class="task-lock-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
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

function statusBadge(status) {
  const map = {
    todo:      { label: "Nie zrobione",   cls: "status-todo" },
    reviewing: { label: "Do sprawdzenia", cls: "status-reviewing" },
    done:      { label: "Wykonane",       cls: "status-done" },
  };
  const s = map[status] ?? map.todo;
  return `<span class="task-status-badge ${s.cls}">${s.label}</span>`;
}

init();
