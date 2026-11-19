// Painéis laterais: IA (chat), inspetor (clipe, estilo, textos), mídias (upload), texto (transcrição editável) e exportar.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, clamp, guardar, mmss, mmssd, PalavraEd, relogio, useFrame, cortarPalavras, clipeNoQuadro } from "./util";

// ─── campos ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const Linha = ({ rotulo, children }: any) => <label className="campo"><span>{rotulo}</span><div>{children}</div></label>;
export function Deslizador({ valor, min, max, passo, onChange, fmt }: any) {
  return (
    <div className="desl">
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(+e.target.value)} />
      <span>{fmt ? fmt(valor) : valor}</span>
    </div>
  );
}
const Cor = ({ valor, onChange }: any) => <input type="color" value={valor || "#ffffff"} onChange={(e) => onChange(e.target.value)} />;
const Liga = ({ valor, onChange }: any) => <button className={"liga" + (valor ? " on" : "")} onClick={() => onChange(!valor)}><i /></button>;

// ─── IA ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SUGESTOES = [
  "Tira as pausas e as frases repetidas",
  "Faz um Reels de até 30 s com os melhores trechos",
  "Corta esse clipe a partir do cursor",
  "Legenda amarela com a palavra falada em branco",
  "Põe um texto de impacto aqui",
  "Coloca um gancho forte no começo",
];

