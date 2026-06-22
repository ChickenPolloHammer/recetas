// ── Estado ────────────────────────────────────────
let todasLasRecetas = [];
let categoriaActiva = 'Todas';
let textoBusqueda = '';

// ── Carga de recetas ──────────────────────────────
async function cargarRecetas() {
  // Carga el índice de IDs
  const res = await fetch('recetas/index.json');
  const ids = await res.json();

  // Carga cada receta en paralelo
  const promesas = ids.map(id =>
    fetch(`recetas/${id}.json`).then(r => r.json())
  );
  todasLasRecetas = await Promise.all(promesas);

  renderFiltros();
  renderGrid();
}

// ── Filtros de categoría ──────────────────────────
function renderFiltros() {
  const categorias = ['Todas', ...new Set(todasLasRecetas.map(r => r.categoria))];
  const contenedor = document.getElementById('filtros');
  contenedor.innerHTML = categorias.map(cat => `
    <button class="filtro-btn ${cat === categoriaActiva ? 'activo' : ''}"
            data-cat="${cat}">${cat}</button>
  `).join('');

  contenedor.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      categoriaActiva = btn.dataset.cat;
      contenedor.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      renderGrid();
    });
  });
}

// ── Grid de tarjetas ──────────────────────────────
function recetasFiltradas() {
  return todasLasRecetas.filter(r => {
    const matchCat = categoriaActiva === 'Todas' || r.categoria === categoriaActiva;
    const q = textoBusqueda.toLowerCase();
    const matchTexto = !q ||
      r.titulo.toLowerCase().includes(q) ||
      r.categoria.toLowerCase().includes(q) ||
      (r.ingredientes || []).some(i => i.toLowerCase().includes(q)) ||
      (r.descripcion || '').toLowerCase().includes(q);
    return matchCat && matchTexto;
  });
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const sinRes = document.getElementById('sin-resultados');
  const lista = recetasFiltradas();

  if (lista.length === 0) {
    grid.innerHTML = '';
    sinRes.hidden = false;
    return;
  }
  sinRes.hidden = true;

  grid.innerHTML = lista.map(r => `
    <article class="tarjeta" data-id="${r.id}" tabindex="0" role="button"
             aria-label="Ver receta: ${r.titulo}">
      <span class="tarjeta-categoria">${r.categoria}</span>
      <h2 class="tarjeta-titulo">${r.titulo}</h2>
      <p class="tarjeta-descripcion">${r.descripcion || ''}</p>
      <div class="tarjeta-meta">
        <span>⏱ ${r.tiempo}</span>
        <span>🍽 ${r.raciones} raciones</span>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.tarjeta').forEach(card => {
    card.addEventListener('click', () => abrirModal(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') abrirModal(card.dataset.id);
    });
  });
}

// ── Modal de detalle ──────────────────────────────
function abrirModal(id) {
  const r = todasLasRecetas.find(rec => rec.id === id);
  if (!r) return;

  const contenido = document.getElementById('modal-contenido');
  contenido.innerHTML = `
    <p class="modal-cat">${r.categoria}</p>
    <h2 class="modal-titulo">${r.titulo}</h2>
    <p class="modal-descripcion">${r.descripcion || ''}</p>
    <div class="modal-meta">
      <span>⏱ ${r.tiempo}</span>
      <span>🍽 ${r.raciones} raciones</span>
    </div>

    <h3>Ingredientes</h3>
    <ul>
      ${(r.ingredientes || []).map(i => `<li>${i}</li>`).join('')}
    </ul>

    <h3>Preparación</h3>
    <ol>
      ${(r.pasos || []).map(p => `<li>${p}</li>`).join('')}
    </ol>

    ${r.notas ? `
    <div class="modal-nota">
      <strong>💡 Nota</strong>
      ${r.notas}
    </div>` : ''}
  `;

  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  // Foco accesible
  document.getElementById('modal-cerrar').focus();
}

function cerrarModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
}

// ── Eventos globales ──────────────────────────────
document.getElementById('modal-cerrar').addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) cerrarModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});

document.getElementById('buscador').addEventListener('input', e => {
  textoBusqueda = e.target.value;
  renderGrid();
});

// ── Arranque ──────────────────────────────────────
cargarRecetas();
