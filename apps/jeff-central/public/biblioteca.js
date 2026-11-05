// Biblioteca: pastas, arquivos, links e textos da empresa (substitui a renderBiblioteca de exemplo).
// Tudo que entra aqui é indexado na base de conhecimento e vira contexto do ZEUS e dos agentes nos chats.
// Carregado depois do script principal: usa state, icon, ICONS, e (escape), bindOnce, RENDERERS, pode, zPrompt, zConfirm, fmtBytes, kbTempo.
// Backend: /api/knowledge (knowledge.js). Favoritos e pastas abertas ficam no navegador de cada pessoa.
(function(){
  const ROXO = "#673DE6", VERM = "#C0341C", VERDE = "#0F7A68", CINZA = "#66666F";
  const HEAD = "font-family:'Space Grotesk',sans-serif";
  const IN = "width:100%;padding:10px 12px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none";
  const LBL = "font-size:12.5px;font-weight:500;margin-bottom:7px";
  const BTN_PRI = `padding:10px 18px;border-radius:10px;background:${ROXO};color:#FFFFFF;font:inherit;font-size:13px;font-weight:700;border:0;cursor:pointer`;
  const BTN_SEC = "padding:10px 16px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13px;background:#FFFFFF;color:#17171A;cursor:pointer";
  const ICO_LINK = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
  const ICO_TXT = '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 19h4"/>';
  const ICO_UP = '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>';
  const ICO_MOVE = '<path d="M3 7h6l2 2h10v10H3z"/><path d="M12 13h5M15 11l2 2-2 2"/>';

  // ─── estado ─────────────────────────────────────────────────────────────────
  const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch(_) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} };
  function bb(){
    if(!state.bib) state.bib = { data: null, loading: false, error: null, v: "inicio", q: "", hits: null, soDocs: false, menu: null,
      favs: ler("zeus.bibFavs", []), abertos: ler("zeus.bibAbertos", {}), modo: ler("zeus.bibModo", "lista"), ver: null, verLista: [] };
    return state.bib;
  }
  const podeEditar = () => typeof pode !== "function" || pode("editar-conhecimento");

  async function api(url, method, body){
    const opt = { method: method || "GET" };
    if(body instanceof FormData) opt.body = body;
    else if(body){ opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    const r = await fetch("/api/knowledge" + url, opt);
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  let _loading = false, _poll = null;
  async function load(){
    if(_loading) return; _loading = true;
    const b = bb(); b.loading = true;
    try { const j = await api(""); b.data = { docs: j.docs || [], folders: j.folders || [] }; b.error = null; }
    catch(err){ b.error = err.message; }
    b.loading = false; _loading = false;
    paint();
    // Enquanto algo indexa, confere de novo
    clearTimeout(_poll);
    if(b.data && b.data.docs.some(d => d.status === "queued" || d.status === "indexing") && state.screen === "biblioteca") _poll = setTimeout(load, 3000);
  }
  function toast(msg, erro){
    const t = document.createElement("div");
    t.style.cssText = `position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:90;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;color:#FFFFFF;background:${erro ? VERM : "#17171A"};box-shadow:0 12px 30px rgba(23,23,26,0.25)`;
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }

  // ─── dados derivados ────────────────────────────────────────────────────────
  const docs = () => (bb().data && bb().data.docs) || [];
  const pastas = () => (bb().data && bb().data.folders) || [];
  const pasta = id => pastas().find(f => f.id === id) || null;
  const filhas = pai => pastas().filter(f => (f.parentId || null) === (pai || null));
  const docsDe = pai => docs().filter(d => (d.folderId || null) === (pai || null));
  function caminho(id){ const out = []; let f = pasta(id), n = 0; while(f && n++ < 30){ out.unshift(f); f = f.parentId ? pasta(f.parentId) : null; } return out; }
  function totalItens(id){ return docsDe(id).length + filhas(id).length; }
  const pastaAtual = () => { const v = bb().v; return v.startsWith("f:") ? v.slice(2) : null; };
  const isFav = id => bb().favs.includes(id);
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function tipo(d){
    if(d.source === "link") return "Link";
    if(!d.file) return "Texto";
    const n = (d.file.name || "").toLowerCase(), m = d.file.mime || "";
    if(/\.pdf$/.test(n)) return "PDF";
    if(/\.docx?$/.test(n)) return "Word";
    if(/\.(xlsx?|csv)$/.test(n)) return "Planilha";
    if(/\.pptx?$/.test(n)) return "Apresentação";
    if(/^image\//.test(m)) return "Imagem";
    if(/^(audio|video)\//.test(m)) return "Mídia";
    const ext = n.match(/\.([a-z0-9]+)$/); return ext ? ext[1].toUpperCase() : "Arquivo";
  }
  const isImg = d => !!(d && d.file && /^image\//.test(d.file.mime || ""));
  const imgUrl = d => "/api/knowledge/" + encodeURIComponent(d.id) + "/file";
  const porTitulo = (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR", { numeric: true, sensitivity: "base" });
  const icoDoc = d => d.source === "link" ? ICO_LINK : d.file ? ICONS.file : ICO_TXT;
  function statusChip(d){
    if(d.status === "indexed") return "";
    const map = { queued: ["Na fila", CINZA, "#F1F1F3"], indexing: ["Lendo…", ROXO, "rgba(103,61,230,0.10)"], error: ["Erro ao ler", VERM, "rgba(192,52,28,0.08)"], notext: ["Sem texto", "#9A6700", "#FFF6E0"] };
    const s = map[d.status]; if(!s) return "";
    const tit = d.status === "notext" ? "Não foi possível extrair texto (ex.: imagem). O arquivo fica guardado, mas não entra no contexto dos agentes." : d.error || "";
    return `<span title="${e(tit)}" style="font-size:10.5px;font-weight:700;color:${s[1]};background:${s[2]};padding:2px 8px;border-radius:20px;white-space:nowrap">${s[0]}</span>`;
  }

  // ─── render ─────────────────────────────────────────────────────────────────
  const navLinha = (v, ico, rot, qtd) => {
    const ativo = bb().v === v && !bb().q;
    return `<div data-bib-v="${e(v)}" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;font-size:13px;cursor:pointer;${ativo ? `background:rgba(103,61,230,0.12);color:${ROXO};font-weight:600` : "color:#3C3C44"}">${icon(ico, 14)}<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(rot)}</span>${qtd !== undefined ? `<span style="font-size:11.5px;color:#9A9AA3">${qtd}</span>` : ""}</div>`;
  };
  function arvore(pai, nivel){
    return filhas(pai).map(f => {
      const sub = filhas(f.id).length, ab = !!bb().abertos[f.id], ativo = bb().v === "f:" + f.id && !bb().q;
      return `<div data-bib-v="f:${e(f.id)}" data-hover style="display:flex;align-items:center;gap:7px;padding:7px 10px 7px ${10 + nivel * 14}px;border-radius:9px;font-size:12.5px;cursor:pointer;${ativo ? `background:rgba(103,61,230,0.12);color:${ROXO};font-weight:600` : "color:#3C3C44"}">
        <span ${sub ? `data-bib-toggle="${e(f.id)}"` : ""} style="width:14px;height:14px;flex:0 0 14px;display:flex;align-items:center;justify-content:center">${sub ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${CINZA}" stroke-width="2.2" style="transition:transform .15s;transform:rotate(${ab ? 90 : 0}deg)">${ICONS.chevRight}</svg>` : `<span style="width:4px;height:4px;border-radius:50%;background:#C8C8CE"></span>`}</span>
        ${icon(ICONS.folder, 14, ativo ? ROXO : CINZA)}<span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(f.name)}</span>
      </div>${sub && ab ? arvore(f.id, nivel + 1) : ""}`;
    }).join("");
  }
  function lateral(){
    const b = bb(), favQtd = b.favs.filter(id => docs().some(d => d.id === id) || pasta(id)).length;
    return `<div style="width:250px;flex:0 0 250px;border-right:1px solid #E6E6EA;padding:18px 12px;display:flex;flex-direction:column;gap:2px;background:#FFFFFF;position:sticky;top:0;height:100vh;overflow-y:auto">
      <label style="display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid #DADADF;border-radius:10px;margin-bottom:12px;background:#FFFFFF">
        ${icon(ICONS.search, 13, CINZA)}<input id="bib-q" value="${e(b.q)}" placeholder="Buscar conhecimento" style="border:0;outline:none;font:inherit;font-size:12.5px;flex:1;min-width:0;background:transparent;color:#17171A">
      </label>
      ${navLinha("inicio", ICONS.biblioteca, "Início")}
      ${navLinha("recentes", ICONS.clock, "Recentes")}
      ${navLinha("favoritos", ICONS.star, "Favoritos", favQtd || undefined)}
      <div style="padding:18px 12px 6px;font-size:10px;letter-spacing:0.14em;color:${CINZA};font-weight:700">ARQUIVOS</div>
      ${navLinha("todos", ICONS.file, "Todos os arquivos", docs().length)}
      ${arvore(null, 0)}
      ${!pastas().length && b.data ? `<div style="padding:8px 12px;font-size:12px;color:#9A9AA3;line-height:1.5">Nenhuma pasta ainda.${podeEditar() ? " Use Adicionar › Nova pasta." : ""}</div>` : ""}
    </div>`;
  }
  function cartaoPasta(f){
    return `<div data-bib-v="f:${e(f.id)}" data-hover-border style="position:relative;${bb().menu === "pasta:" + f.id ? "z-index:80;" : ""}border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;padding:16px;cursor:pointer">
      <div style="display:flex;align-items:flex-start;margin-bottom:18px">
        <span style="width:32px;height:32px;border-radius:9px;background:rgba(103,61,230,0.1);display:flex;align-items:center;justify-content:center">${icon(ICONS.folder, 16, ROXO)}</span>
        <span style="flex:1"></span>
        ${isFav(f.id) ? `<span style="margin-right:4px">${icon(ICONS.star, 14, "#E0A100", "#E0A100")}</span>` : ""}
        <span data-bib-menu="pasta:${e(f.id)}" data-hover title="Opções" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.ellip, 15, CINZA)}</span>
      </div>
      <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(f.name)}</div>
      <div style="font-size:11.5px;color:${CINZA}">${totalItens(f.id)} ${totalItens(f.id) === 1 ? "item" : "itens"}</div>
      ${menuHTML("pasta:" + f.id)}
    </div>`;
  }
  const COLS = "display:grid;grid-template-columns:minmax(0,3fr) 110px 90px 110px 64px;gap:12px;align-items:center";
  function linhaDoc(d, extra){
    const onde = !pastaAtual() && d.folderId ? caminho(d.folderId).map(f => f.name).join(" / ") : "";
    return `<div data-bib-doc="${e(d.id)}" data-hover style="position:relative;${bb().menu === "doc:" + d.id ? "z-index:80;" : ""}${COLS};padding:11px 16px;border-top:1px solid #F1F1F3;font-size:13px;cursor:pointer">
      <span style="display:flex;align-items:center;gap:10px;min-width:0">
        ${isImg(d) ? `<img src="${imgUrl(d)}" loading="lazy" alt="" data-bib-ver="${e(d.id)}" title="Ver imagem" style="width:36px;height:45px;flex:0 0 36px;object-fit:cover;border-radius:6px;background:#F4F4F6;border:1px solid #ECECEF;cursor:zoom-in">`
          : `<span style="width:30px;height:30px;flex:0 0 30px;border-radius:8px;background:#F4F4F6;display:flex;align-items:center;justify-content:center">${icon(icoDoc(d), 15, "#4A4A52")}</span>`}
        <span style="min-width:0">
          <span style="display:flex;align-items:center;gap:8px"><span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(d.title)}</span>${statusChip(d)}</span>
          ${extra || onde ? `<span style="display:block;font-size:11.5px;color:#9A9AA3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${extra || e(onde)}</span>` : ""}
        </span>
      </span>
      <span style="color:#4A4A52">${e(tipo(d))}</span>
      <span style="color:#4A4A52">${d.file ? fmtBytes(d.file.size) : "—"}</span>
      <span style="color:#4A4A52">${kbTempo(d.updatedAt)}</span>
      <span style="display:flex;justify-content:flex-end;gap:2px">
        <span data-bib-fav="${e(d.id)}" data-hover title="${isFav(d.id) ? "Tirar dos favoritos" : "Favoritar"}" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${isFav(d.id) ? icon(ICONS.star, 14, "#E0A100", "#E0A100") : icon(ICONS.star, 14, "#B4B4BC")}</span>
        <span data-bib-menu="doc:${e(d.id)}" data-hover title="Opções" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.ellip, 15, CINZA)}</span>
      </span>
      ${menuHTML("doc:" + d.id)}
    </div>`;
  }
  // Título "Slide 3 · v2 (1080x1350)" -> { n: 3, v: 2 }
  function slideInfo(d){ const m = /slide\s*(\d+)(?:\D+v(\d+))?/i.exec(d.title || ""); return m ? { n: +m[1], v: m[2] ? +m[2] : 1 } : null; }
  // Por slide, só a versão mais nova (a menos que peçam todas)
  function ultimasVersoes(imgs){
    const por = {}, soltas = [];
    imgs.forEach(d => { const si = slideInfo(d); if(!si){ soltas.push(d); return; } const cur = por[si.n]; if(!cur || si.v > slideInfo(cur).v) por[si.n] = d; });
    const versoes = n => imgs.filter(d => { const si = slideInfo(d); return si && si.n === n; }).length;
    return { slides: Object.keys(por).map(Number).sort((a, b) => a - b).map(n => ({ d: por[n], versoes: versoes(n) })), soltas };
  }
  const nomePasta = k => { const f = k ? pasta(k) : null; return f ? String(f.name).replace(/^\d{4}-\d{2}-\d{2}\s*/, "") : "Raiz da Biblioteca"; };
  const dataPasta = k => { const f = k ? pasta(k) : null; const m = f && /^(\d{4})-(\d{2})-(\d{2})/.exec(f.name); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const IMG_CARD = "border:1px solid #E6E6EA;border-radius:14px;overflow:hidden;background:#FFFFFF;box-shadow:0 1px 2px rgba(23,23,26,0.04);transition:box-shadow .15s,transform .15s";
  const HOVER_CARD = `onmouseenter="this.style.boxShadow='0 10px 28px rgba(23,23,26,0.14)';this.style.transform='translateY(-2px)'" onmouseleave="this.style.boxShadow='0 1px 2px rgba(23,23,26,0.04)';this.style.transform='none'"`;
  function cardDoc(d){
    return `<div data-bib-doc="${e(d.id)}" ${HOVER_CARD} style="${IMG_CARD};cursor:pointer">
      <div style="aspect-ratio:4/5;background:#F8F8FA;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:${CINZA};font-size:12.5px">${icon(icoDoc(d), 30, "#9A9AA3")}${e(tipo(d))}</div>
      <div style="padding:11px 13px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(d.title)}</div></div>`;
  }
  function cardSlide(d, versoes){
    const si = slideInfo(d);
    return `<div data-bib-ver="${e(d.id)}" ${HOVER_CARD} style="${IMG_CARD};cursor:zoom-in;position:relative">
      <div style="aspect-ratio:4/5;background:#F4F4F6"><img src="${imgUrl(d)}" loading="lazy" decoding="async" alt="${e(d.title)}" style="width:100%;height:100%;object-fit:cover;display:block"></div>
${podeEditar() ? `<span data-bib-del-img="${e(d.id)}" title="Excluir esta imagem" style="position:absolute;top:10px;left:10px;width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.92);box-shadow:0 2px 6px rgba(23,23,26,0.18);display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.trash, 14, VERM)}</span>` : ""}
      ${versoes > 1 ? `<span style="position:absolute;top:10px;right:10px;padding:4px 9px;border-radius:999px;background:rgba(23,23,26,0.72);color:#FFFFFF;font-size:11px;font-weight:600">v${si ? si.v : ""} · ${versoes} versões</span>` : ""}
      <div style="padding:11px 13px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(d.title)}</div></div>`;
  }
  function galeria(lista, titulo){
    const b = bb(), dentro = pastaAtual();
    const grupos = [], porPasta = {};
    lista.forEach(d => { const k = d.folderId || ""; if(!porPasta[k]){ porPasta[k] = []; grupos.push(k); } porPasta[k].push(d); });
    const imgsTotal = lista.filter(isImg).length;
    const cab = (extra) => `<div style="display:flex;align-items:center;gap:9px;margin:26px 0 14px;flex-wrap:wrap"><h2 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">${titulo}</h2><span style="font-size:12px;color:${CINZA}">${lista.length}${imgsTotal ? ` · ${imgsTotal} imagens` : ""}</span>${extra || ""}</div>`;
    const GRADE = "display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px";

    // Dentro de uma pasta: slides grandes, só a versão mais nova (ou todas, se pedirem)
    if(dentro){
      const itens = lista.slice().sort(porTitulo), imgs = itens.filter(isImg), outros = itens.filter(d => !isImg(d));
      const { slides, soltas } = ultimasVersoes(imgs);
      const temVersoes = slides.some(x => x.versoes > 1);
      const limpa = temVersoes && podeEditar() ? `<span data-bib-del-antigas data-hover-border style="padding:7px 12px;border:1px solid rgba(192,52,28,0.35);border-radius:9px;font-size:12px;color:${VERM};cursor:pointer">Apagar versões antigas</span>` : "";
      const alterna = temVersoes ? `<span style="margin-left:auto;display:flex;gap:8px">${limpa}<span data-bib-versoes data-hover-border style="padding:7px 12px;border:1px solid #DADADF;border-radius:9px;font-size:12px;cursor:pointer">${b.todasVersoes ? "Só a versão mais nova" : "Mostrar todas as versões"}</span></span>` : "";
      const cards = b.todasVersoes ? imgs.map(d => cardSlide(d, 1)) : slides.map(x => cardSlide(x.d, x.versoes)).concat(soltas.map(d => cardSlide(d, 1)));
      return cab(alterna) + `<div style="${GRADE}">${cards.join("")}${outros.map(cardDoc).join("")}</div>`;
    }

    // Visão geral: um cartão por carrossel (pasta com slides), como em Criações do Design
    const cartoes = [], soltos = [];
    grupos.forEach(k => {
      const itens = porPasta[k], imgs = itens.filter(isImg);
      const { slides, soltas } = ultimasVersoes(imgs);
      if(k && slides.length >= 2){
        const capa = slides[0].d, maxV = Math.max(...imgs.map(d => (slideInfo(d) || { v: 1 }).v));
        const outros = itens.filter(d => !isImg(d)).length;
        cartoes.push(`<div data-bib-carrossel="${e(k)}" ${HOVER_CARD} style="${IMG_CARD};cursor:pointer;position:relative">
          <div style="aspect-ratio:4/5;background:#F4F4F6"><img src="${imgUrl(capa)}" loading="lazy" decoding="async" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>
${podeEditar() ? `<span data-bib-del-carrossel="${e(k)}" title="Excluir o carrossel (todas as imagens)" style="position:absolute;top:10px;left:10px;width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.92);box-shadow:0 2px 6px rgba(23,23,26,0.18);display:flex;align-items:center;justify-content:center;cursor:pointer">${icon(ICONS.trash, 14, VERM)}</span>` : ""}
          <span style="position:absolute;top:10px;right:10px;padding:4px 9px;border-radius:999px;background:rgba(23,23,26,0.72);color:#FFFFFF;font-size:11px;font-weight:600">${slides.length} slides${maxV > 1 ? " · v" + maxV : ""}</span>
          <div style="padding:11px 13px">
            <div style="font-size:13px;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${e(nomePasta(k))}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:11.5px;color:${CINZA}">${dataPasta(k) ? `<span>${dataPasta(k)}</span><span>·</span>` : ""}<span style="white-space:nowrap">${maxV > 1 ? imgs.length + " imagens" : (outros ? outros + " doc" + (outros > 1 ? "s" : "") : "")}</span><span data-bib-v="f:${e(k)}" style="margin-left:auto;color:${ROXO};font-weight:600;cursor:pointer;white-space:nowrap">Abrir pasta</span></div>
          </div></div>`);
        soltas.forEach(d => soltos.push(cardSlide(d, 1)));
      } else {
        imgs.forEach(d => soltos.push(cardSlide(d, 1)));
      }
      itens.filter(d => !isImg(d)).forEach(d => { if(!(k && slides.length >= 2)) soltos.push(cardDoc(d)); });
    });
    return cab() + (cartoes.length ? `<div style="${GRADE}">${cartoes.join("")}</div>` : "")
      + (soltos.length ? `${cartoes.length ? `<div style="${HEAD};font-size:13.5px;font-weight:600;margin:30px 0 14px">Outros arquivos</div>` : ""}<div style="${GRADE}">${soltos.join("")}</div>` : "");
  }
  function viewer(){
    const b = bb(); if(!b.ver) return "";
    const d = docs().find(x => x.id === b.ver); if(!d){ b.ver = null; return ""; }
    const i = b.verLista.indexOf(d.id), n = b.verLista.length;
    const seta = (dir, lado) => n > 1 ? `<span data-bib-ver-nav="${dir}" title="${dir < 0 ? "Anterior (←)" : "Próxima (→)"}" style="position:absolute;${lado}:18px;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#FFFFFF;font-size:26px;line-height:1">${dir < 0 ? "‹" : "›"}</span>` : "";
    const btn = "display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:9px;background:rgba(255,255,255,0.12);color:#FFFFFF;font-size:12.5px;text-decoration:none;cursor:pointer";
    return `<div data-bib-viewer style="position:fixed;inset:0;z-index:95;background:rgba(14,14,18,0.92);display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;color:#FFFFFF">
        <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e(d.title)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6)">${n > 1 ? `${i + 1} de ${n} · ` : ""}${d.folderId ? e(caminho(d.folderId).map(f => f.name).join(" / ")) : "Raiz"}</div></div>
        <a href="${imgUrl(d)}" style="${btn}">${icon(ICONS.download, 13, "currentColor")}Baixar</a>
        <span data-bib-ver-detalhes="${e(d.id)}" style="${btn}">${icon(ICONS.info, 13, "currentColor")}Detalhes</span>
        ${podeEditar() ? `<span data-bib-ver-excluir="${e(d.id)}" style="${btn};background:rgba(192,52,28,0.85)">${icon(ICONS.trash, 13, "currentColor")}Excluir</span>` : ""}
        <span data-bib-ver-fechar title="Fechar (Esc)" style="${btn};font-size:16px">✕</span>
      </div>
      <div data-bib-ver-fundo style="position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 80px 24px">
        <img src="${imgUrl(d)}" alt="${e(d.title)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,0.45)">
        ${seta(-1, "left")}${seta(1, "right")}
      </div>
      ${n > 1 ? `<div style="display:flex;gap:8px;justify-content:center;padding:0 18px 18px;overflow-x:auto">${b.verLista.map((id, k) => { const x = docs().find(y => y.id === id); return x ? `<img data-bib-ver-ir="${e(id)}" src="${imgUrl(x)}" loading="lazy" alt="" style="width:48px;height:60px;flex:0 0 48px;object-fit:cover;border-radius:6px;cursor:pointer;opacity:${k === i ? 1 : 0.45};outline:${k === i ? "2px solid #FFFFFF" : "none"};outline-offset:2px">` : ""; }).join("")}</div>` : ""}
    </div>`;
  }
  async function apagarDocs(ids){
    let ok = 0;
    for(const id of ids){ try { await api("/" + encodeURIComponent(id), "DELETE"); ok++; } catch(_){} }
    return ok;
  }
  async function excluirImagem(id){
    const b = bb(), d = docs().find(x => x.id === id); if(!d) return;
    if(!await zConfirm(`Excluir "${d.title}"? A imagem é apagada da Biblioteca. Isso não tem volta.`)) return;
    if(!await apagarDocs([id])) return toast("Não consegui excluir.", true);
    if(b.ver === id){ const i = b.verLista.indexOf(id); b.verLista = b.verLista.filter(x => x !== id); b.ver = b.verLista.length ? b.verLista[Math.min(i, b.verLista.length - 1)] : null; }
    else b.verLista = b.verLista.filter(x => x !== id);
    b.data.docs = b.data.docs.filter(x => x.id !== id); paint(); toast("Imagem excluída."); load();
  }
  async function excluirCarrossel(k){
    const imgs = docs().filter(d => (d.folderId || "") === k && isImg(d)); if(!imgs.length) return;
    if(!await zConfirm(`Excluir as ${imgs.length} imagens do carrossel "${nomePasta(k)}" (todas as versões)? A pasta e os textos dela continuam. Isso não tem volta.`)) return;
    const ok = await apagarDocs(imgs.map(d => d.id)); toast(ok === imgs.length ? `${ok} imagens excluídas.` : `${ok} de ${imgs.length} excluídas.`, ok !== imgs.length); load();
  }
  async function excluirVersoesAntigas(k){
    const imgs = docs().filter(d => (d.folderId || "") === k && isImg(d));
    const manter = new Set(ultimasVersoes(imgs).slides.map(x => x.d.id));
    const apagar = imgs.filter(d => slideInfo(d) && !manter.has(d.id));
    if(!apagar.length) return toast("Não há versões antigas.");
    if(!await zConfirm(`Apagar ${apagar.length} versões antigas e manter só a mais nova de cada slide (${manter.size} imagens ficam)? Isso não tem volta.`)) return;
    const ok = await apagarDocs(apagar.map(d => d.id)); toast(`${ok} versões antigas apagadas.`, ok !== apagar.length); load();
  }
  function abrirViewer(id, lista){
    const b = bb();
    if(lista && lista.length){ b.verLista = lista; b.ver = id || lista[0]; return paint(); }
    // Ordem da navegação = ordem em que as imagens aparecem na tela
    const ids = Array.from(document.querySelectorAll("#bib-main [data-bib-ver]")).map(x => x.getAttribute("data-bib-ver"));
    b.verLista = ids.filter((x, k) => ids.indexOf(x) === k);
    if(!b.verLista.includes(id)) b.verLista.push(id);
    b.ver = id; paint();
  }
  function navViewer(dir){
    const b = bb(); if(!b.ver || b.verLista.length < 2) return;
    const i = b.verLista.indexOf(b.ver), n = b.verLista.length;
    b.ver = b.verLista[(i + dir + n) % n]; paint();
  }
  function tabela(lista, titulo, extraDe){
    if(bb().modo === "galeria") return galeria(lista, titulo);
    return `<div style="display:flex;align-items:center;gap:9px;margin:26px 0 12px"><h2 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">${titulo}</h2><span style="font-size:12px;color:${CINZA}">${lista.length}</span></div>
      <div style="border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;overflow:visible">
        <div style="${COLS};padding:11px 16px;font-size:12px;font-weight:600;color:${CINZA}"><span>Nome</span><span>Tipo</span><span>Tamanho</span><span>Modificado</span><span></span></div>
        ${lista.map(d => linhaDoc(d, extraDe ? extraDe(d) : "")).join("")}
      </div>`;
  }
  function menuHTML(chave){
    if(bb().menu !== chave) return "";
    const [tipoItem, id] = chave.split(":");
    const it = (acao, ico, rot, cor) => `<div data-bib-acao="${acao}" data-bib-id="${e(id)}" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:8px;font-size:13px;cursor:pointer;color:${cor || "#17171A"}">${icon(ico, 14, cor || "#3C3C44")}${rot}</div>`;
    let corpo = "";
    if(tipoItem === "pasta"){
      corpo = it("fav-pasta", ICONS.star, isFav(id) ? "Tirar dos favoritos" : "Favoritar")
        + (podeEditar() ? it("renomear-pasta", ICONS.edit, "Renomear") + it("mover-pasta", ICO_MOVE, "Mover") + it("excluir-pasta", ICONS.trash, "Excluir pasta", VERM) : "");
    } else {
      const d = docs().find(x => x.id === id) || {};
      corpo = it("abrir", ICONS.info, "Detalhes e conteúdo")
        + (d.file ? `<a href="/api/knowledge/${e(id)}/file" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:8px;font-size:13px;color:#17171A;text-decoration:none">${icon(ICONS.download, 14, "#3C3C44")}Baixar</a>` : "")
        + (d.url ? `<a href="${e(d.url)}" target="_blank" rel="noopener" data-hover style="display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:8px;font-size:13px;color:#17171A;text-decoration:none">${icon(ICONS.extLink, 14, "#3C3C44")}Abrir link</a>` : "")
        + (podeEditar() ? it("renomear-doc", ICONS.edit, "Renomear") + it("mover-doc", ICO_MOVE, "Mover") + it("reler-doc", ICONS.refresh, "Ler de novo") + it("excluir-doc", ICONS.trash, "Excluir", VERM) : "");
    }
    return `<div data-bib-menu-box class="pop-down" style="position:absolute;right:10px;top:${tipoItem === "pasta" ? "46px" : "40px"};z-index:70;min-width:190px;padding:5px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 16px 40px rgba(23,23,26,0.16);cursor:default;text-align:left">${corpo}</div>`;
  }
  function botaoAdicionar(){
    if(!podeEditar()) return "";
    const aberto = bb().menu === "add";
    const it = (acao, ico, rot, sub) => `<div data-bib-acao="${acao}" data-hover style="display:flex;align-items:flex-start;gap:10px;padding:9px 11px;border-radius:8px;cursor:pointer">${icon(ico, 15, "#3C3C44")}<span><span style="display:block;font-size:13px;font-weight:600">${rot}</span><span style="display:block;font-size:11.5px;color:${CINZA};margin-top:2px">${sub}</span></span></div>`;
    return `<div style="position:relative">
      <span data-bib-menu="add" data-hover-dark style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:${ROXO};color:#FFFFFF;font-size:13px;font-weight:700;cursor:pointer">${icon(ICONS.plus, 14, "currentColor")}Adicionar${icon(ICONS.chevDown, 13, "currentColor")}</span>
      ${aberto ? `<div data-bib-menu-box class="pop-down" style="position:absolute;right:0;top:46px;z-index:20;width:270px;padding:5px;border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;box-shadow:0 16px 40px rgba(23,23,26,0.16)">
        ${it("upload", ICO_UP, "Enviar arquivos", "PDF, Word, Excel, PowerPoint, texto... até 50 MB cada")}
        ${it("link", ICO_LINK, "Adicionar link", "O ZEUS lê a página e guarda o conteúdo")}
        ${it("texto", ICO_TXT, "Escrever texto", "Processo, política, roteiro, FAQ...")}
        <div style="height:1px;background:#F1F1F3;margin:4px 6px"></div>
        ${it("nova-pasta", ICONS.folder, "Nova pasta", pastaAtual() ? "Dentro da pasta atual" : "Na raiz da Biblioteca")}
      </div>` : ""}
      <input id="bib-files" type="file" multiple hidden>
    </div>`;
  }
  function cabecalho(titulo, sub, trilha){
    const b = bb();
    return `${trilha ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:${CINZA};margin-bottom:10px">${trilha}</div>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">
        <div style="flex:1;min-width:240px">
          <h1 style="${HEAD};font-size:23px;font-weight:600;margin:0 0 5px">${titulo}</h1>
          <p style="margin:0;color:${CINZA};font-size:13.5px;line-height:1.5">${sub}</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span style="display:inline-flex;border:1px solid #DADADF;border-radius:10px;overflow:hidden;font-size:12.5px">${[["lista", "Lista"], ["galeria", "Galeria"]].map(([m, rot]) => `<span data-bib-modo="${m}" style="padding:10px 13px;cursor:pointer;${b.modo === m ? `background:rgba(103,61,230,0.08);color:${ROXO};font-weight:600` : "color:#3C3C44"}">${rot}</span>`).join("")}</span>
          <span data-bib-sodocs data-hover-border style="padding:10px 14px;border:1px solid ${b.soDocs ? ROXO : "#DADADF"};border-radius:10px;font-size:12.5px;cursor:pointer;${b.soDocs ? `color:${ROXO};font-weight:600;background:rgba(103,61,230,0.06)` : ""}">Só documentos</span>
          ${botaoAdicionar()}
        </div>
      </div>`;
  }
  const vazio = (txt) => `<div style="margin-top:22px;padding:34px 20px;border:1px dashed #DADADF;border-radius:14px;text-align:center;color:${CINZA};font-size:13px;line-height:1.6;background:#FFFFFF">${txt}</div>`;
  const AVISO_IA = "Qualquer arquivo até 50 MB, um link ou um texto. Tudo que tem texto vira base de conhecimento do ZEUS e dos agentes nas conversas.";

  function conteudo(){
    const b = bb();
    if(b.error && !b.data) return `<div style="color:${VERM};font-size:13px">Não consegui carregar a Biblioteca: ${e(b.error)}</div>`;
    if(!b.data) return `<div style="color:${CINZA};font-size:13px">Carregando a Biblioteca...</div>`;
    // Busca: título/pasta e conteúdo (trechos indexados)
    if(b.q.trim()){
      const q = norm(b.q);
      const pastasAchadas = pastas().filter(f => norm(f.name).includes(q));
      const porTitulo = docs().filter(d => norm(d.title).includes(q) || norm(d.file && d.file.name).includes(q));
      const vistos = new Set(porTitulo.map(d => d.id));
      const snip = {};
      (b.hits || []).forEach(h => { if(!snip[h.docId]) snip[h.docId] = h.snippet; });
      const porConteudo = Object.keys(snip).map(id => docs().find(d => d.id === id)).filter(d => d && !vistos.has(d.id));
      const trecho = d => snip[d.id] ? e(snip[d.id]).replace(/\[\[/g, `<mark style="background:rgba(103,61,230,0.16);color:inherit;border-radius:3px;padding:0 2px">`).replace(/\]\]/g, "</mark>") : "";
      const lista = porTitulo.concat(porConteudo);
      return cabecalho(`Busca: “${e(b.q.trim())}”`, "Procura no nome dos arquivos e pastas e dentro do conteúdo de tudo que foi lido.")
        + (pastasAchadas.length && !b.soDocs ? `<div style="display:flex;align-items:center;gap:9px;margin:26px 0 12px"><h2 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">Pastas</h2><span style="font-size:12px;color:${CINZA}">${pastasAchadas.length}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">${pastasAchadas.map(cartaoPasta).join("")}</div>` : "")
        + (lista.length ? tabela(lista, "Arquivos e links", trecho) : (b.hits === null ? vazio("Buscando...") : vazio("Nada encontrado. Tente outra palavra.")));
    }
    if(b.v === "recentes"){
      const lista = docs().slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, 30);
      return cabecalho("Recentes", "Os 30 itens adicionados ou alterados por último.") + (lista.length ? tabela(lista, "Arquivos e links") : vazio("Nada por aqui ainda."));
    }
    if(b.v === "favoritos"){
      const fp = pastas().filter(f => isFav(f.id)), fd = docs().filter(d => isFav(d.id));
      return cabecalho("Favoritos", "Seus atalhos. Os favoritos ficam só no seu navegador.")
        + (fp.length && !b.soDocs ? `<div style="display:flex;align-items:center;gap:9px;margin:26px 0 12px"><h2 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">Pastas</h2><span style="font-size:12px;color:${CINZA}">${fp.length}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">${fp.map(cartaoPasta).join("")}</div>` : "")
        + (fd.length ? tabela(fd, "Arquivos e links") : (!fp.length ? vazio("Use a estrela ao lado de um arquivo ou o menu de uma pasta para favoritar.") : ""));
    }
    if(b.v === "todos"){
      const lista = docs();
      return cabecalho("Todos os arquivos", "Tudo que o time já guardou, das pastas à raiz.") + (lista.length ? tabela(lista, "Arquivos e links") : vazio(podeEditar() ? "A Biblioteca está vazia. Use <b>Adicionar</b> para enviar o primeiro arquivo." : "A Biblioteca está vazia."));
    }
    // Início (raiz) ou uma pasta
    const id = pastaAtual();
    if(id && !pasta(id)){ b.v = "inicio"; return conteudo(); }
    const subs = filhas(id), lista = docsDe(id);
    const trilha = id ? `<span data-bib-v="inicio" style="cursor:pointer">Arquivos</span>` + caminho(id).map((f, i, arr) => `${icon(ICONS.chevRight, 12, "#B4B4BC")}${i === arr.length - 1 ? `<span style="color:#17171A;font-weight:600">${e(f.name)}</span>` : `<span data-bib-v="f:${e(f.id)}" style="cursor:pointer">${e(f.name)}</span>`}`).join("") : "";
    const f = id ? pasta(id) : null;
    return cabecalho(f ? e(f.name) : "Biblioteca", AVISO_IA, trilha)
      + (subs.length && !b.soDocs ? `<div style="display:flex;align-items:center;gap:9px;margin:26px 0 12px"><h2 style="${HEAD};font-size:14.5px;font-weight:600;margin:0">Pastas</h2><span style="font-size:12px;color:${CINZA}">${subs.length}</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">${subs.map(cartaoPasta).join("")}</div>` : "")
      + (lista.length ? tabela(lista, "Arquivos e links")
        : (!subs.length || b.soDocs ? vazio(podeEditar() ? `${id ? "Esta pasta está vazia." : "A Biblioteca está vazia."} Arraste arquivos para cá ou use <b>Adicionar</b>.` : "Nada por aqui ainda.") : ""));
  }
  function page(){
    return `<div style="display:flex;align-items:stretch;min-height:100vh">
      ${lateral()}
      <div id="bib-main" style="flex:1;min-width:0;padding:26px 30px 60px;position:relative">
        <div style="max-width:1100px;margin:0 auto">${conteudo()}</div>
        ${viewer()}
        <div id="bib-drop" style="display:none;position:absolute;inset:12px;border:2px dashed ${ROXO};border-radius:16px;background:rgba(103,61,230,0.06);align-items:center;justify-content:center;font-size:15px;font-weight:600;color:${ROXO};pointer-events:none">Solte para enviar ${pastaAtual() ? "para " + e((pasta(pastaAtual()) || {}).name || "a pasta") : "para a Biblioteca"}</div>
      </div>
    </div>`;
  }
  // Menu de opções perto do rodapé da tela: abre para cima, para o "Excluir" não ficar atrás do botão flutuante do ZEUS
  function ajustarMenu(){
    const box = document.querySelector("#main-slot [data-bib-menu-box]"); if(!box || !box.parentElement) return;
    const r = box.getBoundingClientRect();
    if(r.bottom > window.innerHeight - 90){ box.style.top = "auto"; box.style.bottom = "calc(100% - 6px)"; }
  }
  function paint(){
    const root = document.getElementById("bib-root"); if(!root) return;
    const q = document.getElementById("bib-q");
    const foco = q && document.activeElement === q ? q.selectionStart : null;
    root.innerHTML = page();
    ajustarMenu();
    if(foco !== null){ const q2 = document.getElementById("bib-q"); if(q2){ q2.focus(); q2.setSelectionRange(foco, foco); } }
  }

  // ─── ações ──────────────────────────────────────────────────────────────────
  function opcoesPasta(excluir){
    // Todas as pastas com caminho completo; exclui a própria e as de dentro dela (ao mover pasta)
    const proibidas = new Set();
    if(excluir){ const marca = id => { proibidas.add(id); filhas(id).forEach(f => marca(f.id)); }; marca(excluir); }
    return [["", "Biblioteca (raiz)"]].concat(pastas().filter(f => !proibidas.has(f.id)).map(f => [f.id, caminho(f.id).map(x => x.name).join(" / ")]).sort((a, b) => a[1].localeCompare(b[1])));
  }
  const selectPasta = (atual, excluir) => `<select name="folderId" class="cat-select" style="width:100%;max-width:none">${opcoesPasta(excluir).map(o => `<option value="${e(o[0])}" ${String(atual || "") === o[0] ? "selected" : ""}>${e(o[1])}</option>`).join("")}</select>`;

  async function enviarArquivos(files){
    files = Array.from(files || []); if(!files.length) return;
    const grandes = files.filter(f => f.size > 50 * 1024 * 1024);
    if(grandes.length){ toast(`Acima de 50 MB: ${grandes.map(f => f.name).join(", ")}`, true); files = files.filter(f => f.size <= 50 * 1024 * 1024); if(!files.length) return; }
    for(let i = 0; i < files.length; i += 20){
      const fd = new FormData();
      files.slice(i, i + 20).forEach(f => fd.append("files", f));
      if(pastaAtual()) fd.append("folderId", pastaAtual());
      toast(`Enviando ${files.length} arquivo${files.length > 1 ? "s" : ""}...`);
      try { await api("", "POST", fd); } catch(err){ toast("Falhou: " + err.message, true); return; }
    }
    toast(files.length > 1 ? "Arquivos enviados. O ZEUS está lendo o conteúdo." : "Arquivo enviado.");
    load();
  }
  function novoLink(){
    pdiModal({ title: "Adicionar link", sub: "O ZEUS abre o link, lê o conteúdo da página (ou do PDF) e guarda para os agentes usarem.", submit: "Adicionar",
      body: `<div><div style="${LBL}">Link</div><input name="url" type="url" required placeholder="https://..." style="${IN}"></div>
        <div><div style="${LBL}">Nome</div><input name="title" placeholder="Ex.: Tabela de preços 2026" style="${IN}"></div>
        <div><div style="${LBL}">Pasta</div>${selectPasta(pastaAtual())}</div>`,
      onSubmit: async d => {
        const url = d.url.trim(); if(!url) return false;
        let titulo = d.title.trim(); if(!titulo){ try { titulo = new URL(url).hostname.replace(/^www\./, ""); } catch(_) { titulo = url; } }
        try { const j = await api("", "POST", { title: titulo, url, source: "link", folderId: d.folderId || null }); const doc = (j.docs || [])[0];
          toast(doc && doc.status === "error" ? "Link salvo, mas não consegui ler: " + (doc.error || "erro") : "Link adicionado.", doc && doc.status === "error");
          load(); return true; }
        catch(err){ toast("Falhou: " + err.message, true); return false; }
      } });
  }
  function novoTexto(){
    pdiModal({ title: "Escrever texto", sub: "Processos, políticas, roteiros, respostas prontas. Os agentes consultam isso nas conversas.", submit: "Salvar", width: 680,
      body: `<div><div style="${LBL}">Título</div><input name="title" required placeholder="Ex.: Política de reembolso" style="${IN}"></div>
        <div><div style="${LBL}">Conteúdo</div><textarea name="content" required rows="12" placeholder="Escreva ou cole o texto..." style="${IN};resize:vertical;line-height:1.55"></textarea></div>
        <div><div style="${LBL}">Pasta</div>${selectPasta(pastaAtual())}</div>`,
      onSubmit: async d => {
        if(!d.title.trim() || !d.content.trim()) return false;
        try { await api("", "POST", { title: d.title.trim(), content: d.content, source: "texto", folderId: d.folderId || null }); toast("Texto salvo."); load(); return true; }
        catch(err){ toast("Falhou: " + err.message, true); return false; }
      } });
  }
  async function novaPasta(){
    const n = await zPrompt(pastaAtual() ? `Dentro de ${(pasta(pastaAtual()) || {}).name}.` : "Na raiz da Biblioteca.", "", { title: "Nova pasta", placeholder: "Ex.: Comercial", ok: "Criar pasta" });
    if(!n || !n.trim()) return;
    try { await api("/folders", "POST", { name: n.trim(), parentId: pastaAtual() }); if(pastaAtual()){ bb().abertos[pastaAtual()] = true; gravar("zeus.bibAbertos", bb().abertos); } toast("Pasta criada."); load(); }
    catch(err){ toast("Falhou: " + err.message, true); }
  }
  async function detalhes(id){
    let d;
    try { d = (await api("/" + encodeURIComponent(id))).doc; } catch(err){ return toast("Falhou: " + err.message, true); }
    const onde = d.folderId ? caminho(d.folderId).map(f => f.name).join(" / ") : "Biblioteca (raiz)";
    const info = (k, v) => `<div style="display:flex;gap:12px;font-size:13px;padding:7px 0;border-top:1px solid #F1F1F3"><span style="width:120px;flex:0 0 120px;color:${CINZA}">${k}</span><span style="min-width:0;overflow-wrap:anywhere">${v}</span></div>`;
    const usoIA = d.status === "indexed" ? `<span style="color:${VERDE};font-weight:600">Em uso pelo ZEUS e pelos agentes</span> · ${d.chunks} trecho${d.chunks === 1 ? "" : "s"}, ${d.chars.toLocaleString("pt-BR")} caracteres`
      : d.status === "notext" ? `<span style="color:#9A6700;font-weight:600">Sem texto legível</span> · guardado, mas fora do contexto dos agentes`
      : d.status === "error" ? `<span style="color:${VERM};font-weight:600">Erro ao ler</span> · ${e(d.error || "")}` : "Lendo o conteúdo...";
    const texto = (d.text || d.content || "").slice(0, 20000);
    pdiModal({ title: e(d.title), submit: "Fechar", width: 720,
      extra: podeEditar() ? `<span data-bib-del-modal="${e(d.id)}" data-hover-border style="display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:1px solid rgba(192,52,28,0.35);border-radius:10px;font-size:13px;color:${VERM};cursor:pointer">${icon(ICONS.trash, 13, "currentColor")}Excluir</span>` : "",
      body: `${isImg(d) ? `<div style="margin-bottom:12px;text-align:center;background:#F4F4F6;border-radius:12px;padding:10px"><img src="${imgUrl(d)}" alt="" style="max-width:100%;max-height:420px;border-radius:8px"></div>` : ""}<div>${info("Tipo", e(tipo(d)))}${info("Pasta", e(onde))}${d.file ? info("Arquivo", `<a href="/api/knowledge/${e(d.id)}/file" style="color:${ROXO};font-weight:500">${e(d.file.name)}</a> · ${fmtBytes(d.file.size)}`) : ""}${d.url ? info("Link", `<a href="${e(d.url)}" target="_blank" rel="noopener" style="color:${ROXO}">${e(d.url)}</a>`) : ""}${info("Modificado", e(kbTempo(d.updatedAt)))}${info("Base de conhecimento", usoIA)}</div>
        ${texto ? `<div><div style="${LBL}">Conteúdo lido</div><div style="max-height:320px;overflow-y:auto;padding:12px 14px;border:1px solid #EFEFF1;border-radius:10px;background:#FAFAFA;font-size:12.5px;line-height:1.6;white-space:pre-wrap;color:#3C3C44">${e(texto)}${(d.text || "").length > 20000 ? "\n\n…" : ""}</div></div>` : ""}`,
      onSubmit: async () => true });
  }
  function mover(tipoItem, id){
    const atual = tipoItem === "pasta" ? (pasta(id) || {}).parentId : (docs().find(d => d.id === id) || {}).folderId;
    pdiModal({ title: "Mover para...", submit: "Mover", body: `<div><div style="${LBL}">Destino</div>${selectPasta(atual, tipoItem === "pasta" ? id : null)}</div>`,
      onSubmit: async d => {
        try { await api(tipoItem === "pasta" ? "/folders/" + encodeURIComponent(id) : "/" + encodeURIComponent(id), "PATCH", tipoItem === "pasta" ? { parentId: d.folderId || null } : { folderId: d.folderId || null }); toast("Movido."); load(); return true; }
        catch(err){ toast("Falhou: " + err.message, true); return false; }
      } });
  }
  async function acao(a, id){
    bb().menu = null;
    const d = docs().find(x => x.id === id), f = pasta(id);
    try {
      if(a === "upload"){ paint(); const i = document.getElementById("bib-files"); if(i) i.click(); return; }
      if(a === "link") { paint(); return novoLink(); }
      if(a === "texto") { paint(); return novoTexto(); }
      if(a === "nova-pasta") { paint(); return novaPasta(); }
      if(a === "abrir") { paint(); return detalhes(id); }
      if(a === "fav-pasta") { alternarFav(id); return; }
      if(a === "renomear-pasta" && f){ paint(); const n = await zPrompt("", f.name, { title: "Renomear pasta", ok: "Salvar" }); if(n && n.trim() && n.trim() !== f.name){ await api("/folders/" + encodeURIComponent(id), "PATCH", { name: n.trim() }); toast("Pasta renomeada."); load(); } return; }
      if(a === "renomear-doc" && d){ paint(); const n = await zPrompt("", d.title, { title: "Renomear", ok: "Salvar" }); if(n && n.trim() && n.trim() !== d.title){ await api("/" + encodeURIComponent(id), "PATCH", { title: n.trim() }); toast("Renomeado."); load(); } return; }
      if(a === "mover-pasta") { paint(); return mover("pasta", id); }
      if(a === "mover-doc") { paint(); return mover("doc", id); }
      if(a === "reler-doc"){ paint(); toast("Lendo de novo..."); await api("/" + encodeURIComponent(id) + "/reindex", "POST"); toast("Conteúdo atualizado."); load(); return; }
      if(a === "excluir-pasta" && f){ paint(); const n = totalItens(id); if(!await zConfirm(`Excluir a pasta "${f.name}"?${n ? ` Os ${n} ${n === 1 ? "item" : "itens"} dela sobem para ${f.parentId ? "a pasta de cima" : "a raiz"}; nenhum arquivo é apagado.` : ""}`)) return; await api("/folders/" + encodeURIComponent(id), "DELETE"); if(pastaAtual() === id) bb().v = f.parentId ? "f:" + f.parentId : "inicio"; toast("Pasta excluída."); load(); return; }
      if(a === "excluir-doc" && d){ paint(); if(!await zConfirm(`Excluir "${d.title}"? O arquivo é apagado e sai da base de conhecimento dos agentes. Isso não tem volta.`)) return; await api("/" + encodeURIComponent(id), "DELETE"); toast("Excluído."); load(); return; }
    } catch(err){ toast("Falhou: " + err.message, true); }
    paint();
  }
  // Excluir pela janela de detalhes (ela fica fora da área da Biblioteca, por isso o clique é ouvido no documento)
  document.addEventListener("click", ev => {
    const el = ev.target.closest && ev.target.closest("[data-bib-del-modal]"); if(!el) return;
    ev.preventDefault(); ev.stopPropagation();
    const id = el.getAttribute("data-bib-del-modal");
    pdiModalClose();
    acao("excluir-doc", id);
  }, true);
  function alternarFav(id){
    const b = bb(); b.favs = isFav(id) ? b.favs.filter(x => x !== id) : b.favs.concat(id); gravar("zeus.bibFavs", b.favs); paint();
  }
  let _busca = null;
  function buscar(){
    const b = bb(); clearTimeout(_busca);
    const q = b.q.trim(); if(!q){ b.hits = null; return paint(); }
    b.hits = null; paint();
    _busca = setTimeout(async () => {
      try { const j = await api("/search?q=" + encodeURIComponent(q) + "&limit=30"); if(bb().q.trim() === q){ bb().hits = j.hits || []; paint(); } }
      catch(_){ bb().hits = []; paint(); }
    }, 250);
  }

  function bind(root){
    bindOnce(root, "click", ev => {
      const t = ev.target, q = s => t.closest && t.closest(s); let el;
      const b = bb();
      if(q("[data-bib-viewer]")){
        if((el = q("[data-bib-ver-nav]"))) return navViewer(+el.getAttribute("data-bib-ver-nav"));
        if((el = q("[data-bib-ver-excluir]"))) return excluirImagem(el.getAttribute("data-bib-ver-excluir"));
        if((el = q("[data-bib-ver-ir]"))){ b.ver = el.getAttribute("data-bib-ver-ir"); return paint(); }
        if((el = q("[data-bib-ver-detalhes]"))){ const id = el.getAttribute("data-bib-ver-detalhes"); b.ver = null; paint(); return detalhes(id); }
        if(q("[data-bib-viewer] a")) return;
        if(q("[data-bib-ver-fechar]") || (t.hasAttribute && t.hasAttribute("data-bib-ver-fundo"))){ b.ver = null; return paint(); }
        return;
      }
      if((el = q("[data-bib-del-img]"))){ ev.stopPropagation(); return excluirImagem(el.getAttribute("data-bib-del-img")); }
      if((el = q("[data-bib-del-carrossel]"))){ ev.stopPropagation(); return excluirCarrossel(el.getAttribute("data-bib-del-carrossel")); }
      if(q("[data-bib-del-antigas]")){ const k = pastaAtual(); if(k) return excluirVersoesAntigas(k); }
      if(q("[data-bib-versoes]")){ b.todasVersoes = !b.todasVersoes; return paint(); }
      if((el = q("[data-bib-carrossel]")) && !q("[data-bib-v]")){
        const k = el.getAttribute("data-bib-carrossel");
        const { slides, soltas } = ultimasVersoes(docs().filter(d => (d.folderId || "") === k && isImg(d)));
        return abrirViewer(null, slides.map(x => x.d.id).concat(soltas.sort(porTitulo).map(d => d.id)));
      }
      if((el = q("[data-bib-modo]"))){ b.modo = el.getAttribute("data-bib-modo"); gravar("zeus.bibModo", b.modo); return paint(); }
      if((el = q("[data-bib-ver]"))){ ev.stopPropagation(); return abrirViewer(el.getAttribute("data-bib-ver")); }
      if((el = q("[data-bib-toggle]"))){ ev.stopPropagation(); const id = el.getAttribute("data-bib-toggle"); b.abertos[id] = !b.abertos[id]; gravar("zeus.bibAbertos", b.abertos); return paint(); }
      if((el = q("[data-bib-acao]"))){ ev.stopPropagation(); return acao(el.getAttribute("data-bib-acao"), el.getAttribute("data-bib-id")); }
      if(q("[data-bib-menu-box] a")) { b.menu = null; return; }
      if((el = q("[data-bib-menu]"))){ ev.stopPropagation(); const k = el.getAttribute("data-bib-menu"); b.menu = b.menu === k ? null : k; return paint(); }
      if(q("[data-bib-menu-box]")) return;
      if(b.menu){ b.menu = null; paint(); }
      if((el = q("[data-bib-fav]"))){ ev.stopPropagation(); return alternarFav(el.getAttribute("data-bib-fav")); }
      if(q("[data-bib-sodocs]")){ b.soDocs = !b.soDocs; return paint(); }
      if((el = q("[data-bib-v]"))){
        const v = el.getAttribute("data-bib-v");
        b.v = v; b.q = ""; b.hits = null;
        // Abrir uma pasta expande o caminho dela na árvore
        if(v.startsWith("f:")){ caminho(v.slice(2)).slice(0, -1).forEach(f => { b.abertos[f.id] = true; }); gravar("zeus.bibAbertos", b.abertos); }
        paint(); const m = document.getElementById("bib-main"); if(m) window.scrollTo(0, 0); return;
      }
      if((el = q("[data-bib-doc]"))) return detalhes(el.getAttribute("data-bib-doc"));
    });
    bindOnce(root, "input", ev => { if(ev.target && ev.target.id === "bib-q"){ bb().q = ev.target.value; buscar(); } });
    bindOnce(root, "change", ev => { if(ev.target && ev.target.id === "bib-files"){ const fs = ev.target.files; enviarArquivos(fs); ev.target.value = ""; } });
    // Arrastar e soltar arquivos na área principal
    let prof = 0;
    const drop = on => { const z = document.getElementById("bib-drop"); if(z) z.style.display = on ? "flex" : "none"; };
    const temArquivo = ev => ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes("Files");
    bindOnce(root, "dragenter", ev => { if(!temArquivo(ev) || !podeEditar() || !ev.target.closest("#bib-main")) return; ev.preventDefault(); prof++; drop(true); });
    bindOnce(root, "dragover", ev => { if(temArquivo(ev) && podeEditar()) ev.preventDefault(); });
    bindOnce(root, "dragleave", ev => { if(!temArquivo(ev)) return; prof = Math.max(0, prof - 1); if(!prof) drop(false); });
    bindOnce(root, "drop", ev => { if(!temArquivo(ev) || !podeEditar()) return; ev.preventDefault(); prof = 0; drop(false); enviarArquivos(ev.dataTransfer.files); });
  }
  document.addEventListener("keydown", ev => {
    if(state.bib && state.bib.ver && state.screen === "biblioteca"){
      if(ev.key === "Escape"){ state.bib.ver = null; return paint(); }
      if(ev.key === "ArrowLeft") return navViewer(-1);
      if(ev.key === "ArrowRight") return navViewer(1);
    }
    if(ev.key === "Escape" && state.bib && state.bib.menu){ state.bib.menu = null; paint(); }
  });

  RENDERERS.biblioteca = function(){
    setTimeout(() => {
      const root = document.getElementById("bib-root"); if(!root) return;
      bind(root);
      const b = bb();
      if(!b.loading) load();
    }, 0);
    return `<div id="bib-root">${page()}</div>`;
  };
  if(state.screen === "biblioteca"){ const slot = document.getElementById("main-slot"); if(slot) slot.innerHTML = RENDERERS.biblioteca(); }
})();