export function PainelIA({ id, ctx, aplicarDaIA, salvarAgora }: any) {
  const chave = "videoia-chat-" + id;
  const [msgs, setMsgs] = useState<any[]>(() => guardar.ler(chave, []));
  const [texto, setTexto] = useState("");
  const [trabalhando, setTrabalhando] = useState<number | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const f = useFrame();
  useEffect(() => { guardar.gravar(chave, msgs.slice(-60)); fim.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  // retoma um pedido que estava em andamento (recarregou a página)
  useEffect(() => { api(`/api/projetos/${id}/ia/estado`).then((j) => { if (j.estado === "trabalhando") acompanhar(); }).catch(() => {}); }, [id]);

  function acompanhar() {
    setTrabalhando(0);
    const t = setInterval(async () => {
      try {
        const j = await api(`/api/projetos/${id}/ia/estado`);
        if (j.estado === "trabalhando") { setTrabalhando(j.segundos); return; }
        clearInterval(t); setTrabalhando(null);
        if (j.estado === "pronto") {
          if (j.props) aplicarDaIA(j.props);
          setMsgs((m) => [...m, { quem: "ia", texto: j.resposta, versao: j.versao && j.versao.id, mudou: !!j.props }]);
        } else if (j.estado === "erro") setMsgs((m) => [...m, { quem: "ia", texto: "Não consegui: " + j.erro, erro: true }]);
      } catch (e: any) { clearInterval(t); setTrabalhando(null); setMsgs((m) => [...m, { quem: "ia", texto: "Erro: " + e.message, erro: true }]); }
    }, 1500);
  }

  async function enviar(p?: string) {
    const pedido = (p ?? texto).trim(); if (!pedido || trabalhando !== null) return;
    setTexto("");
    const hist = msgs.slice(-6).map((m) => ({ quem: m.quem, texto: m.texto }));
    setMsgs((m) => [...m, { quem: "eu", texto: pedido, cursor: relogio.frame / ctx.fps }]);
    try {
      await salvarAgora();
      await api(`/api/projetos/${id}/ia`, { method: "POST", body: { pedido, cursor: relogio.frame / ctx.fps, selecionado: ctx.sel, historico: hist } });
      acompanhar();
    } catch (e: any) { setMsgs((m) => [...m, { quem: "ia", texto: "Erro: " + e.message, erro: true }]); }
  }

  async function desfazer(versao: string, k: number) {
    try {
      const j = await api(`/api/projetos/${id}/versoes/${versao}/restaurar`, { method: "POST" });
      aplicarDaIA(j.props);
      setMsgs((m) => m.map((x, i) => (i === k ? { ...x, desfeito: true } : x)));
    } catch (e: any) { alert(e.message); }
  }

  const clipeCursor = clipeNoQuadro(ctx.l, f);
  return (
    <div className="ia">
      <div className="ia-msgs">
        {!msgs.length && (
          <div className="ia-vazio">
            <b>Peça a edição em português.</b>
            <p>A IA vê a transcrição, os clipes e onde está o cursor. "Aqui" é o ponto do cursor. Toda mudança dela pode ser desfeita.</p>
            <div className="ia-sugs">{SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} disabled={!ctx.temClipes}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, k) => (
          <div key={k} className={"ia-msg " + m.quem + (m.erro ? " erro" : "")}>
            {m.quem === "eu" && m.cursor !== undefined && <small>no cursor {mmssd(m.cursor)}</small>}
            <div>{m.texto}</div>
            {m.versao && m.mudou && (m.desfeito ? <small>desfeito</small> : <button className="ia-desfazer" onClick={() => desfazer(m.versao, k)}>↶ Desfazer esta mudança</button>)}
          </div>
        ))}
        {trabalhando !== null && <div className="ia-msg ia pensando"><span className="girando" /> Editando… {trabalhando ? trabalhando + " s" : ""}</div>}
        <div ref={fim} />
      </div>
      <div className="ia-contexto">
        Cursor <b>{mmssd(f / ctx.fps)}</b>{clipeCursor >= 0 ? <> · clipe <b>#{clipeCursor + 1}</b></> : null}{ctx.sel !== null ? <> · selecionado <b>#{ctx.sel + 1}</b></> : null}
      </div>
      <div className="ia-entrada">
        <textarea value={texto} placeholder={ctx.temClipes ? "Ex: corta do cursor até o fim da frase · legenda maior · Reels de 30 s" : "Suba um vídeo primeiro (aba Mídia)"}
          onChange={(e) => setTexto(e.target.value)} disabled={!ctx.temClipes}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} rows={3} />
        <button className="btn prim" onClick={() => enviar()} disabled={!texto.trim() || trabalhando !== null}>Enviar</button>
      </div>
    </div>
  );
}

// ─── Inspetor: clipe ────────────────────────────────────────────────────────────────────────────────────────────────
export function InspetorClipe({ props, l, sel, midias, editar, acoes }: any) {
  if (sel === null || !props.clipes[sel]) return <div className="vazio">Clique num clipe da linha do tempo pra ver e ajustar.</div>;
  const c = props.clipes[sel], lc = l.clipes[sel];
  const m = midias.find((x: any) => x.nome === c.video) || {};
  const muda = (o: any) => editar((p: any) => { p.clipes[sel] = { ...p.clipes[sel], ...o }; return p; });
  const foco = c.foco || props.foco || [0.5, 0.35];
  return (
    <div className="insp">
      <h4>Clipe #{sel + 1} <small>{c.video} · {m.original || ""}</small></h4>
      <div className="insp-acoes">
        <button className="btn" onClick={acoes.tocarClipe}>▶ Tocar só este clipe</button>
      </div>
      <Linha rotulo="Começa na fonte (s)"><input type="number" step="0.05" value={c.de} onChange={(e) => muda({ de: +clamp(+e.target.value, 0, c.ate - 0.1).toFixed(3) })} /></Linha>
      <Linha rotulo="Termina na fonte (s)"><input type="number" step="0.05" value={c.ate} onChange={(e) => muda({ ate: +clamp(+e.target.value, c.de + 0.1, m.duracao || 1e9).toFixed(3) })} /></Linha>
      <Linha rotulo="No vídeo final">{mmssd(lc.desde / l.fps)} até {mmssd((lc.desde + lc.frames) / l.fps)} · {(lc.frames / l.fps).toFixed(2)} s</Linha>
      <Linha rotulo="Volume da voz"><Deslizador valor={c.volume ?? 1} min={0} max={2} passo={0.05} onChange={(v: number) => muda({ volume: v })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>
      <Linha rotulo="Movimento">
        <select value={String(c.zoom ?? "auto")} onChange={(e) => muda({ zoom: e.target.value })}>
          <option value="auto">Automático (padrão do vídeo)</option><option value="nenhum">Parado</option><option value="entrar">Aproximar</option>
          <option value="sair">Afastar</option><option value="soco">Soco (corte com zoom)</option>
        </select>
      </Linha>
      <Linha rotulo="Foco horizontal"><Deslizador valor={foco[0]} min={0} max={1} passo={0.01} onChange={(v: number) => muda({ foco: [v, foco[1]] })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>
      <Linha rotulo="Foco vertical"><Deslizador valor={foco[1]} min={0} max={1} passo={0.01} onChange={(v: number) => muda({ foco: [foco[0], v] })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>
      <div className="insp-acoes">
        <button className="btn" onClick={acoes.dividir}>✂ Dividir no cursor <kbd>S</kbd></button>
        <button className="btn" onClick={() => editar((p: any) => { p.clipes.splice(sel + 1, 0, { ...p.clipes[sel] }); return p; })}>Duplicar</button>
        <button className="btn" disabled={sel === 0} onClick={() => { editar((p: any) => { const [x] = p.clipes.splice(sel, 1); p.clipes.splice(sel - 1, 0, x); return p; }); acoes.setSel(sel - 1); }}>← Mover</button>
        <button className="btn" disabled={sel === props.clipes.length - 1} onClick={() => { editar((p: any) => { const [x] = p.clipes.splice(sel, 1); p.clipes.splice(sel + 1, 0, x); return p; }); acoes.setSel(sel + 1); }}>Mover →</button>
        <button className="btn perigo" onClick={acoes.apagar}>Apagar <kbd>Del</kbd></button>
      </div>
    </div>
  );
}

// ─── Inspetor: estilo ───────────────────────────────────────────────────────────────────────────────────────────────
export function InspetorEstilo({ props, editar }: any) {
  const L = props.legenda || {}, D = props.destaque || {}, Z = props.zoom || {};
  const leg = (o: any) => editar((p: any) => { p.legenda = { ...(p.legenda || {}), ...o }; return p; });
  const dst = (o: any) => editar((p: any) => { p.destaque = { ...(p.destaque || {}), ...o }; return p; });
  const raiz = (o: any) => editar((p: any) => Object.assign(p, o));
  const [palavrasDest, setPalavrasDest] = useState((D.palavras || []).join(", "));
  useEffect(() => setPalavrasDest((D.palavras || []).join(", ")), [JSON.stringify(D.palavras || [])]);
  return (
    <div className="insp">
      <h4>Vídeo</h4>
      <Linha rotulo="Formato">
        <select value={props.formato || "9:16"} onChange={(e) => raiz({ formato: e.target.value })}>
          <option value="9:16">9:16 Reels / Stories / TikTok</option><option value="4:5">4:5 Feed</option><option value="1:1">1:1 Quadrado</option><option value="16:9">16:9 YouTube</option>
        </select>
      </Linha>
      <Linha rotulo="Enquadramento">
        <select value={props.enquadramento || "preencher"} onChange={(e) => raiz({ enquadramento: e.target.value })}>
          <option value="preencher">Preencher (corta as bordas)</option><option value="conter">Conter (fundo desfocado)</option>
        </select>
      </Linha>
      <Linha rotulo="Movimento de câmera">
        <select value={Z.modo || "alternado"} onChange={(e) => raiz({ zoom: { ...Z, modo: e.target.value } })}>
          <option value="alternado">Alternado (soco a cada corte)</option><option value="suave">Suave</option><option value="nenhum">Nenhum</option>
        </select>
      </Linha>
      <Linha rotulo="Intensidade do zoom"><Deslizador valor={Z.intensidade ?? 1.12} min={1} max={1.4} passo={0.01} onChange={(v: number) => raiz({ zoom: { ...Z, intensidade: v } })} fmt={(v: number) => v.toFixed(2) + "x"} /></Linha>
      <Linha rotulo="Transição"><select value={props.transicao || "corte"} onChange={(e) => raiz({ transicao: e.target.value })}><option value="corte">Corte seco</option><option value="flash">Flash branco</option></select></Linha>
      <Linha rotulo="Barra de progresso"><Liga valor={!!props.barraProgresso} onChange={(v: boolean) => raiz({ barraProgresso: v })} /></Linha>
      <Linha rotulo="Volume geral da voz"><Deslizador valor={props.volumeVoz ?? 1} min={0} max={2} passo={0.05} onChange={(v: number) => raiz({ volumeVoz: v })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>

      <h4>Legenda <Liga valor={L.ativa !== false} onChange={(v: boolean) => leg({ ativa: v })} /></h4>
      <Linha rotulo="Fonte"><select value={L.fonte || "Anton"} onChange={(e) => leg({ fonte: e.target.value })}><option>Anton</option><option>Montserrat</option></select></Linha>
      <Linha rotulo="Tamanho"><Deslizador valor={L.tamanho ?? 92} min={40} max={160} passo={1} onChange={(v: number) => leg({ tamanho: v })} /></Linha>
      <Linha rotulo="Altura na tela"><Deslizador valor={L.posicao ?? 0.68} min={0.08} max={0.95} passo={0.01} onChange={(v: number) => leg({ posicao: v })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>
      <Linha rotulo="Palavras por tela"><Deslizador valor={L.maxPalavras ?? 3} min={1} max={6} passo={1} onChange={(v: number) => leg({ maxPalavras: v })} /></Linha>
      <Linha rotulo="Cor"><Cor valor={L.cor || "#FFFFFF"} onChange={(v: string) => leg({ cor: v })} /></Linha>
      <Linha rotulo="Cor da palavra falada">
        <Liga valor={!!L.corAtiva} onChange={(v: boolean) => leg({ corAtiva: v ? "#FFE600" : null })} />{L.corAtiva && <Cor valor={L.corAtiva} onChange={(v: string) => leg({ corAtiva: v })} />}
      </Linha>
      <Linha rotulo="Caixa alta"><Liga valor={L.caixaAlta !== false} onChange={(v: boolean) => leg({ caixaAlta: v })} /></Linha>
      <Linha rotulo="Contorno"><Deslizador valor={L.contorno ?? 10} min={0} max={24} passo={1} onChange={(v: number) => leg({ contorno: v })} /></Linha>
      <Linha rotulo="Fundo atrás do texto">
        <Liga valor={!!L.fundo} onChange={(v: boolean) => leg({ fundo: v ? "#000000" : null })} />{L.fundo && <Cor valor={L.fundo} onChange={(v: string) => leg({ fundo: v })} />}
      </Linha>

      <h4>Destaque</h4>
      <Linha rotulo="Cor do destaque"><Cor valor={D.cor || "#FF0000"} onChange={(v: string) => dst({ cor: v })} /></Linha>
      <Linha rotulo="Palavras destacadas">
        <input type="text" value={palavrasDest} placeholder="ex: dinheiro, big mac" onChange={(e) => setPalavrasDest(e.target.value)}
          onBlur={() => dst({ palavras: palavrasDest.split(",").map((s: string) => s.trim()).filter(Boolean) })} />
      </Linha>
    </div>
  );
}

// ─── Inspetor: textos (gancho, impactos, zooms, CTA) ────────────────────────────────────────────────────────────────
export function InspetorTextos({ props, editar, fps }: any) {
  const agora = () => +(relogio.frame / fps).toFixed(2);
  const lista = (k: string, i: number, o: any) => editar((p: any) => { p[k] = p[k].slice(); p[k][i] = { ...p[k][i], ...o }; if (o.em !== undefined) delete p[k][i].palavra; return p; });
  const tira = (k: string, i: number) => editar((p: any) => { p[k] = p[k].filter((_: any, j: number) => j !== i); return p; });
  return (
    <div className="insp">
      <h4>Gancho (abertura) <Liga valor={!!props.gancho} onChange={(v: boolean) => editar((p: any) => { p.gancho = v ? { texto: "VOCÊ PRECISA VER ISSO", duracao: 1.5, modo: "sobre", posicao: 0.2 } : null; return p; })} /></h4>
      {props.gancho && <>
        <Linha rotulo="Texto"><input type="text" value={props.gancho.texto} onChange={(e) => editar((p: any) => { p.gancho = { ...p.gancho, texto: e.target.value }; return p; })} /></Linha>
        <Linha rotulo="Duração"><Deslizador valor={props.gancho.duracao ?? 1.5} min={0.5} max={5} passo={0.1} onChange={(v: number) => editar((p: any) => { p.gancho = { ...p.gancho, duracao: v }; return p; })} fmt={(v: number) => v.toFixed(1) + " s"} /></Linha>
        <Linha rotulo="Como aparece"><select value={props.gancho.modo || "sobre"} onChange={(e) => editar((p: any) => { p.gancho = { ...p.gancho, modo: e.target.value }; return p; })}><option value="sobre">Sobre o vídeo</option><option value="tela">Tela preta antes</option></select></Linha>
        <Linha rotulo="Altura"><Deslizador valor={props.gancho.posicao ?? 0.2} min={0.05} max={0.95} passo={0.01} onChange={(v: number) => editar((p: any) => { p.gancho = { ...p.gancho, posicao: v }; return p; })} fmt={(v: number) => Math.round(v * 100) + "%"} /></Linha>
      </>}

      <h4>Textos de impacto <button className="btn mini" onClick={() => editar((p: any) => { p.impactos = [...(p.impactos || []), { texto: "TEXTO", em: agora(), duracao: 1, posicao: 0.4 }]; return p; })}>+ no cursor</button></h4>
      {(props.impactos || []).map((im: any, i: number) => (
        <div className="item" key={i}>
          <input type="text" value={im.texto} onChange={(e) => lista("impactos", i, { texto: e.target.value })} />
          <div className="item-linha">
            <span>{im.palavra ? `na palavra "${im.palavra}"` : `em ${mmssd(im.em || 0)}`}</span>
            <button className="btn mini" onClick={() => lista("impactos", i, { em: agora() })}>mover pro cursor</button>
            <button className="btn mini perigo" onClick={() => tira("impactos", i)}>×</button>
          </div>
          <Deslizador valor={im.duracao ?? 1} min={0.3} max={5} passo={0.1} onChange={(v: number) => lista("impactos", i, { duracao: v })} fmt={(v: number) => v.toFixed(1) + " s"} />
        </div>
      ))}

      <h4>Zoom pontual <button className="btn mini" onClick={() => editar((p: any) => { p.zooms = [...(p.zooms || []), { em: agora(), duracao: 1.2, escala: 1.25 }]; return p; })}>+ no cursor</button></h4>
      {(props.zooms || []).map((z: any, i: number) => (
        <div className="item" key={i}>
          <div className="item-linha">
            <span>{z.palavra ? `na palavra "${z.palavra}"` : `em ${mmssd(z.em || 0)}`}</span>
            <button className="btn mini" onClick={() => lista("zooms", i, { em: agora() })}>mover pro cursor</button>
            <button className="btn mini perigo" onClick={() => tira("zooms", i)}>×</button>
          </div>
          <Deslizador valor={z.escala ?? 1.25} min={1.05} max={2} passo={0.05} onChange={(v: number) => lista("zooms", i, { escala: v })} fmt={(v: number) => v.toFixed(2) + "x"} />
        </div>
      ))}

      <h4>Chamada no fim (CTA) <Liga valor={!!props.cta} onChange={(v: boolean) => editar((p: any) => { p.cta = v ? { texto: "COMENTA \"EU QUERO\"", duracao: 2.5, posicao: 0.42 } : null; return p; })} /></h4>
      {props.cta && <>
        <Linha rotulo="Texto"><input type="text" value={props.cta.texto} onChange={(e) => editar((p: any) => { p.cta = { ...p.cta, texto: e.target.value }; return p; })} /></Linha>
        <Linha rotulo="Duração"><Deslizador valor={props.cta.duracao ?? 2.5} min={1} max={8} passo={0.5} onChange={(v: number) => editar((p: any) => { p.cta = { ...p.cta, duracao: v }; return p; })} fmt={(v: number) => v.toFixed(1) + " s"} /></Linha>
      </>}
    </div>
  );
}

// ─── Mídia ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function PainelMidia({ proj, recarregar, editar, disco }: any) {
  const [envio, setEnvio] = useState<number | null>(null);
  const [cortar, setCortar] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const t = proj.tarefa;
  const ocupado = envio !== null || (t && !t.erro);

  function subir(files: FileList | null) {
    if (!files || !files.length || ocupado) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("arquivos", f);
    fd.append("cortar", cortar ? "1" : "0");
    const x = new XMLHttpRequest();
    x.open("POST", `/api/projetos/${proj.id}/midias`);
    x.upload.onprogress = (e) => e.lengthComputable && setEnvio(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { setEnvio(null); let j: any = {}; try { j = JSON.parse(x.responseText); } catch (_) {} if (x.status >= 300) alert(j.erro || "Falhou o envio (" + x.status + ")"); recarregar(); };
    x.onerror = () => { setEnvio(null); alert("O envio caiu. Tente de novo."); };
    setEnvio(0); x.send(fd);
  }

  return (
    <div className="midia">
      <div className={"soltar" + (arrastando ? " sobre" : "") + (ocupado ? " ocupado" : "")} onClick={() => !ocupado && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); subir(e.dataTransfer.files); }}>
        <input ref={input} type="file" accept="video/*,audio/*" multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        {envio !== null ? <><b>Enviando {envio}%</b><div className="barra"><i style={{ width: envio + "%" }} /></div><small>Não feche a página</small></>
          : t && !t.erro ? <><b>{t.texto}</b><div className="barra"><i style={{ width: (t.pct || 2) + "%" }} /></div><small>Pode continuar editando o resto</small></>
          : <><b>Arraste o vídeo aqui</b><small>ou clique pra escolher · até 2 GB por arquivo</small></>}
      </div>
      {t && t.erro && <div className="aviso erro">Falhou: {t.erro}</div>}
      <label className="opcao"><input type="checkbox" checked={cortar} onChange={(e) => setCortar(e.target.checked)} /> Tirar pausas e respirações ao subir</label>
      {disco !== null && disco < 5 * 1024 ** 3 && <div className="aviso">Pouco espaço no servidor: {(disco / 1024 ** 3).toFixed(1)} GB livres.</div>}
      <div className="midia-lista">
        {proj.midias.map((m: any) => (
          <div className="midia-item" key={m.nome}>
            <img src={`/midia/${proj.id}/quadros/${m.nome.replace(/\.mp4$/, "")}/00001.jpg`} alt="" />
            <div>
              <b title={m.original}>{m.original}</b>
              <small>{mmss(m.duracao)} · {m.largura}x{m.altura} · {m.nome}{m.transcrito ? "" : " · sem fala"}</small>
              <button className="btn mini" onClick={() => editar((p: any) => { p.clipes = [...p.clipes, { video: m.nome, de: 0, ate: m.duracao }]; return p; })}>+ Inteiro no fim</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Texto: transcrição da edição; clica pra ir, seleciona e apaga pra cortar ─────────────────────────────────────────
export function PainelTexto({ ws, fps, seek, editar, props }: any) {
  const [esc, setEsc] = useState<Set<number>>(new Set());
  const [ancoraSel, setAncora] = useState<number | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const f = useFrame();
  useEffect(() => setEsc(new Set()), [props.clipes]);
  // palavra falada agora: marca sem re-renderizar a lista
  const atual = useMemo(() => { let lo = 0, hi = ws.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ws[m].de <= f) { r = m; lo = m + 1; } else hi = m - 1; } return r; }, [f, ws]);
  const ant = useRef(-1);
  useEffect(() => {
    spans.current[ant.current]?.classList.remove("agora");
    const s = spans.current[atual]; s?.classList.add("agora"); ant.current = atual;
    if (s && caixa.current) { const r = s.offsetTop - caixa.current.scrollTop; if (r < 20 || r > caixa.current.clientHeight - 40) caixa.current.scrollTop = s.offsetTop - 80; }
  }, [atual]);

  const clicar = (k: number, e: React.MouseEvent) => {
    if (e.shiftKey && ancoraSel !== null) { const s = new Set<number>(); for (let i = Math.min(ancoraSel, k); i <= Math.max(ancoraSel, k); i++) s.add(i); setEsc(s); return; }
    if (e.ctrlKey || e.metaKey) { const s = new Set(esc); s.has(k) ? s.delete(k) : s.add(k); setEsc(s); setAncora(k); return; }
    setAncora(k); setEsc(new Set([k])); seek(ws[k].de);
  };
  const cortar = () => { if (!esc.size) return; editar((p: any) => { cortarPalavras(p, ws, esc); return p; }); setEsc(new Set()); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === "Delete" || e.key === "Backspace") && esc.size && !(e.target as HTMLElement).closest("input,textarea")) { e.preventDefault(); e.stopPropagation(); cortar(); } };
    addEventListener("keydown", h, true); return () => removeEventListener("keydown", h, true);
  });

  if (!ws.length) return <div className="vazio">Sem fala transcrita na edição ainda.</div>;
  let clipeAnt = -1;
  return (
    <div className="texto">
      <div className="texto-barra">
        {esc.size ? <><span>{esc.size} palavra(s)</span><button className="btn perigo mini" onClick={cortar}>✂ Cortar do vídeo <kbd>Del</kbd></button><button className="btn mini" onClick={() => setEsc(new Set())}>Limpar</button></>
          : <small>Clique numa palavra pra ir até ela. Shift+clique seleciona um trecho; Del corta do vídeo.</small>}
      </div>
      <div className="texto-corpo" ref={caixa}>
        {ws.map((w: PalavraEd, k: number) => {
          const novo = w.clipe !== clipeAnt; clipeAnt = w.clipe;
          return (
            <React.Fragment key={k}>
              {novo && <span className="texto-clipe">#{w.clipe + 1}</span>}
              <span ref={(el) => { spans.current[k] = el; }} className={"pal" + (esc.has(k) ? " esc" : "")} onMouseDown={(e) => { e.preventDefault(); clicar(k, e); }}>{w.texto} </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Exportar ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function Exportar({ proj, fps, total, fechar, recarregar, salvarAgora }: any) {
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState("completo");
  const [erro, setErro] = useState("");
  const ini = relogio.frame / fps;
  async function ir() {
    setErro("");
    try {
      await salvarAgora();
      const body: any = { nome: nome || undefined, rascunho: modo === "rascunho" };
      if (modo === "amostra") body.trecho = [ini, Math.min(total, ini + 8)];
      await api(`/api/projetos/${proj.id}/exportar`, { method: "POST", body });
      recarregar();
    } catch (e: any) { setErro(e.message); }
  }
  const estimativa = modo === "amostra" ? Math.min(8, total - ini) * 10 : total * (modo === "rascunho" ? 4 : 10);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal">
        <div className="modal-cab"><b>Exportar</b><button className="btn mini" onClick={fechar}>×</button></div>
        <div className="exp-opcoes">
          {[["completo", "Vídeo completo", "1080p, voz em -14 LUFS"], ["amostra", "Amostra de 8 s", "a partir do cursor (" + mmssd(ini) + ")"], ["rascunho", "Rascunho rápido", "metade da resolução"]].map(([v, t, d]) => (
            <label key={v} className={"exp-op" + (modo === v ? " on" : "")}><input type="radio" checked={modo === v} onChange={() => setModo(v)} /><b>{t}</b><small>{d}</small></label>
          ))}
        </div>
        <Linha rotulo="Nome do arquivo"><input type="text" value={nome} placeholder="opcional" onChange={(e) => setNome(e.target.value)} /></Linha>
        <p className="dica">Tempo estimado: uns {Math.max(1, Math.round(estimativa / 60))} min (o servidor é compartilhado).</p>
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="btn prim largo" onClick={ir}>Exportar</button>
        <div className="exp-lista">
          {(proj.exportacoes || []).map((e: any) => (
            <div className="exp-item" key={e.id}>
              <div className="exp-linha">
                <b>{e.nome}</b><small>{new Date(e.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}{e.trecho ? " · amostra" : ""}{e.rascunho ? " · rascunho" : ""}</small>
              </div>
              {e.estado === "pronto" ? (
                <>
                  <video src={`/midia/${proj.id}/saidas/${e.id}.mp4`} controls preload="metadata" />
                  <a className="btn mini" href={`/midia/${proj.id}/saidas/${e.id}.mp4?baixar=1`}>⬇ Baixar ({((e.tamanho || 0) / 1024 ** 2).toFixed(1)} MB)</a>
                </>
              ) : e.estado === "erro" ? <div className="aviso erro">{e.erro}</div>
                : <><div className="barra"><i style={{ width: (e.pct || 1) + "%" }} /></div><small>{e.estado === "fila" ? "Na fila" : e.estado === "finalizando" ? "Ajustando o volume" : `Renderizando ${e.pct || 0}%`}</small></>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
