import { addTask } from "./store.js";

let modal        = null;
let ownerUid     = null;
let projectCtx   = null;
let contextUsers = null; // jeśli podane → tryb admina z polem wykonawcy

export function setupAddTaskModal(userUid, { allUsers } = {}) {
  ownerUid     = userUid;
  contextUsers = allUsers || null;

  const isAdmin  = !!contextUsers;
  const title    = isAdmin ? "Zleć zadanie" : "Nowe zadanie";
  const submitLbl = isAdmin ? "Zleć zadanie" : "Utwórz zadanie";

  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box">
      <h2>${title}</h2>
      <form id="task-form" novalidate>
        ${isAdmin ? `
          <div class="form-group">
            <label for="tf-assignee">Wykonawca</label>
            <select id="tf-assignee"></select>
          </div>
        ` : ""}
        <div class="form-group">
          <label for="tf-title">Tytuł zadania *</label>
          <input type="text" id="tf-title" required placeholder="Np. Integracja API">
        </div>
        <div class="form-group">
          <label for="tf-desc">Opis</label>
          <textarea id="tf-desc" rows="3" placeholder="Czym jest to zadanie?"></textarea>
        </div>
        <p id="task-form-error" class="form-error"></p>
        <div class="form-actions">
          <button type="button" id="btn-cancel-task" class="btn-secondary">Anuluj</button>
          <button type="submit" id="btn-submit-task" class="btn-add">${submitLbl}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-cancel-task").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  document.getElementById("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-task");
    const err = document.getElementById("task-form-error");
    btn.disabled = true;
    btn.textContent = "Zapisywanie…";
    err.textContent = "";

    let taskOwnerUid = ownerUid;
    if (contextUsers) {
      const sel = document.getElementById("tf-assignee");
      if (sel?.value) taskOwnerUid = sel.value;
    }

    try {
      await addTask(taskOwnerUid, {
        projectName:  projectCtx,
        title:        document.getElementById("tf-title").value.trim(),
        description:  document.getElementById("tf-desc").value.trim(),
        status:       "todo",
      });
      closeModal();
    } catch (error) {
      err.textContent = "Błąd zapisu: " + error.message;
    } finally {
      btn.disabled = false;
      btn.textContent = contextUsers ? "Zleć zadanie" : "Utwórz zadanie";
    }
  });
}

export function openAddTaskModal(projectName, { defaultUid } = {}) {
  projectCtx = projectName;
  document.getElementById("task-form").reset();
  document.getElementById("task-form-error").textContent = "";

  if (contextUsers) {
    const sel = document.getElementById("tf-assignee");
    sel.innerHTML = "";

    // Stażyści najpierw
    const interns = contextUsers.filter(u =>
      u.role === "intern" && u.uid !== ownerUid
    );
    interns.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.uid;
      opt.textContent = u.displayName || u.name || u.email || u.uid;
      sel.appendChild(opt);
    });

    // Admin (ja) na dole
    const meData  = contextUsers.find(u => u.uid === ownerUid);
    const meName  = meData?.displayName || meData?.name || meData?.email || "Ja";
    const meOpt   = document.createElement("option");
    meOpt.value       = ownerUid;
    meOpt.textContent = `${meName} (Ty)`;
    sel.appendChild(meOpt);

    // Domyślny wykonawca: wybrany stażysta z pickera, albo pierwszy stażysta
    if (defaultUid && sel.querySelector(`option[value="${defaultUid}"]`)) {
      sel.value = defaultUid;
    } else if (interns.length) {
      sel.value = interns[0].uid;
    }
  }

  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}
