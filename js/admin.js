// ── Config ────────────────────────────────────────
let GITHUB_TOKEN = '';
let GITHUB_USER  = '';
let GITHUB_REPO  = '';
let ADMIN_PASSWORD = '';

async function cargarConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error();
    const data = await res.json();
    GITHUB_TOKEN   = data.token;
    GITHUB_USER    = data.user;
    GITHUB_REPO    = data.repo;
    ADMIN_PASSWORD = data.password;
  } catch {
    mostrarToast('Error al cargar la configuración.', 'error');
  }
}

// ── Login ─────────────────────────────────────────
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
    cargarRecetasParaBorrar();
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

document.getElementById('titulo').addEventListener('input', e => {
  document.getElementById('preview-id').textContent = tituloAId(e.target.value) || '—';
});

// ── Cargar categorías para el datalist ───────────
async function cargarCategorias() {
  try {
    const res = await fetch('recetas/index.json');
    const ids = await res.json();
    const recetas = await Promise.all(ids.map(id => fetch(`recetas/${id}.json`).then(r => r.json())));
    const cats = [...new Set(recetas.map(r => r.categoria))].sort();
    document.getElementById('lista-categorias').innerHTML = cats.map(c => `<option value="${c}">`).join('');
  } catch { /* sin categorías previas */ }
}

// ── Cargar recetas en el selector de borrar ───────
let recetasCargadas = []; // cache para el borrado

async function cargarRecetasParaBorrar() {
  try {
    const res = await fetch('recetas/index.json');
    const ids = await res.json();
    const recetas = await Promise.all(ids.map(id => fetch(`recetas/${id}.json`).then(r => r.json())));
    recetasCargadas = recetas.sort((a, b) => a.titulo.localeCompare(b.titulo));

    const select = document.getElementById('select-borrar');
    select.innerHTML = '<option value="">— Elige una receta —</option>' +
      recetasCargadas.map(r => `<option value="${r.id}">${r.titulo}</option>`).join('');
  } catch {
    mostrarToast('Error al cargar la lista de recetas.', 'error');
  }
}

// ── Lógica de borrado ─────────────────────────────
const selectBorrar   = document.getElementById('select-borrar');
const btnBorrar      = document.getElementById('btn-borrar');
const confirmacion   = document.getElementById('confirmacion-borrar');
const nombreABorrar  = document.getElementById('nombre-a-borrar');

selectBorrar.addEventListener('change', () => {
  const haySeleccion = selectBorrar.value !== '';
  btnBorrar.disabled = !haySeleccion;
  confirmacion.hidden = true; // ocultar confirmación si cambia la selección
});

