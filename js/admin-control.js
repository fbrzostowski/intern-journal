import { requireAuth, logout } from "./auth.js";
import { getAllUsers, updateUserRole, deleteUser } from "./store.js";

const ROLE_LABELS = { setup: "Oczekuje", admin: "Administrator", intern: "Stażysta", inactive: "Nie Aktywny" };

let currentUid = null;

async function init() {
  const { user } = await requireAuth("admin");
  currentUid = user.uid;

  document.getElementById("user-name").textContent = user.displayName ?? user.email;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = ""; }
  document.getElementById("btn-logout").addEventListener("click", logout);

  await renderUsers();
}

async function renderUsers() {
  const list = document.getElementById("user-list");
  list.innerHTML = '<p class="status">Ładowanie…</p>';

  const users = await getAllUsers();
  users.sort((a, b) => {
    const order = { setup: 0, admin: 1, intern: 2, inactive: 3 };
    return (order[a.role] ?? 4) - (order[b.role] ?? 4)
      || (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  list.innerHTML = "";

  users.forEach(u => {
    const isSelf = u.uid === currentUid;
    const row = document.createElement("div");
    row.className = "user-row" + (u.role === "inactive" ? " user-row--inactive" : "");
    row.dataset.uid = u.uid;

    row.innerHTML = `
      <div class="user-row-identity">
        ${u.photoURL
          ? `<img src="${u.photoURL}" class="user-row-avatar" alt="">`
          : `<div class="user-row-avatar user-row-avatar--placeholder"></div>`}
        <div class="user-row-info">
          <span class="user-row-name">${u.name ?? "—"}</span>
          <span class="user-row-email">${u.email}</span>
        </div>
      </div>
      <div class="user-row-actions">
        <select class="user-role-select${isSelf ? " user-role-select--disabled" : ""}"
          ${isSelf ? "disabled" : ""}>
          <option value="setup"    ${u.role === "setup"    ? "selected" : ""}>Oczekuje</option>
          <option value="admin"    ${u.role === "admin"    ? "selected" : ""}>Administrator</option>
          <option value="intern"   ${u.role === "intern"   ? "selected" : ""}>Stażysta</option>
          <option value="inactive" ${u.role === "inactive" ? "selected" : ""}>Nie Aktywny</option>
        </select>
        <button class="btn-delete-user${isSelf ? " btn-delete-user--disabled" : ""}"
          title="Usuń użytkownika" ${isSelf ? "disabled" : ""}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    `;

    if (!isSelf) {
      const select = row.querySelector(".user-role-select");
      select.addEventListener("change", async () => {
        select.disabled = true;
        try {
          await updateUserRole(u.uid, select.value);
          showToast(`Rola zmieniona na: ${ROLE_LABELS[select.value]}`);
        } catch (e) {
          showToast("Błąd: " + e.message, true);
          select.value = u.role;
        } finally {
          select.disabled = false;
        }
      });

      row.querySelector(".btn-delete-user").addEventListener("click", async () => {
        const name = u.name ?? u.email;
        if (!confirm(`Usunąć użytkownika „${name}" wraz ze wszystkimi jego wpisami? Tej operacji nie można cofnąć.`)) return;
        row.classList.add("user-row--deleting");
        try {
          await deleteUser(u.uid);
          row.remove();
          showToast(`Usunięto: ${name}`);
        } catch (e) {
          row.classList.remove("user-row--deleting");
          showToast("Błąd: " + e.message, true);
        }
      });
    }

    list.appendChild(row);
  });
}

function showToast(msg, isError = false) {
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " toast--error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast--visible"));
  setTimeout(() => { t.classList.remove("toast--visible"); setTimeout(() => t.remove(), 300); }, 3000);
}

init();
