// ============================================
// INTRANET GV&T — SCRIPT.JS (REDESIGN 2025)
// ============================================

/* ── CACHE DE DADOS ── */
const _cache = {};

async function fetchSheet(tab) {
  const cacheKey = `sheet_${tab}`;
  const now = Date.now();

  if (_cache[cacheKey] && now - _cache[cacheKey].ts < CONFIG.cacheMs) {
    return _cache[cacheKey].data;
  }

  try {
    const query = encodeURIComponent("select * where A is not null");
    const url = `${CONFIG.SHEET_URL}&sheet=${encodeURIComponent(tab)}&tq=${query}&_=${now}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // A API gviz retorna texto com prefixo de segurança
    const start = text.indexOf('{');
    const json = JSON.parse(text.substring(start, text.lastIndexOf('}') + 1));
    const data = json.table || null;
    _cache[cacheKey] = { data, ts: now };
    return data;
  } catch (e) {
    console.error(`[fetchSheet] Erro na aba "${tab}":`, e);
    return null;
  }
}

/* ── NORMALIZAÇÃO ── */
const normalize = (s) =>
  (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/* ── LOADING ── */
function showLoading() {
  const s = document.getElementById("spinner");
  const p = document.getElementById("progress-bar");
  if (s) s.classList.add("visible");
  if (p) { p.style.width = "30%"; setTimeout(() => p.style.width = "70%", 200); }
}

function hideLoading() {
  const s = document.getElementById("spinner");
  const p = document.getElementById("progress-bar");
  if (s) s.classList.remove("visible");
  if (p) {
    p.style.width = "100%";
    setTimeout(() => { p.style.width = "0"; }, 400);
  }
}

/* ── TOAST ── */
function showToast(msg, type = "info", duration = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const icons = { success: "fa-check-circle", error: "fa-exclamation-circle", info: "fa-info-circle" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = ".3s ease";
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

/* ── DATETIME ── */
function updateDateTime() {
  const el = document.getElementById("datetime");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/* ── FORMATAÇÃO ── */
function formatValue(value, colName = "") {
  if (value === null || value === undefined || value === "") return "";

  // Objeto com campo formatado (ex: datas do Sheets)
  if (typeof value === "object" && value !== null) {
    if (value.f) return escapeHtml(value.f);
    if (value.v !== undefined) value = value.v;
    else return "";
  }

  const str = String(value).trim();

  // Data no formato Google Sheets: Date(Y,M,D)
  if (str.startsWith("Date(")) {
    try {
      const parts = str.match(/\d+/g);
      const d = new Date(+parts[0], +parts[1], +parts[2]);
      return d.toLocaleDateString("pt-BR");
    } catch { return str; }
  }

  // URL / Link
  if (/^https?:\/\//i.test(str)) {
    let label = "Abrir";
    try {
      const u = new URL(str);
      if (u.hostname.includes("drive.google.com")) label = '<i class="fas fa-file"></i> Arquivo';
      else if (u.hostname.includes("forms.gle") || u.hostname.includes("docs.google.com/forms")) label = '<i class="fas fa-wpforms"></i> Formulário';
      else label = '<i class="fas fa-external-link-alt"></i> ' + u.hostname.replace("www.", "");
    } catch {}
    return `<a href="${str}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  return escapeHtml(str);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── TABELA GENÉRICA COM PAGINAÇÃO ── */
function renderTable(table, containerId, pageTitle = "") {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!table || !table.rows?.length) {
    container.innerHTML = `
      <div class="table-container">
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>Nenhum dado encontrado.</p>
        </div>
      </div>`;
    return;
  }

  const headers = table.cols.map(c => c.label || "");
  const colNorms = headers.map(normalize);

  // Remove linhas vazias e linhas que repetem cabeçalho
  const validRows = table.rows.filter(r => {
    if (!r.c?.some(c => c?.v)) return false;
    // Verifica se a linha é idêntica ao cabeçalho
    const isHeader = headers.every((h, i) => normalize(h) === normalize(r.c[i]?.v));
    return !isHeader;
  });

  const total = validRows.length;
  let currentPage = 1;
  const perPage = CONFIG.itemsPerPage;
  let filteredRows = [...validRows];

  function getPage(rows, page) {
    const start = (page - 1) * perPage;
    return rows.slice(start, start + perPage);
  }

  function buildRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="${headers.length}" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum resultado encontrado.</td></tr>`;
    }
    return rows.map(r => {
      const cells = headers.map((_, i) => `<td>${formatValue(r.c?.[i]?.v ?? "")}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
  }

  function buildPagination(total, current) {
    const pages = Math.ceil(total / perPage);
    if (pages <= 1) return "";
    let btns = `<button class="page-btn" id="pg-prev" ${current===1?"disabled":""}>&#8592;</button>`;
    const range = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - current) <= 2) range.push(i);
      else if (range[range.length-1] !== "...") range.push("...");
    }
    range.forEach(p => {
      if (p === "...") btns += `<span class="page-btn" style="pointer-events:none">…</span>`;
      else btns += `<button class="page-btn ${p===current?"active":""}" data-page="${p}">${p}</button>`;
    });
    btns += `<button class="page-btn" id="pg-next" ${current===pages?"disabled":""}>&#8594;</button>`;
    return btns;
  }

  function render() {
    const pageRows = getPage(filteredRows, currentPage);
    const tbody = container.querySelector("tbody");
    const pagination = container.querySelector(".table-pagination");
    const countEl = container.querySelector(".table-count");
    if (tbody) tbody.innerHTML = buildRows(pageRows);
    if (pagination) pagination.innerHTML = buildPagination(filteredRows.length, currentPage);
    if (countEl) countEl.textContent = `${filteredRows.length} registro${filteredRows.length !== 1 ? "s" : ""}`;
    attachPaginationEvents();
  }

  function attachPaginationEvents() {
    const pg = container.querySelector(".table-pagination");
    if (!pg) return;
    pg.querySelectorAll("[data-page]").forEach(btn => {
      btn.addEventListener("click", () => { currentPage = +btn.dataset.page; render(); });
    });
    const prev = pg.querySelector("#pg-prev");
    const next = pg.querySelector("#pg-next");
    if (prev) prev.addEventListener("click", () => { if(currentPage>1){currentPage--;render();} });
    if (next) next.addEventListener("click", () => { if(currentPage<Math.ceil(filteredRows.length/perPage)){currentPage++;render();} });
  }

  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");

  container.innerHTML = `
    <div class="table-container">
      <div class="table-toolbar">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="table-title">${escapeHtml(pageTitle || headers[0] || "Dados")}</span>
          <span class="table-count">${total} registros</span>
        </div>
        <div style="position:relative;display:flex;align-items:center">
          <i class="fas fa-search" style="position:absolute;left:10px;color:var(--text-muted);font-size:.8rem;pointer-events:none"></i>
          <input type="search" class="table-search" placeholder="Filtrar..." style="padding-left:30px" />
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${buildRows(getPage(filteredRows, 1))}</tbody>
        </table>
      </div>
      <div class="table-pagination">${buildPagination(total, 1)}</div>
    </div>`;

  attachPaginationEvents();

  // Filtro inline da tabela
  const tSearch = container.querySelector(".table-search");
  if (tSearch) {
    tSearch.addEventListener("input", () => {
      const q = normalize(tSearch.value);
      filteredRows = q
        ? validRows.filter(r => r.c?.some(c => normalize(c?.v).includes(q)))
        : [...validRows];
      currentPage = 1;
      render();
    });
  }
}

