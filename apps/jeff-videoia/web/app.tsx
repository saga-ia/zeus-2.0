// Editor de vídeo com IA: lista de projetos e a tela de edição (mídias | prévia ao vivo | IA e inspetor, linha do tempo embaixo).
// A prévia é o MESMO componente do render (estudio/lib/edicao.tsx) tocando no navegador: mexeu, já aparece.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import { Edicao, metadados, linha, normaliza } from "../../jeff-video/estudio/lib/edicao";
import { api, relogio, useFrame, useTocando, timecode, mmss, copia, palavrasDaEdicao, dividir, clipeNoQuadro, guardar } from "./util";
import { Timeline } from "./timeline";
import { PainelIA, InspetorClipe, InspetorEstilo, InspetorTextos, PainelMidia, PainelTexto, Exportar } from "./paineis";

const Video: React.FC<any> = (p) => <Edicao {...p} />;

// ─── Projetos ───────────────────────────────────────────────────────────────────────────────────────────────────────
function Home({ eu }: any) {
  const [lista, setLista] = useState<any[] | null>(null);
  const carregar = () => api("/api/projetos").then(setLista).catch((e) => alert(e.message));
  useEffect(() => { carregar(); }, []);
  async function novo() {
    const nome = prompt("Nome do projeto", "Vídeo " + new Date().toLocaleDateString("pt-BR"));
    if (nome === null) return;
    const p = await api("/api/projetos", { method: "POST", body: { nome } });
    location.href = "/p/" + p.id;
  }
  async function apagar(p: any) {
    if (!confirm(`Apagar "${p.nome}" com os vídeos e exportações? Não dá pra desfazer.`)) return;
    await api("/api/projetos/" + p.id, { method: "DELETE" }); carregar();
  }
  return (
    <div className="home">
      <header className="topo">
        <div className="marca"><span className="logo">Z</span> Vídeo IA</div>
        <div className="topo-dir"><span className="quem">{eu && eu.nome}</span><button className="btn" onClick={() => api("/api/sair", { method: "POST" }).then(() => (location.href = "/login"))}>Sair</button></div>
      </header>
      <main className="home-corpo">
        <div className="home-cab"><h1>Projetos</h1><button className="btn prim" onClick={novo}>+ Novo projeto</button></div>
        {lista === null ? <p className="vazio">Carregando…</p> : !lista.length ? (
          <div className="home-vazio"><b>Nenhum projeto ainda.</b><p>Crie um projeto, suba o vídeo e peça a edição pra IA, ou edite na linha do tempo.</p><button className="btn prim" onClick={novo}>+ Novo projeto</button></div>
        ) : (
          <div className="grade">
            {lista.map((p) => (
              <a key={p.id} className="cartao" href={"/p/" + p.id}>
                <div className="cartao-capa" style={p.capa ? { backgroundImage: `url(${p.capa})` } : undefined}>{!p.capa && "sem vídeo"}{p.tarefa && !p.tarefa.erro && <span className="selo">processando</span>}</div>
                <div className="cartao-info">
                  <b>{p.nome}</b>
                  <small>{p.midias} vídeo(s) · {mmss(p.duracao)} · {new Date(p.atualizado).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</small>
                </div>
                <button className="cartao-apagar" title="Apagar" onClick={(e) => { e.preventDefault(); apagar(p); }}>×</button>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Player ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Previa({ props, meta, playerRef, vazio }: any) {
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 300, h: 500 });
  useLayoutEffect(() => {
    const el = caixa.current; if (!el) return;
    const up = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    up(); const ro = new ResizeObserver(up); ro.observe(el); return () => ro.disconnect();
  }, []);
  const esc = Math.min(tam.w / meta.width, tam.h / meta.height);
  useEffect(() => {
    const p = playerRef.current; if (!p) return;
    const fu = (e: any) => relogio.set(e.detail.frame);
    const pl = () => relogio.setTocando(true), pa = () => relogio.setTocando(false);
    p.addEventListener("frameupdate", fu); p.addEventListener("play", pl); p.addEventListener("pause", pa); p.addEventListener("ended", pa);
    return () => { p.removeEventListener("frameupdate", fu); p.removeEventListener("play", pl); p.removeEventListener("pause", pa); p.removeEventListener("ended", pa); };
  }, [vazio]);
  return (
    <div className="previa" ref={caixa}>
      {vazio ? <div className="previa-vazia"><b>Sem vídeo na linha do tempo</b><small>Suba um vídeo na aba Mídia</small></div> : (
        <Player ref={playerRef} component={Video} inputProps={props} durationInFrames={meta.durationInFrames} fps={meta.fps}
          compositionWidth={meta.width} compositionHeight={meta.height} style={{ width: meta.width * esc, height: meta.height * esc }}
          clickToPlay={false} spaceKeyToPlayOrPause={false} doubleClickToFullscreen allowFullscreen numberOfSharedAudioTags={8}
          acknowledgeRemotionLicense />
      )}
    </div>
  );
}

const Ic = ({ d, cheio }: { d: string; cheio?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={cheio ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const IC = {
  inicio: "M6 5v14M18 6l-9 6 9 6z", fim: "M18 5v14M6 6l9 6-9 6z", ant: "M15 6l-6 6 6 6", prox: "M9 6l6 6-6 6",
  play: "M7 5l12 7-12 7z", pausa: "M8 5v14M16 5v14",
};

function Transporte({ fps, total, playerRef, tocarClipe, sel }: any) {
  const f = useFrame(), tocando = useTocando();
  const p = () => playerRef.current;
  const ir = (q: number) => p()?.seekTo(Math.max(0, Math.min(total - 1, q)));
  return (
    <div className="transp">
      <span className="tc">{timecode(f, fps)}</span>
      <div className="transp-bts">
        <button title="Início (Home)" onClick={() => ir(0)}><Ic d={IC.inicio} /></button>
        <button title="Voltar 1 quadro (←)" onClick={() => ir(f - 1)}><Ic d={IC.ant} /></button>
        <button className="play" title="Tocar/pausar (Espaço)" onClick={() => p()?.toggle()}>{tocando ? <Ic d={IC.pausa} /> : <Ic d={IC.play} cheio />}</button>
        <button title="Avançar 1 quadro (→)" onClick={() => ir(f + 1)}><Ic d={IC.prox} /></button>
        <button title="Fim (End)" onClick={() => ir(total - 1)}><Ic d={IC.fim} /></button>
        <button className="so-clipe" title="Tocar só o clipe selecionado" disabled={sel === null} onClick={tocarClipe}><Ic d={IC.play} cheio /> clipe</button>
      </div>
      <span className="tc fraco">{timecode(Math.max(0, total - 1), fps)}</span>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Editor({ id, eu }: any) {
  const [proj, setProj] = useState<any>(null);
  const [props, setPropsEstado] = useState<any>(null);
  const propsRef = useRef<any>(null);
  const hist = useRef<{ passado: any[]; futuro: any[] }>({ passado: [], futuro: [] });
  const [, setVersaoHist] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [abaEsq, setAbaEsq] = useState(() => guardar.ler("videoia-aba-esq", "midia"));
  const [abaDir, setAbaDir] = useState(() => guardar.ler("videoia-aba-dir", "ia"));
  const [px, setPx] = useState(40);
  const [exportando, setExportando] = useState(false);
  const [salvo, setSalvo] = useState<"salvo" | "salvando" | "erro">("salvo");
  const [ondas, setOndas] = useState<Record<string, Uint8Array>>({});
  const playerRef = useRef<PlayerRef>(null);
  const pararEm = useRef<number | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => guardar.gravar("videoia-aba-esq", abaEsq), [abaEsq]);
  useEffect(() => guardar.gravar("videoia-aba-dir", abaDir), [abaDir]);

  const setProps = (p: any) => { propsRef.current = p; setPropsEstado(p); };

  // ── carregar e acompanhar processamento/exportação
  const carregar = useCallback(async (comProps?: boolean) => {
    const j = await api("/api/projetos/" + id);
    (window as any).remotion_staticBase = `/midia/${id}/prev`;
    setProj(j);
    if (comProps || !propsRef.current) setProps(j.props || { clipes: [] });
    return j;
  }, [id]);
  useEffect(() => { carregar(true).catch((e) => alert(e.message)); }, [carregar]);
  const ocupado = proj && ((proj.tarefa && !proj.tarefa.erro) || (proj.exportacoes || []).some((e: any) => ["fila", "renderizando", "finalizando"].includes(e.estado)));
  const processando = proj && proj.tarefa && !proj.tarefa.erro;
  useEffect(() => {
    if (!ocupado) return;
    const t = setInterval(async () => {
      const antes = processando;
      const j = await carregar().catch(() => null);
      if (j && antes && !(j.tarefa && !j.tarefa.erro)) { // terminou de processar: a linha do tempo nova vem do servidor
        aplicar(j.props || { clipes: [] }, propsRef.current, false);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [ocupado, processando]);

  // forma de onda de cada vídeo
  useEffect(() => {
    if (!proj) return;
    for (const m of proj.midias) {
      const b = m.nome.replace(/\.mp4$/, "");
      if (ondas[b] || !m.transcrito) continue;
      fetch(`/midia/${id}/ondas/${b}.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => ab && setOndas((o) => ({ ...o, [b]: new Uint8Array(ab) })));
    }
  }, [proj && proj.midias.length]);

  // ── edição: histórico (Ctrl+Z) + salvar sozinho
  const salvarDepois = (p: any) => {
    setSalvo("salvando"); clearTimeout(timer.current);
    timer.current = setTimeout(() => salvarAgora(p), 700);
  };
  const salvarAgora = async (p?: any) => {
    clearTimeout(timer.current);
    const alvo = p || propsRef.current; if (!alvo) return;
    try { await api(`/api/projetos/${id}/props`, { method: "PUT", body: alvo }); setSalvo("salvo"); } catch (e) { setSalvo("erro"); throw e; }
  };
  function aplicar(novo: any, antes: any, salvar = true) {
    if (antes) { hist.current.passado.push(antes); if (hist.current.passado.length > 200) hist.current.passado.shift(); hist.current.futuro = []; }
    setProps(novo); setVersaoHist((v) => v + 1);
    if (salvar) salvarDepois(novo);
  }
  const editar = (fn: (p: any) => any) => { const antes = propsRef.current; const novo = fn(copia(antes)); aplicar(novo, antes); };
  const aoVivo = (p: any) => setProps(p);
  const confirmar = (antes: any) => aplicar(propsRef.current, antes);
  const desfazer = () => { const h = hist.current; if (!h.passado.length) return; h.futuro.push(propsRef.current); const p = h.passado.pop(); setProps(p); setVersaoHist((v) => v + 1); salvarDepois(p); };
  const refazer = () => { const h = hist.current; if (!h.futuro.length) return; h.passado.push(propsRef.current); const p = h.futuro.pop(); setProps(p); setVersaoHist((v) => v + 1); salvarDepois(p); };
  const aplicarDaIA = (novo: any) => aplicar(novo, propsRef.current, false);

  // salva antes de sair
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (salvo !== "salvo") { salvarAgora().catch(() => {}); e.preventDefault(); } };
    addEventListener("beforeunload", h); return () => removeEventListener("beforeunload", h);
  }, [salvo]);

  useEffect(() => { if (sel !== null && props && sel >= props.clipes.length) setSel(null); }, [props, sel]);
  const l = useMemo(() => (props ? linha(props) : null), [props]);
  const meta = useMemo(() => (props ? metadados(props) : null), [props]);
  const ws = useMemo(() => (props && l ? palavrasDaEdicao(props, l) : []), [props, l]);
  const seek = (f: number) => playerRef.current?.seekTo(f);

  // ── ações
  const acDividir = () => { const p = copia(propsRef.current); const i = dividir(p, l, relogio.frame); if (i >= 0) { aplicar(p, propsRef.current); setSel(i); } };
  const acApagar = () => { if (sel === null) return; editar((p) => { p.clipes.splice(sel, 1); return p; }); setSel(null); };
  const tocarClipe = () => {
    if (sel === null || !l || !l.clipes[sel]) return;
    const c = l.clipes[sel]; pararEm.current = c.desde + c.frames - 1;
    playerRef.current?.seekTo(c.desde); playerRef.current?.play();
  };
  useEffect(() => {
    const h = (f: number) => { if (pararEm.current !== null && f >= pararEm.current) { pararEm.current = null; playerRef.current?.pause(); } };
    const t = (on: boolean) => { if (!on) pararEm.current = null; };
    relogio.subs.add(h); relogio.subsTocando.add(t);
    return () => { relogio.subs.delete(h); relogio.subsTocando.delete(t); };
  }, []);

  // ── atalhos
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      const p = playerRef.current, f = relogio.frame, fps = l ? l.fps : 30;
      if (e.key === " ") { e.preventDefault(); p?.toggle(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); refazer(); }
      else if (e.key === "s" || e.key === "S") { if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); acDividir(); } }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); acApagar(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); p?.seekTo(Math.max(0, f - (e.shiftKey ? fps : 1))); }
      else if (e.key === "ArrowRight") { e.preventDefault(); p?.seekTo(f + (e.shiftKey ? fps : 1)); }
      else if (e.key === "Home") p?.seekTo(0);
      else if (e.key === "End" && l) p?.seekTo(l.total - 1);
      else if (e.key === "Escape") setSel(null);
      else if (e.key === "+" || e.key === "=") setPx((x) => Math.min(600, x * 1.25));
      else if (e.key === "-") setPx((x) => Math.max(2, x / 1.25));
    };
    addEventListener("keydown", h); return () => removeEventListener("keydown", h);
  });

  // ajusta o zoom da linha do tempo pra caber o vídeo inteiro quando abre
  const ajustou = useRef(false);
  useEffect(() => {
    if (ajustou.current || !l || l.total <= 1) return; ajustou.current = true;
    setPx(Math.max(4, Math.min(120, (innerWidth - 140) / (l.total / l.fps))));
  }, [l]);

  if (!proj || !props || !l || !meta) return <div className="carregando">Carregando…</div>;
  const vazio = !props.clipes.length;
  const ctx = { fps: l.fps, l, sel, temClipes: !vazio };

  async function renomear() {
    const n = prompt("Nome do projeto", proj.nome); if (!n) return;
    await api("/api/projetos/" + id, { method: "PATCH", body: { nome: n } }); carregar();
  }
  const exportsAtivos = (proj.exportacoes || []).filter((e: any) => ["fila", "renderizando", "finalizando"].includes(e.estado));

  return (
    <div className="editor">
      <header className="topo">
        <div className="marca"><a href="/" className="voltar" title="Projetos">‹</a><span className="logo">Z</span><button className="nome" onClick={renomear} title="Renomear">{proj.nome}</button></div>
        <div className="topo-meio">
          <button className="btn" onClick={desfazer} disabled={!hist.current.passado.length} title="Desfazer (Ctrl+Z)">↶</button>
          <button className="btn" onClick={refazer} disabled={!hist.current.futuro.length} title="Refazer (Ctrl+Shift+Z)">↷</button>
          <span className={"salvo " + salvo}>{salvo === "salvo" ? "Salvo" : salvo === "salvando" ? "Salvando…" : "Não salvou, tentando de novo"}</span>
        </div>
        <div className="topo-dir">
          <span className="quem">{eu && eu.nome}</span>
          <button className="btn prim" onClick={() => setExportando(true)} disabled={vazio}>
            {exportsAtivos.length ? `Exportando ${exportsAtivos[0].pct || 0}%` : "Exportar"}
          </button>
        </div>
      </header>

      <div className="meio">
        <aside className="lado esq">
          <nav className="abas">
            <button className={abaEsq === "midia" ? "on" : ""} onClick={() => setAbaEsq("midia")}>Mídia</button>
            <button className={abaEsq === "texto" ? "on" : ""} onClick={() => setAbaEsq("texto")}>Texto</button>
          </nav>
          <div className="lado-corpo">
            {abaEsq === "midia" ? <PainelMidia proj={proj} recarregar={() => carregar()} editar={editar} disco={eu ? eu.discoLivre : null} />
              : <PainelTexto ws={ws} fps={l.fps} seek={seek} editar={editar} props={props} />}
          </div>
        </aside>

        <section className="centro">
          <Previa props={props} meta={meta} playerRef={playerRef} vazio={vazio} />
          <Transporte fps={l.fps} total={l.total} playerRef={playerRef} tocarClipe={tocarClipe} sel={sel} />
        </section>

        <aside className="lado dir">
          <nav className="abas">
            {[["ia", "✦ IA"], ["clipe", "Clipe"], ["estilo", "Estilo"], ["textos", "Textos"]].map(([k, t]) => (
              <button key={k} className={abaDir === k ? "on" : ""} onClick={() => setAbaDir(k)}>{t}</button>
            ))}
          </nav>
          <div className="lado-corpo">
            {abaDir === "ia" && <PainelIA id={id} ctx={ctx} aplicarDaIA={aplicarDaIA} salvarAgora={() => salvarAgora()} />}
            {abaDir === "clipe" && <InspetorClipe props={props} l={l} sel={sel} midias={proj.midias} editar={editar} acoes={{ dividir: acDividir, apagar: acApagar, tocarClipe, setSel }} />}
            {abaDir === "estilo" && <InspetorEstilo props={props} editar={editar} />}
            {abaDir === "textos" && <InspetorTextos props={props} editar={editar} fps={l.fps} />}
          </div>
        </aside>
      </div>

      <div className="baixo">
        <div className="tl-barra">
          <button className="btn" onClick={acDividir} title="Dividir no cursor (S)">✂ Dividir</button>
          <button className="btn" onClick={acApagar} disabled={sel === null} title="Apagar clipe (Del)">Apagar</button>
          <span className="tl-info">{props.clipes.length} clipes · {mmss(l.total / l.fps)}</span>
          <div className="tl-zoom">
            <button className="btn mini" onClick={() => setPx((x) => Math.max(2, x / 1.25))}>−</button>
            <input type="range" min={0} max={100} value={Math.round((Math.log(px / 2) / Math.log(300)) * 100)} onChange={(e) => setPx(2 * Math.pow(300, +e.target.value / 100))} />
            <button className="btn mini" onClick={() => setPx((x) => Math.min(600, x * 1.25))}>+</button>
            <button className="btn mini" onClick={() => setPx(Math.max(2, Math.min(600, (innerWidth - 140) / Math.max(1, l.total / l.fps))))}>Caber</button>
          </div>
        </div>
        <Timeline id={id} props={props} l={l} ws={ws} midias={proj.midias} ondas={ondas} normaliza={normaliza} sel={sel}
          setSel={(i) => { setSel(i); if (i !== null && abaDir !== "ia") setAbaDir("clipe"); }}
          px={px} setPx={setPx} seek={seek} aoVivo={aoVivo} confirmar={confirmar} editar={editar} abrirTexto={() => setAbaEsq("texto")} />
      </div>

      {exportando && <Exportar proj={proj} fps={l.fps} total={l.total / l.fps} fechar={() => setExportando(false)} recarregar={() => carregar()} salvarAgora={() => salvarAgora()} />}
    </div>
  );
}

function App() {
  const [eu, setEu] = useState<any>(null);
  useEffect(() => { api("/api/eu").then(setEu).catch(() => {}); }, []);
  const m = location.pathname.match(/^\/p\/([a-z0-9]{10})$/);
  return m ? <Editor id={m[1]} eu={eu} /> : <Home eu={eu} />;
}

createRoot(document.getElementById("raiz")!).render(<App />);
