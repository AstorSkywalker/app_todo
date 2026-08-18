const state = {
  todos: [],
  editingId: null,
  pendingDeleteId: null
};

const els = {
  board: document.querySelector("#todoBoard"),
  dbStatus: document.querySelector("#dbStatus"),
  dbProfile: document.querySelector("#dbProfile"),
  form: document.querySelector("#todoForm"),
  formMode: document.querySelector("#formMode"),
  formTitle: document.querySelector("#formTitle"),
  todoId: document.querySelector("#todoId"),
  titulo: document.querySelector("#titulo"),
  descripcion: document.querySelector("#descripcion"),
  estado: document.querySelector("#estado"),
  prioridad: document.querySelector("#prioridad"),
  fechaVencimiento: document.querySelector("#fechaVencimiento"),
  usuarioId: document.querySelector("#usuarioId"),
  resetButton: document.querySelector("#resetButton"),
  newTodoButton: document.querySelector("#newTodoButton"),
  filterEstado: document.querySelector("#filterEstado"),
  filterPrioridad: document.querySelector("#filterPrioridad"),
  filterUsuario: document.querySelector("#filterUsuario"),
  filterVencidas: document.querySelector("#filterVencidas"),
  countTotal: document.querySelector("#countTotal"),
  countOpen: document.querySelector("#countOpen"),
  countDone: document.querySelector("#countDone"),
  countOverdue: document.querySelector("#countOverdue"),
  toast: document.querySelector("#toast"),
  deleteDialog: document.querySelector("#deleteDialog"),
  deleteDialogForm: document.querySelector("#deleteDialogForm"),
  deleteDialogMessage: document.querySelector("#deleteDialogMessage"),
  deleteDialogCancel: document.querySelector("#deleteDialogCancel")
};

const labels = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
  cancelada: "Cancelada",
  alta: "Alta",
  media: "Media",
  baja: "Baja"
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    let message = "No se pudo completar la accion.";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-HN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function isOverdue(todo) {
  return Boolean(
    todo.fechaVencimiento &&
      new Date(todo.fechaVencimiento) < new Date() &&
      !["completada", "cancelada"].includes(todo.estado)
  );
}

function priorityClass(prioridad) {
  return prioridad || "media";
}

function estadoClass(estado) {
  if (estado === "completada") return "done";
  if (estado === "cancelada") return "cancel";
  return "estado";
}

function renderSummary() {
  const total = state.todos.length;
  const done = state.todos.filter((todo) => todo.estado === "completada").length;
  const open = state.todos.filter((todo) => !["completada", "cancelada"].includes(todo.estado)).length;
  const overdue = state.todos.filter(isOverdue).length;

  els.countTotal.textContent = total;
  els.countOpen.textContent = open;
  els.countDone.textContent = done;
  els.countOverdue.textContent = overdue;
}

