/* ============================================================================
   Agenda Turbo Max — sistema de ícones
   SVG em traço, desenhados na mão, herdando a cor do texto (currentColor).
   Sem biblioteca externa: a política de segurança da aplicação só permite
   recursos do próprio domínio, e emoji não aceita controle de cor nem brilho.
   ========================================================================== */
const ICON = {
  // ---- navegação ----
  dashboard: '<rect x="3" y="3" width="7.5" height="8.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="5" rx="2"/><rect x="13.5" y="11" width="7.5" height="10" rx="2"/><rect x="3" y="14.5" width="7.5" height="6.5" rx="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14.5" r="1.2" fill="currentColor" stroke="none"/>',
  compose: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  bulk: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="M12 15 9 12a11 11 0 0 1 2-5.5C13.4 3.2 17 2 21 2c0 4-1.2 7.6-4.5 10A11 11 0 0 1 11 14Z"/><path d="M15 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>',
  analytics: '<path d="M3 20h18"/><rect x="5" y="12" width="3.4" height="6" rx="1.2"/><rect x="10.3" y="7" width="3.4" height="11" rx="1.2"/><rect x="15.6" y="10" width="3.4" height="8" rx="1.2"/>',
  link: '<path d="M9.5 14.5a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1"/><path d="M14.5 9.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2.2"/><circle cx="8" cy="12" r="2.2"/><circle cx="14" cy="18" r="2.2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',

  // ---- métricas ----
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',
  alert: '<path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>',
  draft: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  zap: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z"/>',

  // ---- ações ----
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v5h-5"/>',
  play: '<path d="M7 4.5v15l13-7.5Z"/>',
  pause: '<rect x="7" y="4.5" width="3.5" height="15" rx="1.4"/><rect x="13.5" y="4.5" width="3.5" height="15" rx="1.4"/>',
  edit: '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-.9 13.1a2 2 0 0 1-2 1.9H7.9a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v5M14 11v5"/>',
  gallery: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m3 16.5 4.5-4.5 4 4 3.5-3.5L21 17"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 8-8"/><path d="m16 7 2.5 2.5M19 4l2.5 2.5"/>',
  stethoscope: '<path d="M5 3v5a4 4 0 0 0 8 0V3"/><path d="M5 3H3.5M13 3h1.5"/><path d="M9 16v-4"/><path d="M9 16a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="2.2"/>',
  upload: '<path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3"/><path d="m8 8 4-4 4 4"/><path d="M12 4v12"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 20a6.4 6.4 0 0 0-2-4.6"/>',

  // ---- formatos de publicação ----
  video: '<rect x="2.5" y="5" width="13" height="14" rx="3"/><path d="m15.5 10 5-3v10l-5-3Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m3 16.5 4.5-4.5 4 4 3.5-3.5L21 17"/>',
  carousel: '<rect x="6.5" y="4.5" width="11" height="15" rx="2.5"/><path d="M3.5 7.5v9M20.5 7.5v9"/>',
  story: '<rect x="6" y="2.5" width="12" height="19" rx="3.5" stroke-dasharray="3.5 2.4"/><circle cx="12" cy="12" r="3"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>'
};

/**
 * Monta o SVG do ícone.
 * @param {string} nome   chave em ICON
 * @param {object} opts   { size, cls, stroke }
 */
function icon(nome, opts = {}) {
  const d = ICON[nome];
  if (!d) return '';
  const s = opts.size || 20;
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const sw = opts.stroke || 1.7;
  return `<svg${cls} width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}

/** Ícone dentro de uma cápsula que acende no hover. */
function iconBox(nome, opts = {}) {
  const tom = opts.tone || 'cyan';   // cyan | blue | violet | amber | rose | slate
  return `<span class="ico-box ico-${tom}">${icon(nome, { size: opts.size || 18 })}</span>`;
}

// Troca os ícones marcados com data-icon assim que a página carrega
function hydrateIcons(raiz = document) {
  raiz.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconDone) return;
    el.innerHTML = icon(el.dataset.icon, {
      size: parseInt(el.dataset.iconSize, 10) || 20,
      stroke: parseFloat(el.dataset.iconStroke) || 1.7
    }) + (el.dataset.label ? `<span>${el.dataset.label}</span>` : '');
    el.dataset.iconDone = '1';
  });
}
document.addEventListener('DOMContentLoaded', () => hydrateIcons());
