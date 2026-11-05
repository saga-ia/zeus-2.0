// Vídeos do ZEUS POST (/uploads/...) que o navegador não toca, como HEVC 10-bit gravado no iPhone: o Chrome carrega
// só o áudio e a tela fica preta. Para qualquer <video> com src /uploads/... na Central, pergunta ao servidor se precisa
// de prévia (/api/zeuspost-previa) e troca o src por uma cópia H.264 leve. O arquivo publicado não muda.
(function(){
  const RE = /^\/uploads\/[\w.-]+\.(?:mp4|mov|m4v)$/i;
  const pronto = new Map(); // src original -> src que toca
  const esperando = new Map(); // src original -> Promise

  function aviso(v, txt){
    let o = v._pvAviso;
    if(!txt){ if(o){ o.remove(); v._pvAviso = null; } return; }
    const pai = v.parentElement; if(!pai) return;
    if(getComputedStyle(pai).position === "static") pai.style.position = "relative";
    if(!o){ o = document.createElement("div"); o.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center;background:rgba(15,15,18,0.82);color:#FFFFFF;font-size:12.5px;line-height:1.5;pointer-events:none;z-index:2"; pai.appendChild(o); v._pvAviso = o; }
    o.innerHTML = `<span style="width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.25);border-top-color:#FFFFFF;animation:pvGira 0.9s linear infinite"></span><span>${txt}</span>`;
  }
  if(!document.getElementById("pv-css")){ const st = document.createElement("style"); st.id = "pv-css"; st.textContent = "@keyframes pvGira{to{transform:rotate(360deg)}}"; document.head.appendChild(st); }

  // consulta o servidor até a prévia ficar pronta (ou desistir em ~6 min)
  function resolver(src){
    if(esperando.has(src)) return esperando.get(src);
    const p = (async () => {
      for(let i = 0; i < 90; i++){
        try {
          const r = await fetch("/api/zeuspost-previa?u=" + encodeURIComponent(src), { credentials: "same-origin" });
          const j = await r.json();
          if(j.url){ pronto.set(src, j.url); return j.url; }
          if(!j.gerando) break;
        } catch(err){ break; }
        await new Promise(ok => setTimeout(ok, 4000));
      }
      return src;
    })();
    esperando.set(src, p);
    p.finally(() => esperando.delete(src));
    return p;
  }

  async function tratar(v){
    const src = v.getAttribute("src") || "";
    if(v.dataset.pv === src || !RE.test(src)) return;
    v.dataset.pv = src;
    if(pronto.has(src)){ const u = pronto.get(src); if(u !== src){ v.dataset.pv = u; v.src = u; } return; }
    const t = setTimeout(() => { if(v.isConnected && !pronto.has(src)) aviso(v, "Preparando a prévia do vídeo...<br><span style=\"opacity:0.7;font-size:11.5px\">O formato original (HEVC, do iPhone) não abre no navegador. O post sai normal no Instagram.</span>"); }, 700);
    const u = await resolver(src);
    clearTimeout(t); aviso(v, null);
    if(u !== src && v.isConnected && v.getAttribute("src") === src){ v.dataset.pv = u; v.src = u; }
  }

  const varrer = raiz => { (raiz.querySelectorAll ? raiz.querySelectorAll("video[src^='/uploads/']") : []).forEach(tratar); if(raiz.tagName === "VIDEO") tratar(raiz); };
  new MutationObserver(ms => { for(const m of ms) for(const n of m.addedNodes) if(n.nodeType === 1) varrer(n); }).observe(document.documentElement, { childList: true, subtree: true });
  varrer(document);
})();