function renderTodos() {
  renderSummary();

  if (state.todos.length === 0) {
    els.board.innerHTML = '<div class="empty-state">No hay tareas con los filtros actuales.</div>';
    return;
  }

  els.board.innerHTML = state.todos
    .map((todo) => {
      const dueText = todo.fechaVencimiento ? `Vence ${formatDate(todo.fechaVencimiento)}` : "Sin fecha limite";
      const overdue = isOverdue(todo);
      const description = todo.descripcion || "Sin descripcion.";

      return `
        <article class="todo-card">
          <div class="card-head">
            <h3 class="todo-title">${escapeHtml(todo.titulo)}</h3>
            <span class="badge ${priorityClass(todo.prioridad)}">${labels[todo.prioridad] || todo.prioridad}</span>
          </div>
          <p class="todo-desc">${escapeHtml(description)}</p>
          <div class="meta-row">
            <span class="badge ${estadoClass(todo.estado)}">${labels[todo.estado] || todo.estado}</span>
            <span class="due ${overdue ? "overdue" : ""}">${dueText}</span>
            ${todo.usuarioId ? `<span class="badge">Usuario ${todo.usuarioId}</span>` : ""}
          </div>
          <div class="card-actions">
            <button class="ghost-button" data-action="edit" data-id="${todo.id}" type="button">Editar</button>
            ${
              todo.estado !== "completada"
                ? `<button class="secondary-button" data-action="done" data-id="${todo.id}" type="button">Completar</button>`
                : `<button class="secondary-button" data-action="reopen" data-id="${todo.id}" type="button">Reabrir</button>`
            }
            <button class="danger-button" data-action="delete" data-id="${todo.id}" type="button">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function queryString() {
  const params = new URLSearchParams();
  if (els.filterEstado.value) params.set("estado", els.filterEstado.value);
  if (els.filterPrioridad.value) params.set("prioridad", els.filterPrioridad.value);
  const usuarioFilter = normalizedUsuarioFilter();
  if (usuarioFilter !== null) params.set("usuarioId", String(usuarioFilter));
  if (els.filterVencidas.checked) params.set("soloVencidas", "1");
  return params.toString();
}

function normalizedUsuarioFilter() {
  const rawValue = els.filterUsuario.valueAsNumber;
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null;
  return rawValue;
}

async function loadTodos() {
  const query = queryString();
  state.todos = await api(`/api/todos${query ? `?${query}` : ""}`);
  renderTodos();
}

function resetForm() {
  state.editingId = null;
  els.form.reset();
  els.todoId.value = "";
  els.estado.value = "pendiente";
  els.prioridad.value = "media";
  els.formMode.textContent = "Nueva";
  els.formTitle.textContent = "Crear tarea";
  els.titulo.focus();
}

function fillForm(todo) {
  state.editingId = todo.id;
  els.todoId.value = todo.id;
  els.titulo.value = todo.titulo || "";
  els.descripcion.value = todo.descripcion || "";
  els.estado.value = todo.estado || "pendiente";
  els.prioridad.value = todo.prioridad || "media";
  els.fechaVencimiento.value = toDatetimeLocal(todo.fechaVencimiento);
  els.usuarioId.value = todo.usuarioId || "";
  els.formMode.textContent = `Editando #${todo.id}`;
  els.formTitle.textContent = "Actualizar tarea";
  els.titulo.focus();
}

function formPayload() {
  return {
    titulo: els.titulo.value.trim(),
    descripcion: els.descripcion.value.trim() || null,
    estado: els.estado.value,
    prioridad: els.prioridad.value,
    fechaVencimiento: els.fechaVencimiento.value || null,
    usuarioId: els.usuarioId.value || null
  };
}

function askDeleteConfirmation(todo) {
  if (!todo) return Promise.resolve(false);

  state.pendingDeleteId = todo.id;
  els.deleteDialogMessage.textContent = `Se eliminara la tarea "${todo.titulo}". Esta accion no se puede deshacer.`;

  if (typeof els.deleteDialog.showModal === "function") {
    els.deleteDialog.showModal();
    return new Promise((resolve) => {
      const handleClose = () => {
        els.deleteDialog.removeEventListener("close", handleClose);
        const confirmed = els.deleteDialog.returnValue === "confirm";
        els.deleteDialog.returnValue = "";
        state.pendingDeleteId = confirmed ? state.pendingDeleteId : null;
        resolve(confirmed);
      };

      els.deleteDialog.addEventListener("close", handleClose, { once: true });
    });
  }

  const confirmed = window.confirm(
    `Se eliminara la tarea "${todo.titulo}". Esta accion no se puede deshacer.`
  );
  state.pendingDeleteId = confirmed ? todo.id : null;
  return Promise.resolve(confirmed);
}

async function saveTodo(event) {
  event.preventDefault();
  const payload = formPayload();

  if (!payload.titulo) {
    showToast("El titulo es obligatorio.");
    return;
  }

  if (state.editingId) {
    await api(`/api/todos/${state.editingId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    showToast("Tarea actualizada.");
  } else {
    await api("/api/todos", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast("Tarea creada.");
  }

  resetForm();
  await loadTodos();
}

async function handleBoardClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const todo = state.todos.find((item) => item.id === id);

  try {
    if (action === "edit" && todo) {
      fillForm(todo);
      return;
    }

    if (action === "done") {
      await api(`/api/todos/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "completada" })
      });
      showToast("Tarea completada.");
    }

    if (action === "reopen") {
      await api(`/api/todos/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "pendiente" })
      });
      showToast("Tarea reabierta.");
    }

    if (action === "delete") {
      const confirmed = await askDeleteConfirmation(todo);
      if (!confirmed) return;

      await api(`/api/todos/${id}`, { method: "DELETE" });
      if (state.editingId === id) resetForm();
      state.pendingDeleteId = null;
      showToast("Tarea eliminada.");
    }

    await loadTodos();
  } catch (error) {
    showToast(error.message);
  }
}

async function checkHealth() {
  try {
    const health = await api("/api/health");
    if (health.profile) els.dbProfile.value = health.profile.name;
    els.dbStatus.classList.remove("error");
    els.dbStatus.classList.add("ok");
    els.dbStatus.lastElementChild.textContent = health.profile
      ? `${health.profile.label} conectada`
      : "Oracle conectado";
  } catch {
    els.dbStatus.classList.remove("ok");
    els.dbStatus.classList.add("error");
    els.dbStatus.lastElementChild.textContent = "Sin conexion";
  }
}

async function loadProfileOptions() {
  const response = await api("/api/db/profile");
  els.dbProfile.innerHTML = response.profiles
    .map((profile) => `<option value="${profile.name}">${profile.label}</option>`)
    .join("");
  els.dbProfile.value = response.active;
}

async function switchProfile() {
  const profile = els.dbProfile.value;
  els.dbStatus.classList.remove("ok", "error");
  els.dbStatus.lastElementChild.textContent = "Cambiando";

  await api("/api/db/profile", {
    method: "PUT",
    body: JSON.stringify({ profile })
  });

  resetForm();
  await checkHealth();
  await loadTodos();
  showToast(`Conexion cambiada a ${els.dbProfile.options[els.dbProfile.selectedIndex].text}.`);
}

async function init() {
  els.form.addEventListener("submit", (event) => {
    saveTodo(event).catch((error) => showToast(error.message));
  });
  els.resetButton.addEventListener("click", resetForm);
  els.newTodoButton.addEventListener("click", resetForm);
  els.board.addEventListener("click", handleBoardClick);
  els.deleteDialog.addEventListener("cancel", () => {
    state.pendingDeleteId = null;
  });
  els.deleteDialogForm.addEventListener("close", () => {
    if (els.deleteDialog.returnValue !== "confirm") {
      state.pendingDeleteId = null;
    }
  });
  els.dbProfile.addEventListener("change", () => {
    switchProfile().catch((error) => {
      showToast(error.message);
      checkHealth().catch(() => {});
    });
  });

  [els.filterEstado, els.filterPrioridad, els.filterUsuario, els.filterVencidas].forEach((input) => {
    input.addEventListener("change", () => loadTodos().catch((error) => showToast(error.message)));
  });
  els.filterUsuario.addEventListener("input", () => loadTodos().catch((error) => showToast(error.message)));

  await loadProfileOptions();
  await checkHealth();
  await loadTodos();
}

init().catch((error) => showToast(error.message));
