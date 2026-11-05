// Organograma: Mapa no mesmo quadro da Árvore de OKRs (fundo pontilhado, cartões 200x108, linhas tracejadas com
// contador, busca, legenda, arrastar para mover, rolar para dar zoom). Substitui o Mapa estático de renderOrg.
// Carregado depois do script principal: usa state, render, icon, ICONS, e (escape), attach e RENDERERS de lá.
(function(){
  const AMBAR = "#673DE6", CINZA = "#66666F", VERDE = "#0F7A68", ROSA = "#C25FD6";
  const NW = 200, NH = 108, HG = 22, VG = 66;
  const TIPO = { lider: ["Liderança", AMBAR], pessoa: ["Colaborador", VERDE], equipe: ["Equipe de agentes", ROSA] };
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function og(){ if(!state.org) state.org = { tree: { x: 0, y: 0, s: 1, fitted: false }, q: "", agentes: false }; return state.org; }

  // Pessoas reais (Configurações > Usuários/Liderança): cada uma aponta para o líder direto (leaderId)
  function ativos(){ return ((state.cfg && state.cfg.members) || []).filter(m => m.status !== "inativo"); }
  function nos(){
    const ms = ativos(), byId = {}, units = (state.cfg && state.cfg.units) || [];
    ms.forEach(m => { byId[m.id] = m; });
    const nome = id => { const u = units.find(x => x.id === id); return u ? u.name : ""; };
    // Líder inativo, removido ou ciclo (A lidera B que lidera A): a pessoa sobe para o topo
    const pai = m => {
      if(!m.leaderId || !byId[m.leaderId] || m.leaderId === m.id) return null;
      const vistos = new Set([m.id]); let c = byId[m.leaderId];
      while(c){ if(vistos.has(c.id)) return null; vistos.add(c.id); c = c.leaderId ? byId[c.leaderId] : null; }
      return m.leaderId;
    };
    const lista = ms.map(m => ({ m, parentId: pai(m) }));
    return lista.map(({ m, parentId }) => {
      const n = lista.filter(x => x.parentId === m.id).length, area = nome(m.areaId), cargo = nome(m.cargoId);
      return { id: m.id, parentId: parentId || undefined, tipo: n ? "lider" : "pessoa", titulo: m.name, area: area || "Sem área",
        sub: cargo || (CFG_ROLES[m.role] || ""), dir: n ? n + " direto" + (n === 1 ? "" : "s") : "", busca: [m.name, area, cargo, m.email].join(" ") };
    });
  }
  function layoutTree(lista){
    const byId = {}; lista.forEach(o => { byId[o.id] = o; });
    const roots = lista.filter(o => !o.parentId || !byId[o.parentId]);
    const kids = id => lista.filter(o => o.parentId === id);
    const width = {}, pos = {}; let maxDepth = 0;
    function w(o){ const c = kids(o.id); if(!c.length) return width[o.id] = NW; const s = c.reduce((a, x) => a + w(x), 0) + HG * (c.length - 1); return width[o.id] = Math.max(NW, s); }
    roots.forEach(w);
    function place(o, x0, depth){
      const W = width[o.id] || NW, c = kids(o.id);
      pos[o.id] = { x: x0 + (W - NW) / 2, y: depth * (NH + VG) }; maxDepth = Math.max(maxDepth, depth);
      let x = x0 + (W - (c.reduce((a, k) => a + (width[k.id] || NW), 0) + HG * (c.length - 1))) / 2;
      c.forEach(k => { place(k, x, depth + 1); x += (width[k.id] || NW) + HG; });
    }
    let x = 0; roots.forEach(r => { place(r, x, 0); x += (width[r.id] || NW) + HG * 3; });
    return { pos, w: Math.max(NW, x - HG * 3), h: (maxDepth + 1) * NH + maxDepth * VG, roots: roots.length };
  }
  const ini = s => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  function mapa(){
    const o = og(), lista = nos(), q = norm(o.q), lay = layoutTree(lista);
    const hit = x => !q || norm(x.busca).indexOf(q) >= 0;
    const linhas = lista.filter(c => c.parentId && lay.pos[c.parentId] && lay.pos[c.id]).map(c => {
      const p = lay.pos[c.parentId], k = lay.pos[c.id];
      const px = p.x + NW / 2, py = p.y + NH, kx = k.x + NW / 2, ky = k.y, my = py + VG / 2;
      return `<path d="M${px},${py} V${my} H${kx} V${ky}" fill="none" stroke="#B4B4BC" stroke-width="1.3" stroke-dasharray="4 3"/>`;
    }).join("");
    const contadores = lista.filter(p => lay.pos[p.id] && lista.some(c => c.parentId === p.id)).map(p => { const n = lista.filter(c => c.parentId === p.id).length; const x = lay.pos[p.id].x + NW / 2, y = lay.pos[p.id].y + NH + VG / 2; return `<g><rect x="${x - 13}" y="${y - 9}" width="26" height="18" rx="9" fill="#FFFFFF" stroke="#DADADF"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#3C3C44">${n}</text></g>`; }).join("");
    const cards = lista.filter(x => lay.pos[x.id]).map(x => { const p = lay.pos[x.id], t = TIPO[x.tipo], dim = q && !hit(x);
      const avatar = x.tipo === "equipe" ? `<span style="width:22px;height:22px;flex:0 0 22px;border-radius:7px;background:rgba(194,95,214,0.12);display:flex;align-items:center;justify-content:center">${icon(ICONS.agentes, 12, ROSA)}</span>` : `<span style="width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:#EFEFF2;font-size:9px;font-weight:700;color:#4A4A52;display:flex;align-items:center;justify-content:center">${e(ini(x.titulo))}</span>`;
      return `<div data-org-node="${e(x.id)}" style="position:absolute;left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px;box-sizing:border-box;padding:10px 12px;border:1px solid ${q && hit(x) ? AMBAR : "#E6E6EA"};border-radius:12px;background:#FFFFFF;box-shadow:0 4px 14px rgba(23,23,26,0.05);display:flex;flex-direction:column;gap:6px;opacity:${dim ? .3 : 1};transition:opacity .2s,box-shadow .2s">
        <div style="display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:${t[1]}"></span><span style="flex:1;min-width:0;font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.titulo)}</span>${avatar}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:${CINZA}"><span style="background:#F7F7F8;border:1px solid #E6E6EA;padding:1px 6px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">${e(x.area)}</span><span style="margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">${e(x.dir)}</span></div>
        <div style="margin-top:auto;display:flex;align-items:center;gap:8px;font-size:10.5px;color:${CINZA}"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(x.sub)}</span><strong style="color:${t[1]};font-size:10.5px;white-space:nowrap">${t[0]}</strong></div>
        <div style="height:4px;border-radius:4px;background:${t[1]};opacity:.85"></div>
      </div>`; }).join("");
    const t = o.tree, pessoas = lista.filter(x => x.tipo !== "equipe").length, equipes = lista.filter(x => x.tipo === "equipe").length;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><strong style="font-size:13px">Estrutura da empresa</strong><span style="font-size:12px;color:${CINZA}">${pessoas} pessoa${pessoas === 1 ? "" : "s"}${o.agentes ? " · " + equipes + " equipe" + (equipes === 1 ? "" : "s") + " de agentes" : ""}</span><span style="margin-left:auto;font-size:11.5px;color:#9A9AA3">arraste para mover · role para dar zoom</span></div>
    <div id="org-tree" data-w="${lay.w}" data-h="${lay.h}" style="position:relative;height:600px;border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF radial-gradient(#DADADF 1px, transparent 1px) 0 0/18px 18px;overflow:hidden;cursor:grab;user-select:none">
      <div id="org-tree-layer" style="position:absolute;left:0;top:0;transform:translate(${t.x}px,${t.y}px) scale(${t.s});transform-origin:0 0;width:${lay.w}px;height:${lay.h}px">
        <svg width="${lay.w}" height="${lay.h}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none">${linhas}${contadores}</svg>
        ${cards}
      </div>
      <label data-org-ui style="position:absolute;left:14px;top:14px;display:block;width:220px;cursor:text"><span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);display:flex">${icon(ICONS.search, 13, "#9A9AA3")}</span><input data-org-q value="${e(o.q)}" placeholder="Buscar pessoa ou área" style="width:100%;padding:8px 10px 8px 32px;border:1px solid #DADADF;border-radius:20px;font:inherit;font-size:12.5px;background:#FFFFFF;outline:none;box-shadow:0 4px 12px rgba(23,23,26,0.06)"></label>
      <div data-org-ui style="position:absolute;right:14px;top:14px;display:flex;gap:12px;padding:7px 12px;border:1px solid #E6E6EA;border-radius:20px;background:#FFFFFF;font-size:11px;color:#3C3C44;box-shadow:0 4px 12px rgba(23,23,26,0.06)">${Object.keys(TIPO).filter(k => k !== "equipe" || o.agentes).map(k => `<span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:${TIPO[k][1]}"></span>${TIPO[k][0]}</span>`).join("")}</div>
      <div data-org-ui style="position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;gap:4px;border:1px solid #E6E6EA;border-radius:10px;background:#FFFFFF;padding:3px;box-shadow:0 4px 12px rgba(23,23,26,0.06)">
        <span data-org-zoom="in" data-hover title="Aproximar" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.plus, 13)}</span>
        <span data-org-zoom="out" data-hover title="Afastar" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg></span>
        <span data-org-zoom="fit" data-hover title="Ajustar à tela" style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></span>
      </div>
    </div>`;
  }
  function tela(){
    const cab = `<h1 style="font-family:'Space Grotesk',sans-serif;font-size:25px;font-weight:600;margin:0 0 6px">Organograma</h1>
      <p style="margin:0 0 22px;color:${CINZA}">Estrutura de liderança da empresa, montada a partir do líder direto definido em cada usuário.</p>`;
    if(!state.cfg){
      if(typeof cfgLoad === "function" && !_cfgLoading) setTimeout(cfgLoad, 0);
      return `<div style="padding:34px 40px 60px">${cab}<div style="color:${CINZA};font-size:13px">${state.cfgError ? e(state.cfgError) : "Carregando pessoas..."}</div></div>`;
    }
    const ms = ativos();
    const comLider = ms.filter(m => m.leaderId || m.role === "owner").length;
    const pct = ms.length ? Math.round(100 * comLider / ms.length) : 100;
    const linkLid = typeof souAdmin === "function" && (souAdmin() || pode("definir-lideranca"));
    if(!ms.length) return `<div style="padding:34px 40px 60px">${cab}<div style="padding:30px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;color:${CINZA};font-size:13px">Nenhuma pessoa ativa cadastrada ainda.</div></div>`;
    return `<div style="padding:34px 40px 60px">
      ${cab}
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:14px 18px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;margin-bottom:18px">
        <span style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:${CINZA}">${icon(ICONS.users, 13)}${ms.length} pessoa${ms.length === 1 ? "" : "s"}</span>
        <span style="font-size:12.5px;color:${CINZA}">·</span>
        <span style="font-size:12.5px;color:${pct === 100 ? VERDE : "#9A6700"}">${pct}% com liderança definida</span>
        ${linkLid ? `<span data-org-lideranca data-hover-border style="margin-left:auto;padding:8px 13px;border:1px solid #DADADF;border-radius:9px;font-size:12.5px;font-weight:500;cursor:pointer">Editar liderança</span>` : ""}
      </div>
      ${mapa()}
    </div>`;
  }

  // ─── zoom e arrastar (mesma mecânica da Árvore de OKRs) ────────────────────
  function aplicar(){ const t = og().tree, l = document.getElementById("org-tree-layer"); if(l) l.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.s})`; }
  function ajustar(){
    const c = document.getElementById("org-tree"); if(!c) return;
    const w = +c.dataset.w || NW, h = +c.dataset.h || NH, cw = c.clientWidth, ch = c.clientHeight;
    const s = Math.max(0.3, Math.min(1, (cw - 60) / w, (ch - 120) / h));
    const t = og().tree; t.s = s; t.x = Math.round((cw - w * s) / 2); t.y = Math.round(Math.max(64, (ch - h * s) / 2)); t.fitted = true;
    aplicar();
  }
  function zoom(f, cx, cy){
    const c = document.getElementById("org-tree"); if(!c) return;
    const t = og().tree, s2 = Math.max(0.3, Math.min(2.2, t.s * f));
    if(cx === undefined){ cx = c.clientWidth / 2; cy = c.clientHeight / 2; }
    t.x = cx - (cx - t.x) * s2 / t.s; t.y = cy - (cy - t.y) * s2 / t.s; t.s = s2;
    aplicar();
  }
  let _drag = null;
  window.addEventListener("mousemove", ev => { if(!_drag) return; const dx = ev.clientX - _drag.x, dy = ev.clientY - _drag.y; const t = og().tree; t.x = _drag.tx + dx; t.y = _drag.ty + dy; aplicar(); });
  window.addEventListener("mouseup", () => { if(!_drag) return; _drag.el.style.cursor = "grab"; _drag = null; });
  function ligar(){
    if(state.screen !== "organograma") return;
    const c = document.getElementById("org-tree");
    if(c && !c.dataset.bound){
      c.dataset.bound = "1";
      if(!og().tree.fitted) ajustar();
      c.addEventListener("mousedown", ev => { if(ev.button !== 0 || ev.target.closest("[data-org-ui]")) return; _drag = { el: c, x: ev.clientX, y: ev.clientY, tx: og().tree.x, ty: og().tree.y }; c.style.cursor = "grabbing"; ev.preventDefault(); });
      c.addEventListener("wheel", ev => { ev.preventDefault(); const r = c.getBoundingClientRect(); zoom(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
      c.addEventListener("click", ev => { const z = ev.target.closest("[data-org-zoom]"); if(!z) return; ev.stopPropagation(); const k = z.dataset.orgZoom; if(k === "fit") ajustar(); else zoom(k === "in" ? 1.2 : 0.83); });
      const inp = c.querySelector("[data-org-q]");
      if(inp) inp.addEventListener("input", () => {
        og().q = inp.value; const q = norm(inp.value), lista = nos();
        c.querySelectorAll("[data-org-node]").forEach(n => { const x = lista.find(y => y.id === n.dataset.orgNode); const h = !q || (x && norm(x.busca).indexOf(q) >= 0); n.style.opacity = q && !h ? .3 : 1; n.style.borderColor = q && h ? AMBAR : "#E6E6EA"; });
      });
    }
    const lk = document.querySelector("[data-org-lideranca]");
    if(lk && !lk.dataset.bound){ lk.dataset.bound = "1"; lk.addEventListener("click", ev => { ev.stopPropagation(); setState({ screen: "config", cfgSec: "lideranca" }); }); }
  }
  const _attachBase = attach;
  attach = function(){ _attachBase.apply(this, arguments); ligar(); };

  RENDERERS.organograma = tela;
  if(state.screen === "organograma"){ state.org = Object.assign({}, og()); render(); }
})();