/* ── CARROSSEL ── */
function converterLinkDrive(url) {
  if (!url) return url;
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : url;
}

let carouselTimer = null;

async function loadCarrossel() {
  const wrap = document.querySelector(".carousel-wrap");
  if (!wrap) return;

  const inner = wrap.querySelector(".carousel-inner-custom");
  const dotsWrap = wrap.querySelector(".carousel-dots");
  if (!inner) return;

  const table = await fetchSheet(CONFIG.sheets.carrossel);
  if (!table?.rows?.length) { wrap.style.display = "none"; return; }

  const headers = table.cols.map(c => normalize(c.label));
  const idxLink   = headers.findIndex(h => h.includes("link") || h.includes("url") || h.includes("imagem"));
  const idxTitulo = headers.findIndex(h => h.includes("titulo") || h.includes("title"));
  const idxTexto  = headers.findIndex(h => h.includes("texto") || h.includes("descricao"));

  const slides = table.rows
    .map(r => ({
      link:   converterLinkDrive(String(r.c?.[idxLink]?.v || "")),
      titulo: String(r.c?.[idxTitulo]?.v || ""),
      texto:  String(r.c?.[idxTexto]?.v  || ""),
    }))
    .filter(s => s.link);

  if (!slides.length) { wrap.style.display = "none"; return; }

  inner.innerHTML = slides.map((s, i) => `
    <div class="carousel-slide ${i===0?"active":""}">
      <img src="${s.link}" alt="${escapeHtml(s.titulo)}" loading="lazy" />
      <div class="carousel-caption-custom">
        ${s.titulo ? `<h5>${escapeHtml(s.titulo)}</h5>` : ""}
        ${s.texto  ? `<p>${escapeHtml(s.texto)}</p>`    : ""}
      </div>
    </div>`).join("");

  if (dotsWrap) {
    dotsWrap.innerHTML = slides.map((_, i) =>
      `<button class="carousel-dot ${i===0?"active":""}" data-idx="${i}" aria-label="Slide ${i+1}"></button>`
    ).join("");
    dotsWrap.querySelectorAll(".carousel-dot").forEach(btn => {
      btn.addEventListener("click", () => goToSlide(+btn.dataset.idx));
    });
  }

  startCarousel();

  // Botões prev/next
  wrap.querySelector(".carousel-nav-btn.prev")?.addEventListener("click", () => {
    const slides = inner.querySelectorAll(".carousel-slide");
    const cur = [...slides].findIndex(s => s.classList.contains("active"));
    goToSlide((cur - 1 + slides.length) % slides.length);
  });
  wrap.querySelector(".carousel-nav-btn.next")?.addEventListener("click", () => {
    const slides = inner.querySelectorAll(".carousel-slide");
    const cur = [...slides].findIndex(s => s.classList.contains("active"));
    goToSlide((cur + 1) % slides.length);
  });
}

