const STORE = "impulso-platform-v1";
const initialState = {
  users: [{ id: "admin", name: "Administrador", username: "admin", password: "admin123", role: "administrador" }],
  campaign: { name: "Lanzamiento de producto", dates: "1 — 30 noviembre 2026" }
};
let state = loadState();
let currentUser = null;
let activePage = "dashboard";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved?.users?.length) return saved;
  } catch (_) {}
  localStorage.setItem(STORE, JSON.stringify(initialState));
  return structuredClone(initialState);
}
function persist() { localStorage.setItem(STORE, JSON.stringify(state)); }
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function initials(name) { return name.split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase(); }
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function renderLogin() {
  document.querySelector("#app").innerHTML = `
    <div class="login-page">
      <section class="login-art">
        <div class="brand"><span class="brand-mark">↗</span> Resultados UVP</div>
        <div class="art-copy"><div class="eyebrow">Marketing · Analítica</div><h1>Decisiones<br>que impulsan<br>resultados.</h1><p>Un espacio para consultar el impacto de tus campañas y trabajar en equipo con claridad.</p></div>
        <div class="art-foot">© 2026 Resultados UVP · Plataforma privada</div>
      </section>
      <section class="login-side"><form class="login-card" id="login-form">
        <div class="eyebrow" style="color:#6f8d70;margin-bottom:13px">BIENVENIDO/A</div>
        <h2>Inicia sesión</h2><p class="muted">Ingresa tus credenciales para continuar.</p>
        <div class="field"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" required placeholder="Tu nombre de usuario"></div>
        <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Tu contraseña"></div>
        <div class="login-error" id="login-error"></div><button class="primary full">Entrar a la plataforma</button>
      </form></section>
    </div>`;
  document.querySelector("#login-form").addEventListener("submit", e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const user = state.users.find(u => u.username.toLowerCase() === String(data.get("username")).trim().toLowerCase() && u.password === data.get("password"));
    if (!user) { document.querySelector("#login-error").textContent = "Usuario o contraseña incorrectos."; return; }
    currentUser = user; activePage = "dashboard"; render();
  });
}
function render() {
  if (!currentUser) return renderLogin();
  document.querySelector("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">↗</span> Resultados UVP</div>
        <div class="nav-label">Workspace</div>
        <button class="nav-item ${activePage==="dashboard"?"active":""}" data-page="dashboard"><span class="nav-icon">▦</span> Resumen de campaña</button>
        ${currentUser.role === "administrador" ? `<div class="nav-label" style="margin-top:25px">Administración</div><button class="nav-item ${activePage==="users"?"active":""}" data-page="users"><span class="nav-icon">♙</span> Gestión de usuarios</button>` : ""}
        <div class="side-bottom"><div class="user-mini"><div class="avatar">${initials(currentUser.name)}</div><div><strong>${escapeHTML(currentUser.name)}</strong><small>${escapeHTML(currentUser.role)}</small></div></div><button class="nav-item logout" id="logout"><span class="nav-icon">↪</span> Cerrar sesión</button></div>
      </aside>
      <section class="main"><header class="topbar"><div class="crumb">Workspace <span style="padding:0 8px;color:#c2c7c9">/</span> ${activePage==="users"?"Usuarios":"Campañas"}</div><div class="topbar-right"><span class="live">Sistema activo</span><div class="avatar">${initials(currentUser.name)}</div></div></header>
      <div class="content">${activePage === "users" ? usersPage() : dashboardPage()}</div></section>
    </div>`;
  document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => { activePage = btn.dataset.page; render(); }));
  document.querySelector("#logout").addEventListener("click", () => { currentUser = null; render(); });
  const add = document.querySelector("#add-user");
  if (add) add.addEventListener("click", () => showUserModal());
  const editCampaign = document.querySelector("#edit-campaign");
  if (editCampaign) editCampaign.addEventListener("click", showCampaignModal);
  document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteUser(btn.dataset.delete)));
  document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => showUserModal(state.users.find(u => u.id === btn.dataset.edit))));
}
function dashboardPage() {
  return `<iframe class="uvp-dashboard" src="Dashboard_UVP_actualizado.html" title="Dashboard UVP actualizado"></iframe>`;
}
function metric(label,value,trend,desc,icon) { return `<article class="metric"><div class="metric-top">${label}<span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span class="positive">${trend} ${desc.split(" vs.")[0]}</span> ${desc.includes("vs.")?"vs. periodo anterior":""}</div></article>`; }
function source(name,width,count) { return `<div class="source-row"><strong>${name}</strong><div class="bar"><span style="width:${width}%"></span></div><em>${count}</em></div>`; }
function usersPage() {
  const rows = state.users.map(u => `<tr><td><div style="display:flex;align-items:center;gap:10px"><div class="avatar">${initials(u.name)}</div><strong>${escapeHTML(u.name)}</strong></div></td><td>${escapeHTML(u.username)}</td><td><span class="role-badge">${escapeHTML(u.role)}</span></td><td>${u.id==="admin"?"Cuenta inicial":"Usuario"}</td><td><div class="actions"><button class="secondary" data-edit="${escapeHTML(u.id)}">Editar</button>${u.id!=="admin"?`<button class="danger" data-delete="${escapeHTML(u.id)}">Eliminar</button>`:""}</div></td></tr>`).join("");
  return `<div class="page-head"><div><div class="eyebrow" style="color:#779278;margin-bottom:8px">ADMINISTRACIÓN</div><h1>Gestión de usuarios</h1><p>Crea accesos y define qué puede hacer cada persona.</p></div><button class="primary btn-small" id="add-user">＋ Añadir usuario</button></div>
    <section class="panel"><div class="panel-heading"><div><h3>Personas con acceso</h3><p>${state.users.length} usuario${state.users.length===1?"":"s"} en la plataforma</p></div></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <div class="hint" style="margin-top:16px"><strong>Lector:</strong> consulta la información. &nbsp; <strong>Editor:</strong> consulta y puede modificar contenido. &nbsp; <strong>Administrador:</strong> acceso completo y gestión de usuarios.</div>`;
}
function showUserModal(user = null) {
  const editing = !!user;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<form class="modal" id="user-form"><h2>${editing?"Editar usuario":"Añadir usuario"}</h2><p>${editing?"Actualiza los datos y permisos de esta cuenta.":"Crea credenciales para una persona nueva."}</p>
    <div class="field"><label>Nombre completo</label><input name="name" required value="${escapeHTML(user?.name||"")}" placeholder="Ej. María López"></div>
    <div class="field"><label>Nombre de usuario</label><input name="username" required value="${escapeHTML(user?.username||"")}" placeholder="Ej. maria.lopez" autocomplete="off"></div>
    <div class="field"><label>${editing?"Nueva contraseña (opcional)":"Contraseña"}</label><input name="password" type="password" ${editing?"":"required"} minlength="6" placeholder="${editing?"Dejar en blanco para conservarla":"Mínimo 6 caracteres"}" autocomplete="new-password"></div>
    <div class="field"><label>Rol</label><select name="role"><option value="lector" ${user?.role==="lector"?"selected":""}>Lector — solo consulta</option><option value="editor" ${user?.role==="editor"?"selected":""}>Editor — puede editar contenido</option><option value="administrador" ${user?.role==="administrador"?"selected":""}>Administrador — acceso completo</option></select></div>
    <div class="login-error" id="modal-error"></div><div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancelar</button><button class="primary btn-small">${editing?"Guardar cambios":"Crear usuario"}</button></div></form>`;
  document.body.append(backdrop);
  backdrop.querySelector("#cancel-modal").onclick = () => backdrop.remove();
  backdrop.addEventListener("click", e => { if(e.target===backdrop) backdrop.remove(); });
  backdrop.querySelector("form").addEventListener("submit", e => {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    const username = String(data.get("username")).trim();
    if(state.users.some(u=>u.username.toLowerCase()===username.toLowerCase()&&u.id!==user?.id)) { backdrop.querySelector("#modal-error").textContent="Ese nombre de usuario ya está en uso."; return; }
    if(editing) {
      user.name=String(data.get("name")).trim(); user.username=username; user.role=data.get("role");
      if(data.get("password")) user.password=data.get("password");
    } else state.users.push({id:crypto.randomUUID(),name:String(data.get("name")).trim(),username,password:data.get("password"),role:data.get("role")});
    persist(); backdrop.remove(); render(); toast(editing?"Usuario actualizado":"Usuario creado correctamente");
  });
}
function deleteUser(id) {
  const user=state.users.find(u=>u.id===id);
  if(!user || !confirm(`¿Eliminar el acceso de ${user.name}? Esta acción no se puede deshacer.`)) return;
  state.users=state.users.filter(u=>u.id!==id);persist();render();toast("Usuario eliminado");
}
function showCampaignModal() {
  const backdrop=document.createElement("div");
  backdrop.className="modal-backdrop";
  backdrop.innerHTML=`<form class="modal" id="campaign-form"><h2>Editar campaña</h2><p>Actualiza la información principal que aparece en el resumen.</p>
    <div class="field"><label>Nombre de la campaña</label><input name="name" required value="${escapeHTML(state.campaign.name)}"></div>
    <div class="field"><label>Periodo</label><input name="dates" required value="${escapeHTML(state.campaign.dates)}"></div>
    <div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancelar</button><button class="primary btn-small">Guardar cambios</button></div></form>`;
  document.body.append(backdrop);
  backdrop.querySelector("#cancel-modal").onclick=()=>backdrop.remove();
  backdrop.addEventListener("click",e=>{if(e.target===backdrop)backdrop.remove();});
  backdrop.querySelector("form").addEventListener("submit",e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);
    state.campaign.name=String(data.get("name")).trim();state.campaign.dates=String(data.get("dates")).trim();
    persist();backdrop.remove();render();toast("Campaña actualizada");
  });
}
render();
