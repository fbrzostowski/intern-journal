import { getAllUsers, updateTaskMembers, transferTaskOwnership } from "./store.js";

let modal   = null;
let context = null;
let allUsers = [];

export function setupMembersModal() {
  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box members-modal-box">
      <div class="members-modal-header">
        <h2>Zarządzaj dostępem</h2>
        <button type="button" id="btn-close-members" class="btn-modal-close" title="Zamknij">✕</button>
      </div>
      <div id="members-content"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-close-members").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
}

export async function openMembersModal({ task, currentUser, currentUserRole }) {
  context = { task, currentUser, currentUserRole };
  try { allUsers = await getAllUsers(); } catch (_) {}
  modal.style.display = "flex";
  render();
}

export function updateMembersModal({ task, currentUser, currentUserRole }) {
  if (!modal || modal.style.display === "none") return;
  context = { task, currentUser, currentUserRole };
  render();
}

function closeModal() {
  modal.style.display = "none";
}

function render() {
  if (!context) return;
  const { task, currentUser, currentUserRole } = context;
  const content = document.getElementById("members-content");
  if (!content) return;

  const isManager  = currentUserRole === "admin" || task.uid === currentUser.uid;
  const members    = task.members || {};
  const memberList = Object.entries(members);

  // Owner row
  const ownerData   = allUsers.find(u => u.uid === task.uid);
  const ownerName   = displayName(ownerData);
  const ownerAvatar = avatarHtml(ownerData, ownerName);

  const canRemoveOwner = currentUserRole === "admin" && task.uid !== currentUser.uid;

  // Members rows
  let membersSection = "";
  if (memberList.length) {
    const rows = memberList.map(([uid, role]) => {
      const ud   = allUsers.find(u => u.uid === uid);
      const name = displayName(ud);
      return `
        <div class="member-row">
          <div class="member-info">
            ${avatarHtml(ud, name)}
            <span class="member-name">${name}</span>
          </div>
          <div class="member-actions">
            ${isManager ? `
              <select class="member-role-select" data-uid="${uid}">
                <option value="read"  ${role === "read"  ? "selected" : ""}>Odczyt</option>
                <option value="write" ${role === "write" ? "selected" : ""}>Edycja</option>
              </select>
              <button type="button" class="btn-remove-member" data-uid="${uid}" title="Usuń">✕</button>
            ` : `
              <span class="member-role-badge">${role === "write" ? "Edycja" : "Odczyt"}</span>
            `}
          </div>
        </div>
      `;
    }).join("");

    membersSection = `
      <div class="members-section">
        <h3 class="members-section-label">Członkowie</h3>
        ${rows}
      </div>
    `;
  }

  // Add member form
  const existingUids   = new Set([task.uid, ...Object.keys(members)]);
  const availableUsers = allUsers.filter(u =>
    !existingUids.has(u.uid) && (u.role === "intern" || !u.role)
  );

  let addSection = "";
  if (isManager) {
    if (availableUsers.length) {
      const options = availableUsers.map(u =>
        `<option value="${u.uid}">${displayName(u)}</option>`
      ).join("");
      addSection = `
        <div class="members-section">
          <h3 class="members-section-label">Dodaj stażystę</h3>
          <div class="add-member-form">
            <select id="new-member-select">
              <option value="">Wybierz…</option>
              ${options}
            </select>
            <select id="new-member-role">
              <option value="read">Odczyt</option>
              <option value="write">Edycja</option>
            </select>
            <button type="button" id="btn-add-member" class="btn-add btn-add-member">Dodaj</button>
          </div>
          <p id="members-error" class="form-error"></p>
        </div>
      `;
    } else {
      addSection = `
        <div class="members-section">
          <p class="members-no-users">Wszyscy stażyści już mają dostęp.</p>
        </div>
      `;
    }
  }

  content.innerHTML = `
    <div class="members-section">
      <h3 class="members-section-label">Właściciel</h3>
      <div class="member-row">
        <div class="member-info">
          ${ownerAvatar}
          <span class="member-name">${ownerName}</span>
        </div>
        <div class="member-actions">
          <span class="member-role-badge owner-badge">Właściciel</span>
          ${canRemoveOwner ? `
            <button type="button" class="btn-remove-member btn-remove-owner" data-uid="${task.uid}" title="Przejmij własność">✕</button>
          ` : ""}
        </div>
      </div>
    </div>
    ${membersSection}
    ${addSection}
  `;

  // Events: role change
  content.querySelectorAll(".member-role-select").forEach(sel => {
    sel.addEventListener("change", async (e) => {
      const uid  = e.target.dataset.uid;
      const role = e.target.value;
      try { await updateTaskMembers(context.task.id, uid, role); }
      catch (err) { alert("Błąd: " + err.message); }
    });
  });

  // Events: remove member / owner
  content.querySelectorAll(".btn-remove-member").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid       = btn.dataset.uid;
      const isOwnerOp = btn.classList.contains("btn-remove-owner");
      if (isOwnerOp) {
        if (!confirm("Usunąć właściciela? Zostaniesz nowym właścicielem zadania.")) return;
        try { await transferTaskOwnership(context.task.id, currentUser.uid); }
        catch (err) { alert("Błąd: " + err.message); }
      } else {
        if (!confirm("Usunąć tego stażystę z zadania?")) return;
        try { await updateTaskMembers(context.task.id, uid, null); }
        catch (err) { alert("Błąd: " + err.message); }
      }
    });
  });

  // Events: add member
  const btnAddMember = document.getElementById("btn-add-member");
  if (btnAddMember) {
    btnAddMember.addEventListener("click", async () => {
      const uid    = document.getElementById("new-member-select").value;
      const role   = document.getElementById("new-member-role").value;
      const errEl  = document.getElementById("members-error");
      if (!uid) { errEl.textContent = "Wybierz stażystę."; return; }
      btnAddMember.disabled = true;
      errEl.textContent = "";
      try { await updateTaskMembers(context.task.id, uid, role); }
      catch (err) { errEl.textContent = "Błąd: " + err.message; }
      finally { btnAddMember.disabled = false; }
    });
  }
}

function displayName(userData) {
  if (!userData) return "Stażysta";
  return userData.displayName || userData.name || userData.email || "Stażysta";
}

function avatarHtml(userData, name) {
  if (userData?.photoURL) {
    return `<img src="${userData.photoURL}" class="member-avatar" referrerpolicy="no-referrer" alt="">`;
  }
  const initial = (name || "?")[0].toUpperCase();
  return `<div class="member-initials">${initial}</div>`;
}