function goToSlide(idx) {
  const inner = document.querySelector(".carousel-inner-custom");
  if (!inner) return;
  const slides = inner.querySelectorAll(".carousel-slide");
  const dots   = document.querySelectorAll(".carousel-dot");
  slides.forEach((s, i) => s.classList.toggle("active", i === idx));
  dots.forEach((d, i) => d.classList.toggle("active", i === idx));
  resetCarousel();
}

function startCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    const inner = document.querySelector(".carousel-inner-custom");
    if (!inner) return;
    const slides = inner.querySelectorAll(".carousel-slide");
    const cur = [...slides].findIndex(s => s.classList.contains("active"));
    goToSlide((cur + 1) % slides.length);
  }, CONFIG.carouselInterval);
}

function resetCarousel() {
  startCarousel();
}

/* ── INDEX ── */
async function loadIndex() {
  // Cards com frases
  const table = await fetchSheet(CONFIG.sheets.index);
  if (table?.rows?.length) {
    const colNorms = table.cols.map(c => normalize(c.label));
    const row = table.rows.find(r => r.c?.some(c => c?.v));
    if (row) {
      ["comunicados","treinamentos","equipe"].forEach(key => {
        const idx = colNorms.findIndex(c => c.includes(key));
        const val = idx >= 0 ? row.c[idx]?.v || "" : "";
        const el = document.getElementById(`fr-${key}`);
        if (el) el.textContent = val || "Nenhuma mensagem disponível.";
      });
    }
  }
  await loadCarrossel();
}

