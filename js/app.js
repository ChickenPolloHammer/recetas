// ── Estado ────────────────────────────────────────
let todasLasRecetas = [];
let categoriaActiva = 'Todas';
let textoBusqueda = '';

// ── Carga de recetas ──────────────────────────────
async function cargarRecetas() {
  const res = await fetch('recetas/index.json');
  const ids = await res.json();
  const promesas = ids.map(id =>
    fetch(`recetas/${id}.json`).then(r => r.json())
  );
  todasLasRecetas = await Promise.all(promesas);

  renderFiltros();
  renderGrid();

  if (location.hash) {
    const id = location.hash.slice(1);
    abrirModal(id);
  }
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

// ── Escalar ingredientes ──────────────────────────
// Convierte fracciones tipo "1/2", "3/4" a número decimal
function fraccionADecimal(str) {
  if (str.includes('/')) {
    const [num, den] = str.split('/').map(Number);
    return num / den;
  }
  return parseFloat(str);
}

// Formatea un número resultante de forma legible:
// enteros sin decimales, fracciones comunes reconocibles, resto con 1 decimal
function formatearNumero(n) {
  if (Number.isInteger(n)) return String(n);

  // Fracciones comunes → representación legible
  const fracciones = [
    [1/8, '1/8'], [1/4, '1/4'], [1/3, '1/3'], [3/8, '3/8'],
    [1/2, '1/2'], [5/8, '5/8'], [2/3, '2/3'], [3/4, '3/4'], [7/8, '7/8'],
    [1+1/4, '1 1/4'], [1+1/3, '1 1/3'], [1+1/2, '1 1/2'],
    [1+2/3, '1 2/3'], [1+3/4, '1 3/4'],
    [2+1/2, '2 1/2'], [2+1/3, '2 1/3'], [2+2/3, '2 2/3'],
    [3+1/2, '3 1/2'],
  ];
  for (const [val, repr] of fracciones) {
    if (Math.abs(n - val) < 0.01) return repr;
  }
  return n.toFixed(1).replace('.0', '');
}

// Escala todos los números (enteros, decimales y fracciones) de un texto
function escalarTexto(texto, multiplicador) {
  // Detecta: fracciones (1/2), decimales (1.5), enteros (200), con posible entero previo (1 1/2)
  return texto.replace(/(\d+)\s+(\d+\/\d+)|(\d+\/\d+)|(\d*\.?\d+)/g, (match) => {
    // Entero mixto tipo "1 1/2"
    if (/^\d+\s+\d+\/\d+$/.test(match)) {
      const [entero, frac] = match.split(/\s+/);
      const valor = parseInt(entero) + fraccionADecimal(frac);
      return formatearNumero(valor * multiplicador);
    }
    // Fracción sola tipo "1/2"
    if (/^\d+\/\d+$/.test(match)) {
      return formatearNumero(fraccionADecimal(match) * multiplicador);
    }
    // Número normal (entero o decimal)
    const n = parseFloat(match);
    if (isNaN(n)) return match;
    return formatearNumero(n * multiplicador);
  });
}

function renderIngredientes(ingredientes, multiplicador) {
  return (ingredientes || []).map(i => `<li>${escalarTexto(i, multiplicador)}</li>`).join('');
}

// ── Modal de detalle ──────────────────────────────
function abrirModal(id, multiplicador = 1) {
  const r = todasLasRecetas.find(rec => rec.id === id);
  if (!r) return;

  const racionesEscaladas = r.raciones ? Math.round(r.raciones * multiplicador) : null;

  const contenido = document.getElementById('modal-contenido');
  contenido.innerHTML = `
    <p class="modal-cat">${r.categoria}</p>
    <h2 class="modal-titulo">${r.titulo}</h2>
    <p class="modal-descripcion">${r.descripcion || ''}</p>
    <div class="modal-meta">
      <span>⏱ ${r.tiempo}</span>
      ${racionesEscaladas ? `<span>🍽 <span id="raciones-val">${racionesEscaladas}</span> raciones</span>` : ''}
    </div>

    <div class="escalar-wrap">
      <span class="escalar-label">Raciones:</span>
      ${[1, 2, 3].map(m => `
        <button class="escalar-btn ${m === multiplicador ? 'activo' : ''}"
                onclick="abrirModal('${r.id}', ${m})">${m}x</button>
      `).join('')}
    </div>

    <h3>Ingredientes</h3>
    <ul id="lista-ingredientes">
      ${renderIngredientes(r.ingredientes, multiplicador)}
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

    ${r.fuente ? `
    <a class="modal-fuente" href="${r.fuente}" target="_blank" rel="noopener">
      🔗 Ver receta original
    </a>` : ''}

    <button class="modal-compartir" onclick="compartirReceta('${r.id}')">
      📋 Copiar enlace
    </button>
  `;

  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  history.replaceState(null, '', `#${id}`);
  document.getElementById('modal-cerrar').focus();
}

function cerrarModal() {
  document.getElementById('modal-overlay').hidden = true;
  document.body.style.overflow = '';
  history.replaceState(null, '', location.pathname);
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

// ── Compartir receta ──────────────────────────────
function compartirReceta(id) {
  const url = `${location.origin}${location.pathname}#${id}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.modal-compartir');
    btn.textContent = '✅ Enlace copiado';
    setTimeout(() => { btn.textContent = '📋 Copiar enlace'; }, 2000);
  });
}

// ── Arranque ──────────────────────────────────────
cargarRecetas();
