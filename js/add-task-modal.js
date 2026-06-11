import { addTask } from "./store.js";

let modal      = null;
let uid        = null;
let projectCtx = null;

export function setupAddTaskModal(userUid) {
  uid   = userUid;
  modal = document.createElement("div");
  modal.className    = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-box entry-form-box">
      <h2>Nowe zadanie</h2>
      <form id="task-form" novalidate>
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
          <button type="submit" id="btn-submit-task" class="btn-add">Utwórz zadanie</button>
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
    btn.textContent = "Tworzenie…";
    err.textContent = "";
    try {
      await addTask(uid, {
        projectName:  projectCtx,
        title:        document.getElementById("tf-title").value.trim(),
        description:  document.getElementById("tf-desc").value.trim(),
      });
      closeModal();
    } catch (error) {
      err.textContent = "Błąd zapisu: " + error.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Utwórz zadanie";
    }
  });
}

export function openAddTaskModal(projectName) {
  projectCtx = projectName;
  document.getElementById("task-form").reset();
  document.getElementById("task-form-error").textContent = "";
  modal.style.display = "flex";
}

function closeModal() {
  modal.style.display = "none";
}