/* ── EQUIPE (cards em vez de tabela) ── */
async function loadEquipe() {
  const table = await fetchSheet(CONFIG.sheets.equipe);
  const container = document.getElementById("equipe-list");
  if (!container) return;

  if (!table?.rows?.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>Nenhum membro cadastrado.</p></div>`;
    return;
  }

  const headers = table.cols.map(c => normalize(c.label));
  const idxNome  = headers.findIndex(h => h.includes("nome") || h.includes("name"));
  const idxCargo = headers.findIndex(h => h.includes("cargo") || h.includes("funcao") || h.includes("role"));

  const validRows = table.rows.filter(r => r.c?.some(c => c?.v));

  // Se tiver colunas nome/cargo, exibe grid de cards; senão, tabela padrão
  if (idxNome >= 0) {
    const cards = validRows.map(r => {
      const nome  = String(r.c?.[idxNome]?.v  || "").trim();
      const cargo = idxCargo >= 0 ? String(r.c?.[idxCargo]?.v || "").trim() : "";
      const initials = nome.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase() || "?";
      return `
        <div class="equipe-card">
          <div class="equipe-avatar">${initials}</div>
          <div class="equipe-name">${escapeHtml(nome)}</div>
          ${cargo ? `<div class="equipe-role">${escapeHtml(cargo)}</div>` : ""}
        </div>`;
    }).join("");

    container.innerHTML = `<div class="equipe-grid">${cards}</div>`;
  } else {
    renderTable(table, "equipe-list", "Equipe");
  }
}

/* ── LINKS (grid de cards) ── */
async function loadLinks() {
  const table = await fetchSheet(CONFIG.sheets.links);
  const container = document.getElementById("links-list");
  if (!container) return;

  if (!table?.rows?.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-link"></i><p>Nenhum link cadastrado.</p></div>`;
    return;
  }

  const headers = table.cols.map(c => normalize(c.label));
  const idxNome = headers.findIndex(h => h.includes("nome") || h.includes("titulo") || h.includes("descricao"));
  const idxUrl  = headers.findIndex(h => h.includes("link") || h.includes("url"));

  const validRows = table.rows.filter(r => r.c?.some(c => c?.v));

  if (idxUrl >= 0) {
    const cards = validRows.map(r => {
      const url  = String(r.c?.[idxUrl]?.v || "").trim();
      const nome = idxNome >= 0 ? String(r.c?.[idxNome]?.v || "").trim() : url;
      let host = url;
      try { host = new URL(url).hostname.replace("www.",""); } catch {}
      return url ? `
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="link-card">
          <div class="link-icon"><i class="fas fa-external-link-alt"></i></div>
          <div class="link-info">
            <div class="link-name">${escapeHtml(nome || host)}</div>
            <div class="link-url">${escapeHtml(host)}</div>
          </div>
        </a>` : "";
    }).join("");

    container.innerHTML = `<div class="links-grid">${cards}</div>`;
  } else {
    renderTable(table, "links-list", "Links");
  }
}

/* ── TREINAMENTOS — CARDS POR TRILHA + MODAL ── */

// Ícones automáticos por palavras-chave no nome da trilha
function trilhaIcone(nome) {
  const n = normalize(nome);
  if (n.includes("gestor") || n.includes("gerente") || n.includes("lider")) return "fas fa-user-tie";
  if (n.includes("vend") || n.includes("consultor") || n.includes("comercial")) return "fas fa-handshake";
  if (n.includes("financ") || n.includes("admin") || n.includes("backoffice")) return "fas fa-calculator";
  if (n.includes("tecni") || n.includes("mecanico") || n.includes("oficina")) return "fas fa-wrench";
  if (n.includes("atendimento") || n.includes("recepcao") || n.includes("caixa")) return "fas fa-headset";
  if (n.includes("novo") || n.includes("seminovo") || n.includes("veiculo") || n.includes("carro")) return "fas fa-car";
  if (n.includes("pos") || n.includes("relacionamento") || n.includes("crm")) return "fas fa-star";
  if (n.includes("rh") || n.includes("pessoas") || n.includes("dp")) return "fas fa-users";
  return "fas fa-graduation-cap";
}

