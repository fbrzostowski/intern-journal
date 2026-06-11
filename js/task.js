import { requireAuth } from "./auth.js";
import { subscribeTaskEntries, subscribeTask, updateTaskStatus, getAllUsers, chartGridColor } from "./store.js";
import { setupEditModal, openEditModal } from "./edit-modal.js";
import { setupAddModal, openAddModal } from "./add-entry-modal.js";
import { setupMembersModal, openMembersModal, updateMembersModal } from "./task-members-modal.js";

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

async function init() {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("id");
  if (!taskId) { window.location.href = "index.html"; return; }

  const { user, role } = await requireAuth();

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }

  setupEditModal();
  setupAddModal(user.uid);
  setupMembersModal();

  const usersMap = new Map();
  try {
    const users = await getAllUsers();
    users.forEach(u => usersMap.set(u.uid, u));
  } catch (_) {}

  let currentAccess  = null;
  let pendingEntries = null;

  function getAccess(task) {
    if (role === "admin")          return "admin";
    if (task.uid === user.uid)     return "owner";
    const m = task.members?.[user.uid];
    if (m)                         return m; // "read" | "write"
    return null;
  }

  function canWrite(access) {
    return access === "owner" || access === "write";
  }

  subscribeTask(taskId, (task) => {
    if (!task) { window.location.href = "index.html"; return; }

    currentAccess = getAccess(task);

    if (!currentAccess) {
      window.location.href = task.projectName
        ? `project.html?name=${encodeURIComponent(task.projectName)}`
        : "index.html";
      return;
    }

    document.getElementById("task-title").textContent = task.title;
    document.getElementById("btn-back").href = `project.html?name=${encodeURIComponent(task.projectName)}`;
    document.title = `Zadanie: ${task.title}`;

    // "Dodaj wpis"
    const btnAdd = document.getElementById("btn-add-entry");
    if (canWrite(currentAccess)) {
      btnAdd.style.display = "";
      btnAdd.onclick = () => openAddModal({ taskId, taskTitle: task.title, projectName: task.projectName });
    } else {
      btnAdd.style.display = "none";
    }

    // "Dostęp" (zarządzaj memberami)
    const btnManage = document.getElementById("btn-manage-members");
    if (currentAccess === "owner" || currentAccess === "admin") {
      btnManage.style.display = "";
      btnManage.onclick = () => openMembersModal({ task, currentUser: user, currentUserRole: role });
    } else {
      btnManage.style.display = "none";
    }

    // Aktualizuj modal memberów jeśli otwarty
    updateMembersModal({ task, currentUser: user, currentUserRole: role });

    // Status badge
    const s = STATUS_MAP[task.status] ?? STATUS_MAP.todo;
    let badge = document.getElementById("task-status-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "task-status-badge";
      document.getElementById("task-title").after(badge);
    }
    badge.textContent = s.label;
    badge.className   = `task-status-badge ${s.cls}`;

    // "Oznacz jako skończone"
    let btnDone = document.getElementById("btn-mark-done");
    if (task.status === "todo" && canWrite(currentAccess)) {
      if (!btnDone) {
        btnDone = document.createElement("button");
        btnDone.id        = "btn-mark-done";
        btnDone.className = "btn-mark-done";
        btnDone.textContent = "Oznacz jako skończone";
        document.getElementById("btn-add-entry").insertAdjacentElement("beforebegin", btnDone);
        btnDone.addEventListener("click", async () => {
          btnDone.disabled = true;
          await updateTaskStatus(taskId, "reviewing");
        });
      }
    } else {
      btnDone?.remove();
    }

    // Odblokuj oczekujące wpisy
    if (pendingEntries !== null) {
      renderEntries(pendingEntries, user, currentAccess, usersMap);
      pendingEntries = null;
    }
  });

  subscribeTaskEntries(taskId, (entries) => {
    if (currentAccess === null) {
      pendingEntries = entries;
    } else {
      renderEntries(entries, user, currentAccess, usersMap);
    }
  });
}

function renderEntries(entries, user, access, usersMap = new Map()) {
  const canEdit = access === "owner" || access === "write";

  if (!entries.length) {
    document.getElementById("total-hours").textContent =
      canEdit ? "Brak wpisów — kliknij «+ Dodaj wpis» żeby zacząć." : "Brak wpisów.";
    document.getElementById("charts-grid").innerHTML = "";
    return;
  }

  const total = entries.reduce((s, e) => s + e.hours, 0);
  document.getElementById("total-hours").textContent =
    `${Math.round(total * 10) / 10}h łącznie · ${entries.length} ${plural(entries.length)}`;

  const grid = document.getElementById("charts-grid");
  grid.innerHTML = "";

  entries.forEach((entry, i) => {
    const dateObj = new Date(entry.date + "T12:00:00");
    const dateStr = dateObj.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

    const showEdit   = canEdit && entry.uid === user.uid;
    const authorData = usersMap.get(entry.uid);
    const authorName = authorData
      ? (authorData.displayName || authorData.name || authorData.email || "Stażysta")
      : "Stażysta";
    const authorAvatar = authorData?.photoURL
      ? `<img src="${authorData.photoURL}" class="entry-author-avatar" referrerpolicy="no-referrer" alt="">`
      : `<div class="entry-author-initials">${authorName[0].toUpperCase()}</div>`;

    const wrap = document.createElement("div");
    wrap.className = "chart-wrap entry-card";
    wrap.innerHTML = `
      <div class="entry-info">
        <div class="entry-header">
          <span class="entry-title">${entry.title}</span>
          <div class="entry-header-right">
            <span class="entry-hours">${entry.hours}h</span>
            ${showEdit ? `
              <button class="btn-edit-entry" title="Edytuj wpis">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            ` : ""}
          </div>
        </div>
        <div class="entry-meta">
          <a href="day.html?date=${entry.date}" class="entry-date-link">${dateStr}</a>
          <div class="entry-author">
            ${authorAvatar}
            <span class="entry-author-name">${authorName}</span>
          </div>
        </div>
        ${entry.description ? `<p class="entry-desc">${entry.description}</p>` : ""}
      </div>
      <div class="entry-canvas-wrap">
        <canvas id="chart-entry-${i}"></canvas>
      </div>
    `;
    if (showEdit) {
      wrap.querySelector(".btn-edit-entry").addEventListener("click", () => openEditModal(entry));
    }
    grid.appendChild(wrap);

    new Chart(document.getElementById(`chart-entry-${i}`).getContext("2d"), {
      type: "bar",
      data: {
        labels:   CATEGORIES.map(c => c.label),
        datasets: [{
          data:            CATEGORIES.map(c => entry.ratings[c.key]),
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
  });
}

function plural(n) {
  if (n === 1) return "wpis";
  if (n < 5)   return "wpisy";
  return "wpisów";
}

init();
