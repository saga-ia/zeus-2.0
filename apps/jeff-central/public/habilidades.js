// Habilidades: tela /habilidades com criação, edição, exclusão e restauração (substitui a renderHabilidades só-leitura).
// Carregado depois do script principal: usa state, render, icon, ICONS, e (escape), bindOnce, RENDERERS e agentsLoad de lá.
// Backend: /api/skills (skills.js).
(function(){
  const AMBAR = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none";
  const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.5";
  const BTN_PRI = "padding:10px 18px;border-radius:10px;background:" + AMBAR + ";color:#FFFFFF;font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer";
  const BTN_SEC = "padding:10px 16px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const ICO_PEN = '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M12.5 7.5l4 4"/>';
  const ICO_UNDO = '<path d="M4 10h10a5 5 0 0 1 0 10h-3"/><path d="M8 6l-4 4 4 4"/>';

  function hb(){ if(!state.hab) state.hab = { data: null, hidden: [], loading: false, error: null, q: "" }; return state.hab; }
  async function apiJ(url, method, body){
    const r = await fetch("/api/skills" + url, { method: method || "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  let _loading = false;
  async function load(){
    if(_loading) return; _loading = true;
    const h = hb(); h.loading = true;
    try {
      const [a, b] = await Promise.all([apiJ(""), apiJ("/_hidden/list")]);
      h.data = a.skills; h.hidden = b.hidden || []; h.error = null;
    } catch(err){ h.error = err.message; }
    h.loading = false; _loading = false;
    paint();
  }
  // Depois de criar/editar: recarrega a tela e o catálogo dos agentes (o cadastro do agente lista as habilidades)
  async function recarregar(){ await load(); state.agentsData = null; if(typeof agentsLoad === "function") agentsLoad(); }

  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slugify = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  function toast(msg, erro){
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:80;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;color:#FFFFFF;background:${erro ? VERM : "#17171A"};box-shadow:0 10px 30px rgba(23,23,26,0.25);max-width:min(560px,90vw)`;
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }

  // ─── render ─────────────────────────────────────────────────────────────────
  const badge = s => s.kind === "skill"
    ? `<span title="Skill instalada neste servidor (${e(s.origem)})" style="font-size:10.5px;font-weight:700;color:${VERDE};border:1px solid rgba(15,122,104,0.4);padding:3px 8px;border-radius:6px">SKILL</span>`
    : `<span title="Instrução curta anexada ao prompt do agente" style="font-size:10.5px;font-weight:700;color:${AMBAR};border:1px solid rgba(103,61,230,0.4);padding:3px 8px;border-radius:6px">REGRA</span>`;
  const origemTxt = s => s.origin === "custom" ? "criada aqui" : s.origin === "user-skill" ? "skill sua" : s.origin === "seed" ? "padrão" : s.origem;
  const acao = (attr, id, titulo, ico, cor) => `<span data-hab-${attr}="${e(id)}" data-hover title="${titulo}" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ico, 13, cor || "#9A9AA3")}</span>`;

  function page(){
    const h = hb(), skills = h.data || [];
    const agentes = (state.agentsData && state.agentsData.agents) || [];
    const usoPor = {};
    agentes.forEach(a => (a.skills || []).forEach(id => { usoPor[id] = (usoPor[id] || 0) + 1; }));
    const q = norm(h.q);
    const vis = q ? skills.filter(s => norm(s.name).includes(q) || norm(s.id).includes(q) || norm(s.desc).includes(q) || norm(s.group).includes(q)) : skills;
    const grupos = [];
    vis.forEach(s => { let g = grupos.find(x => x.name === s.group); if(!g){ g = { name: s.group, items: [] }; grupos.push(g); } g.items.push(s); });
    const nSkill = skills.filter(s => s.kind === "skill").length, nRegra = skills.length - nSkill;
    const nMinhas = skills.filter(s => s.origin === "custom" || s.origin === "user-skill").length;
    const nAgentes = agentes.filter(a => (a.skills || []).length).length;
    const kpis = [["Habilidades no catálogo", String(skills.length), "#17171A"], ["Skills do servidor", String(nSkill), VERDE], ["Regras de prompt", String(nRegra), "#17171A"], ["Criadas por você", String(nMinhas), AMBAR], ["Agentes com habilidades", String(nAgentes), "#17171A"]];
    const usoTxt = n => n === 1 ? "1 agente" : `${n} agentes`;
    return `<div style="padding:34px 40px 60px;max-width:1240px">
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;margin-bottom:24px">
        <div style="flex:1;min-width:260px">
          <h1 style="${HEAD};font-size:25px;font-weight:600;margin:0 0 6px">Habilidades</h1>
          <p style="margin:0;color:${CINZA}">O que seus agentes sabem fazer. Skills instaladas neste servidor e regras de prompt. Crie as suas, edite as existentes e ative no cadastro de cada agente.</p>
        </div>
        <div style="display:flex;gap:10px">
          <span data-hab-refresh data-hover-border style="display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #DADADF;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer">${icon(ICONS.refresh, 14, "currentColor")}Atualizar</span>
          <span data-hab-new data-hover-dark style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9px;background:${AMBAR};color:#FFFFFF;font-size:13px;font-weight:700;cursor:pointer">${icon(ICONS.plus, 14, "currentColor")}Nova habilidade</span>
        </div>
      </div>
      ${h.error ? `<div style="border:1px solid rgba(192,52,28,0.35);background:rgba(192,52,28,0.06);border-radius:12px;padding:14px 16px;font-size:13px;color:${VERM};margin-bottom:20px">${/HTTP 404/.test(h.error) ? "A rota /api/skills ainda não está ativa no servidor (falta reiniciar o jeff-central)." : e(h.error)}</div>` : ""}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px">
        ${kpis.map(k => `<div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;padding:18px"><div style="font-size:12.5px;color:${CINZA};margin-bottom:12px">${e(k[0])}</div><div style="${HEAD};font-size:30px;font-weight:600;line-height:1;color:${k[2]}">${e(k[1])}</div></div>`).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:9px;max-width:420px;padding:0 13px;border:1px solid #DADADF;border-radius:9px;background:#FFFFFF;margin-bottom:26px">${icon(ICONS.search, 13, CINZA)}<input id="hab-q" value="${e(h.q)}" placeholder="Buscar habilidade" style="flex:1;border:0;outline:0;padding:9px 0;font:inherit;font-size:12.5px;background:transparent;color:#17171A"></div>
      ${!h.data ? `<div style="padding:30px 0;color:${CINZA};font-size:13px">${h.loading ? "Carregando habilidades..." : ""}</div>` : ""}
      ${h.data && !vis.length ? `<div style="padding:30px 0;color:${CINZA};font-size:13px">Nenhuma habilidade encontrada.</div>` : ""}
      ${grupos.map(g => `
        <div style="margin-bottom:30px">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px"><h2 style="${HEAD};font-size:15px;font-weight:600;margin:0">${e(g.name)}</h2><span style="font-size:12px;color:${CINZA}">${g.items.length}</span></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px">
            ${g.items.map(s => { const uso = usoPor[s.id] || 0; return `
              <div data-hover-border style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;padding:16px;display:flex;flex-direction:column;gap:11px">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="width:28px;height:28px;flex:0 0 28px;border-radius:8px;background:${s.kind === "skill" ? "rgba(15,122,104,0.12)" : "rgba(103,61,230,0.14)"};display:flex;align-items:center;justify-content:center">${icon(ICONS.bolt, 14, "none", s.kind === "skill" ? VERDE : AMBAR)}</span>
                  <div data-hab-edit="${e(s.id)}" style="${HEAD};font-size:14.5px;font-weight:600;flex:1;line-height:1.35;cursor:pointer">${e(s.name)}</div>
                  ${badge(s)}
                </div>
                <p style="margin:0;font-size:12.5px;color:${CINZA};line-height:1.55;flex:1">${e(s.desc || "")}</p>
                <div style="display:flex;align-items:center;gap:6px;padding-top:11px;border-top:1px solid #E6E6EA;min-width:0">
                  <span style="font-size:11.5px;color:${CINZA};${MONO};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1" title="${e(s.kind === "skill" ? s.slug : s.id)} · ${e(origemTxt(s))}${s.overridden ? " · editada" : ""}">${e(s.kind === "skill" ? "/" + s.slug : "regra · " + s.id)}${s.overridden ? ` <span style="color:${AMBAR}">· editada</span>` : ""}</span>
                  <span style="flex:0 0 auto;display:flex;align-items:center;gap:5px;font-size:12px;color:${uso ? "#17171A" : CINZA};margin-right:4px" title="${e(usoTxt(uso))} usando">${icon(ICONS.briefcase, 12, "currentColor")}${uso}</span>
                  ${acao("edit", s.id, "Editar", ICO_PEN)}
                  ${s.overridden && s.origin !== "custom" ? acao("restore", s.id, "Restaurar padrão", ICO_UNDO, AMBAR) : ""}
                  ${s.deletable ? acao("del", s.id, s.origin === "seed" ? "Ocultar regra padrão" : "Excluir", ICONS.trash, VERM) : ""}
                </div>
              </div>`; }).join("")}
          </div>
        </div>`).join("")}
      ${h.hidden.length ? `<div style="border:1px dashed #DADADF;border-radius:12px;padding:14px 16px;font-size:12.5px;color:${CINZA}">
        <div style="font-weight:600;color:#3C3C44;margin-bottom:8px">Regras padrão ocultas (${h.hidden.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${h.hidden.map(x => `<span style="display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #E6E6EA;border-radius:8px;background:#FFFFFF">${e(x.name)}<span data-hab-restore="${e(x.id)}" style="color:${AMBAR};font-weight:600;cursor:pointer">Restaurar</span></span>`).join("")}</div>
      </div>` : ""}
    </div>`;
  }
  function paint(){
    const root = document.getElementById("hab-root"); if(!root) return;
    const q = document.getElementById("hab-q");
    if(q && document.activeElement === q){ const v = q.value, pos = q.selectionStart; root.innerHTML = page(); const q2 = document.getElementById("hab-q"); if(q2){ q2.focus(); q2.setSelectionRange(pos, pos); } return; }
    root.innerHTML = page();
  }

  // ─── modal ──────────────────────────────────────────────────────────────────
  function modal(opts){
    fecharModal();
    const m = document.createElement("div");
    m.id = "hab-modal";
    m.style.cssText = "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(23,23,26,0.32)";
    m.innerHTML = `<form id="hab-form" class="pop-down" style="width:100%;max-width:${opts.width || 680}px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;border-radius:18px;background:#FFFFFF;box-shadow:0 24px 60px rgba(23,23,26,0.25);overflow:hidden;margin:0">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px;border-bottom:1px solid #E6E6EA">
        <div style="flex:1;min-width:0"><div style="${HEAD};font-size:18px;font-weight:600">${opts.title}</div>${opts.sub ? `<div style="font-size:12.5px;color:${CINZA};margin-top:4px;line-height:1.5">${opts.sub}</div>` : ""}</div>
        <span data-hab-close data-hover title="Fechar" style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 32px">${icon(ICONS.x, 16, CINZA)}</span>
      </div>
      <div id="hab-modal-body" style="padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px">${opts.body}</div>
      <div id="hab-modal-foot" style="display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #E6E6EA">${opts.footer || ""}<span style="flex:1"></span><span data-hab-close style="${BTN_SEC}">Cancelar</span><button type="submit" style="${BTN_PRI}">${opts.submit || "Salvar"}</button></div>
    </form>`;
    m.addEventListener("click", ev => { if(ev.target === m || (ev.target.closest && ev.target.closest("[data-hab-close]"))) fecharModal(); });
    document.body.appendChild(m);
    const first = m.querySelector("input[name=name]"); if(first) setTimeout(() => first.focus(), 30);
    return m;
  }
  function fecharModal(){ const m = document.getElementById("hab-modal"); if(m) m.remove(); }
  document.addEventListener("keydown", ev => { if(ev.key === "Escape") fecharModal(); });

  const lbl = (t, sub) => `<div style="font-size:12.5px;font-weight:500;margin-bottom:6px">${t}${sub ? `<span style="font-weight:400;color:#9A9AA3"> · ${sub}</span>` : ""}</div>`;
  function grupos(){ const set = []; (hb().data || []).forEach(s => { if(s.group && !set.includes(s.group)) set.push(s.group); }); return set; }
  const inGrupo = v => `<input name="group" list="hab-grupos" value="${e(v || "")}" placeholder="Ex: Vendas, Conteúdo, Minhas regras" style="${IN}"><datalist id="hab-grupos">${grupos().map(g => `<option value="${e(g)}">`).join("")}</datalist>`;

  function camposRegra(s){
    return `<div>${lbl("Nome")}<input name="name" required maxlength="120" value="${e(s.name || "")}" placeholder="Ex: Resposta com próximos passos" style="${IN}"></div>
      <div>${lbl("Grupo")}${inGrupo(s.group)}</div>
      <div>${lbl("Instrução", "vai anexada ao prompt do agente que ativar esta regra")}<textarea name="instruction" required rows="6" maxlength="4000" placeholder="Ex: Sempre termine a resposta com um bloco de próximos passos, com responsável e prazo." style="${IN};resize:vertical">${e(s.instruction || "")}</textarea></div>`;
  }
  function camposSkill(s, criando){
    const soMeta = !criando && s.origin !== "user-skill";
    return `<div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:2 1 240px">${lbl("Nome")}<input name="name" required maxlength="120" value="${e(s.name || "")}" placeholder="Ex: Auditoria de proposta" style="${IN}"></div>
        <div style="flex:1 1 200px">${lbl("Identificador", criando ? "vira o /slug que o agente aciona" : "")}<input name="slug" ${criando ? "" : "disabled"} pattern="[a-z0-9][a-z0-9\\-]{1,47}" value="${e(s.slug || "")}" placeholder="auditoria-proposta" style="${IN};${MONO}"></div>
      </div>
      <div>${lbl("Grupo")}${inGrupo(s.group)}</div>
      <div>${lbl("Quando acionar", "descrição curta; é o que o agente lê pra decidir usar a skill")}<textarea name="desc" ${soMeta ? "" : "required"} rows="2" maxlength="600" placeholder="Ex: Use quando o usuário pedir pra revisar, auditar ou pontuar uma proposta comercial." style="${IN};resize:vertical">${e(s.desc || "")}</textarea></div>
      ${soMeta
        ? `<div style="font-size:12.5px;color:${CINZA};padding:10px 12px;border:1px dashed #DADADF;border-radius:10px">Esta skill vem de <strong>${e(s.origem)}</strong>: o conteúdo dela é gerenciado fora daqui. Aqui você ajusta só o nome, o grupo e a descrição que os agentes veem.</div>`
        : `<div>${lbl("Instruções (SKILL.md)", "o procedimento que o agente segue ao acionar a skill; aceita Markdown")}<textarea name="body" required rows="14" placeholder="# Nome da skill&#10;&#10;## Quando usar&#10;...&#10;&#10;## Passo a passo&#10;1. ...&#10;2. ...&#10;&#10;## Formato da entrega&#10;..." style="${IN};${MONO};resize:vertical">${e(s.body || "")}</textarea></div>`}`;
  }

  // Toda habilidade nova é uma skill: procedimento completo em SKILL.md que o agente aciona pela ferramenta Skill.
  function abrirNova(){
    const m = modal({ title: "Nova habilidade", sub: "Procedimento completo em SKILL.md, salvo no servidor. Depois de criar, ative no cadastro dos agentes que devem usar.", body: `<div id="hab-campos">${camposSkill({}, true)}</div>`, submit: "Criar" });
    const form = m.querySelector("#hab-form");
    form.addEventListener("input", ev => {
      if(ev.target.name === "name"){ const sl = form.querySelector("input[name=slug]"); if(sl && !sl.dataset.touched) sl.value = slugify(ev.target.value); }
      if(ev.target.name === "slug") ev.target.dataset.touched = "1";
    });
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const o = leia(form); o.kind = "skill";
      o.slug = slugify(o.slug || o.name);
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Criando…";
      try { const r = await apiJ("", "POST", o); fecharModal(); toast("Criada: " + r.skill.name); recarregar(); }
      catch(err){ btn.disabled = false; btn.textContent = "Criar"; toast("Falhou: " + err.message, true); }
    });
  }
  function leia(form){ const o = {}; new FormData(form).forEach((v, k) => { o[k] = v; }); return o; }

  async function abrirEditar(id){
    const m = modal({ title: "Editar habilidade", body: `<div style="padding:24px;text-align:center;color:${CINZA};font-size:13px">Carregando…</div>` });
    let s;
    try { s = (await apiJ("/" + encodeURIComponent(id))).skill; }
    catch(err){ m.querySelector("#hab-modal-body").innerHTML = `<div style="color:${VERM};font-size:13px">${e(err.message)}</div>`; return; }
    if(!document.getElementById("hab-modal")) return;
    if(s.kind === "skill" && s.body) s.body = s.body.replace(/^---[\s\S]*?\n---\r?\n?/, "");
    m.querySelector("#hab-modal-body").innerHTML = (s.kind === "regra" ? camposRegra(s) : camposSkill(s, false));
    const sub = m.querySelector("#hab-form > div > div > div"); if(sub) sub.insertAdjacentHTML("afterend", `<div style="font-size:12.5px;color:${CINZA};margin-top:4px">${e(s.kind === "skill" ? "/" + s.slug : "regra · " + s.id)} · ${e(origemTxt(s))}${s.file ? " · " + e(s.file) : ""}</div>`);
    const form = m.querySelector("#hab-form");
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const o = leia(form), body = {};
      if(s.kind === "regra"){ body.name = o.name; body.group = o.group; body.instruction = o.instruction; }
      else { body.name = o.name; body.group = o.group; body.desc = o.desc; if(o.body !== undefined) body.body = o.body; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Salvando…";
      try { await apiJ("/" + encodeURIComponent(s.id), "PUT", body); fecharModal(); toast("Salvo."); recarregar(); }
      catch(err){ btn.disabled = false; btn.textContent = "Salvar"; toast("Falhou: " + err.message, true); }
    });
  }
  async function excluir(id){
    const s = (hb().data || []).find(x => x.id === id); if(!s) return;
    const msg = s.origin === "seed" ? `Ocultar a regra padrão "${s.name}"? Você pode restaurar depois.`
      : s.origin === "user-skill" ? `Excluir a skill "${s.name}"? A pasta dela no servidor (/${s.slug}) será apagada. Isso não tem volta.`
      : `Excluir a regra "${s.name}"? Isso não tem volta.`;
    if(!confirm(msg)) return;
    try { await apiJ("/" + encodeURIComponent(id), "DELETE"); toast(s.origin === "seed" ? "Regra ocultada." : "Excluída."); recarregar(); }
    catch(err){ toast("Falhou: " + err.message, true); }
  }
  async function restaurar(id){
    try { await apiJ("/" + encodeURIComponent(id) + "/restore", "POST"); toast("Padrão restaurado."); recarregar(); }
    catch(err){ toast("Falhou: " + err.message, true); }
  }

  function bind(root){
    bindOnce(root, "click", ev => {
      const t = ev.target, q = sel => t.closest && t.closest(sel); let el;
      if(q("[data-hab-new]")) return abrirNova();
      if(q("[data-hab-refresh]")) return recarregar();
      if((el = q("[data-hab-edit]"))) return abrirEditar(el.getAttribute("data-hab-edit"));
      if((el = q("[data-hab-del]"))) return excluir(el.getAttribute("data-hab-del"));
      if((el = q("[data-hab-restore]"))) return restaurar(el.getAttribute("data-hab-restore"));
    });
    bindOnce(root, "input", ev => { if(ev.target && ev.target.id === "hab-q"){ hb().q = ev.target.value; paint(); } });
  }

  RENDERERS.habilidades = function(){
    setTimeout(() => {
      const root = document.getElementById("hab-root"); if(!root) return;
      bind(root);
      const h = hb();
      if(!h.data && !h.loading) load();
      if(!state.agentsData && typeof agentsLoad === "function") agentsLoad();
    }, 0);
    return `<div id="hab-root">${page()}</div>`;
  };
  if(state.screen === "habilidades"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.habilidades(); }
})();