// Cores dos cards (rotaciona automaticamente)
const TRILHA_CORES = [
  { bg: "#eff6ff", icon: "#1d4ed8", border: "#bfdbfe" },
  { bg: "#f0fdf4", icon: "#15803d", border: "#bbf7d0" },
  { bg: "#faf5ff", icon: "#7c3aed", border: "#e9d5ff" },
  { bg: "#fff7ed", icon: "#c2410c", border: "#fed7aa" },
  { bg: "#fef2f2", icon: "#b91c1c", border: "#fecaca" },
  { bg: "#f0f9ff", icon: "#0369a1", border: "#bae6fd" },
  { bg: "#fefce8", icon: "#a16207", border: "#fde68a" },
  { bg: "#f8fafc", icon: "#475569", border: "#cbd5e1" },
];

async function loadTreinamentos() {
  const container = document.getElementById("treinamentos-list");
  if (!container) return;

  const table = await fetchSheet(CONFIG.sheets.treinamentos);
  if (!table?.rows?.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-graduation-cap"></i><p>Nenhum treinamento encontrado.</p></div>`;
    return;
  }

  const headers = table.cols.map(c => c.label || "");
  const headNorms = headers.map(normalize);

  // Detecta coluna "Função" (ou variações)
  const idxFuncao = headNorms.findIndex(h =>
    h.includes("funcao") || h.includes("cargo") || h.includes("trilha") || h.includes("perfil"));

  if (idxFuncao < 0) {
    renderTable(table, "treinamentos-list", "Treinamentos");
    return;
  }

  // Filtra apenas linhas que tenham pelo menos título ou link preenchido (além da função)
  const validRows = table.rows.filter(r => {
    if (!r.c?.some(c => c?.v)) return false;
    // Precisa ter pelo menos um valor além da coluna Função
    return r.c.some((c, i) => i !== idxFuncao && c?.v);
  });

  // Agrupa por trilha
  const grupos = {};
  validRows.forEach(r => {
    const trilha = String(r.c?.[idxFuncao]?.v || "Outros").trim();
    if (!grupos[trilha]) grupos[trilha] = [];
    grupos[trilha].push(r);
  });

  const trilhas = Object.keys(grupos).sort();

  // Monta os cards
  const cardsHtml = trilhas.map((trilha, i) => {
    const cor = TRILHA_CORES[i % TRILHA_CORES.length];
    const icone = trilhaIcone(trilha);
    const total = grupos[trilha].length;
    return `
      <div class="trilha-card" data-trilha="${escapeHtml(trilha)}" style="--card-bg:${cor.bg};--card-icon:${cor.icon};--card-border:${cor.border}">
        <div class="trilha-icon-wrap"><i class="${icone}"></i></div>
        <div class="trilha-info">
          <div class="trilha-nome">${escapeHtml(trilha)}</div>
          <div class="trilha-count">${total} treinamento${total !== 1 ? "s" : ""}</div>
        </div>
        <i class="fas fa-chevron-right trilha-arrow"></i>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="trilhas-header">
      <span class="table-title">Trilhas de Treinamento</span>
      <span class="table-count">${trilhas.length} trilha${trilhas.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="trilhas-grid">${cardsHtml}</div>`;

  // Guarda dados para o modal
  container._grupos  = grupos;
  container._headers = headers;
  container._idxFuncao = idxFuncao;

  // Eventos dos cards
  container.querySelectorAll(".trilha-card").forEach(card => {
    card.addEventListener("click", () => {
      const trilha = card.dataset.trilha;
      abrirModalTrilha(trilha, grupos[trilha], headers);
    });
  });

  // Cria modal (uma vez)
  if (!document.getElementById("trilha-modal")) criarModalTrilha();
}

/* Estado do modal de player */
const _modalState = { rows: [], headers: [], idxNome: -1, idxLink: -1, idxFuncao: -1, current: -1 };

function criarModalTrilha() {
  const modal = document.createElement("div");
  modal.id = "trilha-modal";
  modal.innerHTML = `
    <div class="trilha-modal-backdrop"></div>
    <div class="trilha-modal-box">

      <!-- PAINEL ESQUERDO: lista de treinamentos -->
      <div class="modal-sidebar">
        <div class="modal-sidebar-header">
          <div class="trilha-modal-titulo" id="modal-titulo"></div>
          <div class="trilha-modal-subtitulo" id="modal-subtitulo"></div>
          <div class="trilha-modal-search-wrap">
            <i class="fas fa-search"></i>
            <input type="search" id="modal-search" placeholder="Buscar..." />
          </div>
        </div>
        <ul class="modal-lista" id="modal-lista"></ul>
      </div>

      <!-- PAINEL DIREITO: player -->
      <div class="modal-player-wrap">
        <div class="modal-player-header">
          <div class="modal-player-titulo" id="player-titulo">Selecione um treinamento</div>
          <div style="display:flex;align-items:center;gap:8px">
            <button class="modal-nav-btn" id="player-prev" title="Anterior" disabled>
              <i class="fas fa-chevron-left"></i>
            </button>
            <span class="modal-nav-count" id="player-count"></span>
            <button class="modal-nav-btn" id="player-next" title="Próximo" disabled>
              <i class="fas fa-chevron-right"></i>
            </button>
            <button class="trilha-modal-close" id="modal-close" title="Fechar">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="modal-player-body" id="modal-player">
          <div class="modal-player-placeholder">
            <i class="fas fa-play-circle"></i>
            <p>Clique em um treinamento ao lado para começar</p>
          </div>
        </div>
      </div>

    </div>`;
  document.body.appendChild(modal);

  modal.querySelector(".trilha-modal-backdrop").addEventListener("click", fecharModalTrilha);
  modal.querySelector("#modal-close").addEventListener("click", fecharModalTrilha);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") fecharModalTrilha();
    if (e.key === "ArrowRight" && modal.classList.contains("open")) navegarPlayer(1);
    if (e.key === "ArrowLeft"  && modal.classList.contains("open")) navegarPlayer(-1);
  });

  modal.querySelector("#modal-search").addEventListener("input", e => {
    const q = normalize(e.target.value);
    modal.querySelectorAll(".modal-item").forEach(item => {
      item.style.display = !q || normalize(item.textContent).includes(q) ? "" : "none";
    });
  });

  modal.querySelector("#player-prev").addEventListener("click", () => navegarPlayer(-1));
  modal.querySelector("#player-next").addEventListener("click", () => navegarPlayer(1));
}

