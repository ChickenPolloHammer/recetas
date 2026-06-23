// ── Config ────────────────────────────────────────
// Estas variables las inyecta Vercel en el momento del build
// a través de un endpoint serverless (api/config.js)
let GITHUB_TOKEN = '';
let GITHUB_USER = '';
let GITHUB_REPO = '';
let ADMIN_PASSWORD = '';

// ── Login ─────────────────────────────────────────
async function cargarConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error();
    const data = await res.json();
    GITHUB_TOKEN = data.token;
    GITHUB_USER  = data.user;
    GITHUB_REPO  = data.repo;
    ADMIN_PASSWORD = data.password;
  } catch {
    mostrarToast('Error al cargar la configuración.', 'error');
  }
}

document.getElementById('btn-login').addEventListener('click', verificarPassword);
document.getElementById('input-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') verificarPassword();
});

function verificarPassword() {
  const val = document.getElementById('input-password').value;
  if (val === ADMIN_PASSWORD) {
    document.getElementById('pantalla-login').hidden = true;
    document.getElementById('pantalla-admin').hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    cargarCategorias();
    document.getElementById('titulo').focus();
  } else {
    document.getElementById('login-error').hidden = false;
    document.getElementById('input-password').value = '';
    document.getElementById('input-password').focus();
  }
}

// ── Generar ID desde título ───────────────────────
function tituloAId(titulo) {
  return titulo
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

document.getElementById('titulo').addEventListener('input', e => {
  document.getElementById('preview-id').textContent = tituloAId(e.target.value) || '—';
});

// ── Cargar categorías existentes para el datalist ─
async function cargarCategorias() {
  try {
    const res = await fetch('recetas/index.json');
    const ids = await res.json();
    const recetas = await Promise.all(ids.map(id => fetch(`recetas/${id}.json`).then(r => r.json())));
    const cats = [...new Set(recetas.map(r => r.categoria))].sort();
    const datalist = document.getElementById('lista-categorias');
    datalist.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  } catch { /* sin categorías previas */ }
}

// ── GitHub API ────────────────────────────────────
async function githubGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  return res.json();
}

async function githubPut(path, contenido, mensaje, sha = null) {
  const body = {
    message: mensaje,
    content: btoa(unescape(encodeURIComponent(contenido))), // UTF-8 safe base64
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub PUT ${path} → ${res.status}`);
  }
  return res.json();
}

// ── Guardar receta ────────────────────────────────
document.getElementById('form-receta').addEventListener('submit', async e => {
  e.preventDefault();
  await guardarReceta();
});

async function guardarReceta() {
  const btn = document.getElementById('btn-guardar');
  const btnTexto = document.getElementById('btn-texto');
  btn.disabled = true;
  btnTexto.textContent = '⏳ Guardando...';

  try {
    // Construir objeto receta
    const titulo    = document.getElementById('titulo').value.trim();
    const categoria = document.getElementById('categoria').value.trim();
    const tiempo    = document.getElementById('tiempo').value.trim();
    const raciones  = parseInt(document.getElementById('raciones').value) || null;
    const fuente    = document.getElementById('fuente').value.trim();
    const descripcion = document.getElementById('descripcion').value.trim();
    const ingredientes = document.getElementById('ingredientes').value
      .split('\n').map(l => l.trim()).filter(Boolean);
    const pasos = document.getElementById('pasos').value
      .split('\n').map(l => l.trim()).filter(Boolean);
    const notas = document.getElementById('notas').value.trim();

    const id = tituloAId(titulo);

    const receta = { id, titulo, categoria };
    if (tiempo)    receta.tiempo = tiempo;
    if (raciones)  receta.raciones = raciones;
    if (descripcion) receta.descripcion = descripcion;
    if (fuente)    receta.fuente = fuente;
    receta.ingredientes = ingredientes;
    receta.pasos = pasos;
    if (notas)     receta.notas = notas;

    const jsonReceta = JSON.stringify(receta, null, 2);
    const rutaReceta = `recetas/${id}.json`;

    // 1. Subir el fichero de la receta
    btnTexto.textContent = '⏳ Subiendo receta...';
    let shaReceta = null;
    try {
      const existente = await githubGet(rutaReceta);
      shaReceta = existente.sha; // si ya existe, necesitamos el SHA para sobreescribir
    } catch { /* nueva receta, sin SHA */ }

    await githubPut(rutaReceta, jsonReceta, `✨ Nueva receta: ${titulo}`, shaReceta);

    // 2. Actualizar index.json
    btnTexto.textContent = '⏳ Actualizando índice...';
    const indexData = await githubGet('recetas/index.json');
    const indexActual = JSON.parse(decodeURIComponent(escape(atob(indexData.content))));

    if (!indexActual.includes(id)) {
      indexActual.push(id);
      await githubPut(
        'recetas/index.json',
        JSON.stringify(indexActual, null, 2),
        `📋 Añadir ${id} al índice`,
        indexData.sha
      );
    }

    mostrarToast(`✅ Receta "${titulo}" guardada. Vercel la desplegará en unos segundos.`, 'ok');
    document.getElementById('form-receta').reset();
    document.getElementById('preview-id').textContent = '—';

  } catch (err) {
    console.error(err);
    mostrarToast(`❌ Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btnTexto.textContent = '💾 Guardar receta';
  }
}

// ── Toast ─────────────────────────────────────────
function mostrarToast(msg, tipo = 'ok') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${tipo}`;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 5000);
}

// ── Init ──────────────────────────────────────────
cargarConfig();