btnBorrar.addEventListener('click', () => {
  const id = selectBorrar.value;
  const receta = recetasCargadas.find(r => r.id === id);
  if (!receta) return;
  nombreABorrar.textContent = `"${receta.titulo}"`;
  confirmacion.hidden = false;
  confirmacion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.getElementById('btn-cancelar-borrar').addEventListener('click', () => {
  confirmacion.hidden = true;
  selectBorrar.value = '';
  btnBorrar.disabled = true;
});

document.getElementById('btn-confirmar-borrar').addEventListener('click', async () => {
  const id = selectBorrar.value;
  const receta = recetasCargadas.find(r => r.id === id);
  if (!receta) return;
  await borrarReceta(receta);
});

async function borrarReceta(receta) {
  const btnTexto = document.getElementById('btn-borrar-texto');
  const btnConfirmar = document.getElementById('btn-confirmar-borrar');
  btnConfirmar.disabled = true;
  btnTexto.textContent = '⏳ Borrando...';

  try {
    const rutaReceta = `recetas/${receta.id}.json`;

    // 1. Obtener SHA del fichero y borrarlo
    const fichero = await githubGet(rutaReceta);
    await githubDelete(rutaReceta, `🗑 Borrar receta: ${receta.titulo}`, fichero.sha);

    // 2. Actualizar index.json
    const indexData = await githubGet('recetas/index.json');
    const indexActual = JSON.parse(decodeURIComponent(escape(atob(indexData.content))));
    const indexNuevo = indexActual.filter(id => id !== receta.id);
    await githubPut(
      'recetas/index.json',
      JSON.stringify(indexNuevo, null, 2),
      `📋 Quitar ${receta.id} del índice`,
      indexData.sha
    );

    mostrarToast(`✅ Receta "${receta.titulo}" borrada. Vercel actualizará en unos segundos.`, 'ok');
    confirmacion.hidden = true;
    selectBorrar.value = '';
    btnBorrar.disabled = true;
    await cargarRecetasParaBorrar(); // refresca el selector

  } catch (err) {
    console.error(err);
    mostrarToast(`❌ Error: ${err.message}`, 'error');
  } finally {
    btnConfirmar.disabled = false;
    btnTexto.textContent = 'Sí, borrar';
  }
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
    content: btoa(unescape(encodeURIComponent(contenido))),
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

async function githubDelete(path, mensaje, sha) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: mensaje, sha, branch: 'main' })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub DELETE ${path} → ${res.status}`);
  }
  return res.json();
}

// ── Guardar receta ────────────────────────────────
let shaParaSobreescribir = null; // SHA del fichero existente si hay que sobreescribir

document.getElementById('form-receta').addEventListener('submit', async e => {
  e.preventDefault();
  await comprobarYGuardar();
});

document.getElementById('btn-confirmar-sobreescribir').addEventListener('click', async () => {
  document.getElementById('confirmacion-sobreescribir').hidden = true;
  await guardarReceta(shaParaSobreescribir);
  shaParaSobreescribir = null;
});

document.getElementById('btn-cancelar-sobreescribir').addEventListener('click', () => {
  document.getElementById('confirmacion-sobreescribir').hidden = true;
  shaParaSobreescribir = null;
});

async function comprobarYGuardar() {
  const titulo = document.getElementById('titulo').value.trim();
  const id = tituloAId(titulo);
  const rutaReceta = `recetas/${id}.json`;

  // Comprobar si ya existe
  try {
    const existente = await githubGet(rutaReceta);
    // Existe — pedir confirmación
    shaParaSobreescribir = existente.sha;
    document.getElementById('nombre-sobreescribir').textContent = `"${titulo}"`;
    const confirmacion = document.getElementById('confirmacion-sobreescribir');
    confirmacion.hidden = false;
    confirmacion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {
    // No existe — guardar directamente
    await guardarReceta(null);
  }
}

async function guardarReceta(shaReceta) {
  const btn = document.getElementById('btn-guardar');
  const btnTexto = document.getElementById('btn-texto');
  btn.disabled = true;
  btnTexto.textContent = '⏳ Guardando...';

  try {
    const titulo      = document.getElementById('titulo').value.trim();
    const categoria   = document.getElementById('categoria').value.trim();
    const tiempo      = document.getElementById('tiempo').value.trim();
    const raciones    = parseInt(document.getElementById('raciones').value) || null;
    const fuente      = document.getElementById('fuente').value.trim();
    const descripcion = document.getElementById('descripcion').value.trim();
    const ingredientes = document.getElementById('ingredientes').value
      .split('\n').map(l => l.trim()).filter(Boolean);
    const pasos = document.getElementById('pasos').value
      .split('\n').map(l => l.trim()).filter(Boolean);
    const notas = document.getElementById('notas').value.trim();

    const id = tituloAId(titulo);
    const receta = { id, titulo, categoria };
    if (tiempo)      receta.tiempo = tiempo;
    if (raciones)    receta.raciones = raciones;
    if (descripcion) receta.descripcion = descripcion;
    if (fuente)      receta.fuente = fuente;
    receta.ingredientes = ingredientes;
    receta.pasos = pasos;
    if (notas)       receta.notas = notas;

    const jsonReceta  = JSON.stringify(receta, null, 2);
    const rutaReceta  = `recetas/${id}.json`;

    btnTexto.textContent = '⏳ Subiendo receta...';
    await githubPut(rutaReceta, jsonReceta, `✨ Nueva receta: ${titulo}`, shaReceta);

    btnTexto.textContent = '⏳ Actualizando índice...';
    const indexData   = await githubGet('recetas/index.json');
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
    await cargarRecetasParaBorrar(); // actualiza el selector de borrar

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