function abrirModalTrilha(trilha, rows, headers) {
  if (!document.getElementById("trilha-modal")) criarModalTrilha();
  const modal = document.getElementById("trilha-modal");

  const headNorms = headers.map(normalize);
  const idxFuncao = headNorms.findIndex(h =>
    h.includes("funcao") || h.includes("cargo") || h.includes("trilha") || h.includes("perfil"));
  const idxNome   = headNorms.findIndex(h =>
    h.includes("titulo") || h.includes("nome") || h.includes("treinamento") ||
    h.includes("descricao") || h.includes("assunto") || h.includes("modulo"));
  // Primeira coluna que contenha URL/link — aceita "Assista", "Video", "Link", "Url", "Arquivo", "Material"
  const idxLink   = headNorms.findIndex(h =>
    h.includes("assista") || h.includes("video") || h.includes("link") ||
    h.includes("url") || h.includes("arquivo") || h.includes("material") || h.includes("acesso"));

  // Índice do material de apoio (segunda coluna de link, se houver)
  const idxMaterial = headNorms.findIndex((h, i) =>
    i !== idxLink && (h.includes("material") || h.includes("apoio") || h.includes("anexo") || h.includes("pdf")));

  // Guarda estado
  _modalState.rows      = rows;
  _modalState.headers   = headers;
  _modalState.idxNome   = idxNome;
  _modalState.idxLink   = idxLink;
  _modalState.idxMaterial = idxMaterial;
  _modalState.idxFuncao = idxFuncao;
  _modalState.current   = -1;

  document.getElementById("modal-titulo").textContent = trilha;
  document.getElementById("modal-subtitulo").textContent = `${rows.length} treinamento${rows.length !== 1 ? "s" : ""}`;
  document.getElementById("modal-search").value = "";
  document.getElementById("player-titulo").textContent = "Selecione um treinamento";
  document.getElementById("player-count").textContent = "";
  document.getElementById("modal-player").innerHTML = `
    <div class="modal-player-placeholder">
      <i class="fas fa-play-circle"></i>
      <p>Clique em um treinamento ao lado para começar</p>
    </div>`;
  document.getElementById("player-prev").disabled = true;
  document.getElementById("player-next").disabled = true;

  // Monta lista lateral
  const lista = document.getElementById("modal-lista");
  lista.innerHTML = rows.map((r, i) => {
    const nome     = idxNome >= 0     ? String(r.c?.[idxNome]?.v     || "") : `Treinamento ${i + 1}`;
    const temVideo = idxLink >= 0     && r.c?.[idxLink]?.v;
    const temMat   = idxMaterial >= 0 && r.c?.[idxMaterial]?.v;
    const clicavel = temVideo || temMat;
    return `
      <li class="modal-item ${clicavel ? "" : "sem-link"}" data-idx="${i}">
        <span class="modal-item-num">${i + 1}</span>
        <span class="modal-item-nome">${escapeHtml(nome || `Treinamento ${i + 1}`)}</span>
        <span style="display:flex;gap:4px;flex-shrink:0">
          ${temVideo ? '<i class="fas fa-play-circle modal-item-play" title="Vídeo"></i>' : ""}
          ${temMat   ? '<i class="fas fa-file-alt modal-item-play" title="Material de Apoio" style="color:var(--success)"></i>' : ""}
          ${!clicavel ? '<i class="fas fa-lock modal-item-play" style="opacity:.3"></i>' : ""}
        </span>
      </li>`;
  }).join("");

  lista.querySelectorAll(".modal-item:not(.sem-link)").forEach(item => {
    item.addEventListener("click", () => abrirPlayer(+item.dataset.idx));
  });

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function abrirPlayer(idx) {
  const { rows, headers, idxNome, idxLink, idxMaterial } = _modalState;
  const row  = rows[idx];
  const nome = idxNome >= 0 ? String(row.c?.[idxNome]?.v || "") : `Treinamento ${idx + 1}`;
  const url  = idxLink >= 0     ? String(row.c?.[idxLink]?.v     || "").trim() : "";
  const mat  = idxMaterial >= 0 ? String(row.c?.[idxMaterial]?.v || "").trim() : "";

  _modalState.current = idx;

  // Atualiza item ativo na lista
  document.querySelectorAll(".modal-item").forEach((el, i) => {
    el.classList.toggle("ativo", i === idx);
  });

  // Título e contador
  document.getElementById("player-titulo").textContent = nome;
  document.getElementById("player-count").textContent  = `${idx + 1} / ${rows.length}`;

  // Botões nav
  document.getElementById("player-prev").disabled = idx === 0;
  document.getElementById("player-next").disabled = idx === rows.length - 1;

  const playerEl = document.getElementById("modal-player");

  // Sem conteúdo
  if (!url && !mat) {
    playerEl.innerHTML = `<div class="modal-player-placeholder"><i class="fas fa-exclamation-circle"></i><p>Nenhum conteúdo disponível para este treinamento.</p></div>`;
    return;
  }

  // Resolve URL do Drive (remove parâmetros extras e converte para /preview)
  function drivePreview(rawUrl) {
    const m = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
  }

  // Resolve YouTube
  function youtubeEmbed(rawUrl) {
    const m = rawUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` : null;
  }

  function buildIframe(src) {
    return `<iframe src="${src}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  }

  // Botão de material de apoio (sempre visível quando existir)
  const matBtn = mat ? `
    <div style="position:absolute;bottom:14px;right:14px;z-index:10">
      <a href="${mat}" target="_blank" rel="noopener noreferrer"
        style="display:flex;align-items:center;gap:7px;background:#1d4ed8;color:#fff;
               padding:8px 14px;border-radius:8px;font-size:.8rem;font-weight:600;
               text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,.25)">
        <i class="fas fa-file-download"></i> Material de Apoio
      </a>
    </div>` : "";

  // Tenta vídeo primeiro
  if (url) {
    const yt = youtubeEmbed(url);
    if (yt) { playerEl.innerHTML = `<div style="position:relative;height:100%">${buildIframe(yt)}${matBtn}</div>`; return; }

    const dp = drivePreview(url);
    if (dp) { playerEl.innerHTML = `<div style="position:relative;height:100%">${buildIframe(dp)}${matBtn}</div>`; return; }

    // Outro link direto
    playerEl.innerHTML = `<div style="position:relative;height:100%">${buildIframe(url)}${matBtn}</div>`;
    return;
  }

  // Só tem material — abre preview do material
  if (mat) {
    const dp = drivePreview(mat);
    if (dp) { playerEl.innerHTML = buildIframe(dp); return; }
    playerEl.innerHTML = `<div class="modal-player-placeholder">
      <i class="fas fa-file-alt" style="font-size:3rem;opacity:.3"></i>
      <p>Material de Apoio disponível</p>
      <a href="${mat}" target="_blank" rel="noopener noreferrer"
        style="display:flex;align-items:center;gap:7px;background:#1d4ed8;color:#fff;
               padding:10px 18px;border-radius:8px;font-size:.85rem;font-weight:600;
               text-decoration:none;margin-top:8px">
        <i class="fas fa-file-download"></i> Abrir Material
      </a>
    </div>`;
  }
}

function navegarPlayer(delta) {
  const { current, rows, idxLink } = _modalState;
  if (current < 0) return;
  let next = current + delta;
  // Pula treinamentos sem link
  while (next >= 0 && next < rows.length) {
    if (idxLink >= 0 && rows[next].c?.[idxLink]?.v) { abrirPlayer(next); return; }
    next += delta;
  }
}

function fecharModalTrilha() {
  const modal = document.getElementById("trilha-modal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
  // Para vídeo ao fechar
  const player = document.getElementById("modal-player");
  if (player) player.innerHTML = `<div class="modal-player-placeholder"><i class="fas fa-play-circle"></i><p>Clique em um treinamento ao lado para começar</p></div>`;
}

/* ── ROTEADOR DE PÁGINAS ── */
async function loadPageData() {
  showLoading();
  const page = document.body.getAttribute("data-page");

  try {
    switch (page) {
      case "index":
        await loadIndex();
        break;
      case "comunicados":
        await fetchSheet(CONFIG.sheets.comunicados).then(t => renderTable(t, "comunicados-list", "Comunicados"));
        break;
      case "treinamentos":
        await loadTreinamentos();
        break;
      case "equipe":
        await loadEquipe();
        break;
      case "links":
        await loadLinks();
        break;
    }
    if (page) showToast("Dados carregados com sucesso", "success", 2500);
  } catch (e) {
    showToast("Erro ao carregar dados. Tente recarregar.", "error");
    console.error(e);
  } finally {
    hideLoading();
  }
}

/* ── BUSCA GLOBAL (header) ── */
function globalSearch() {
  const q = normalize(document.getElementById("search")?.value || "");
  const rows = document.querySelectorAll(".data-table tbody tr");
  rows.forEach(row => {
    row.style.display = !q || normalize(row.textContent).includes(q) ? "" : "none";
  });
}

/* ── TEMA ── */
function initTheme() {
  const saved = localStorage.getItem("gvt_theme");
  if (saved === "dark") document.body.classList.add("dark");
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      localStorage.setItem("gvt_theme", document.body.classList.contains("dark") ? "dark" : "light");
      updateThemeIcon();
    });
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const isDark = document.body.classList.contains("dark");
  btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  btn.title = isDark ? "Modo claro" : "Modo escuro";
}

/* ── SIDEBAR TOGGLE ── */
function initSidebar() {
  const btn = document.getElementById("sidebar-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem("gvt_sidebar", document.body.classList.contains("sidebar-collapsed") ? "collapsed" : "expanded");
    });
  }
  if (localStorage.getItem("gvt_sidebar") === "collapsed") {
    document.body.classList.add("sidebar-collapsed");
  }
}

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSidebar();
  updateDateTime();
  setInterval(updateDateTime, 30000);
  loadPageData();
});
