// Linha do tempo no estilo DaVinci: régua, V1 (clipes com miniaturas), LEG (palavras), TXT (gancho, impactos, zooms, CTA),
// A1 (voz com forma de onda) e A2 (trilha). Aparar arrastando a ponta do clipe, reordenar arrastando o corpo,
// clicar posiciona o cursor. Tempos dos clipes em segundos da FONTE; posição na tela pelo tempo FINAL.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clamp, relogio, useFrame, useTocando, mmss, PalavraEd, ancora } from "./util";

const ALT = { regua: 26, v1: 66, leg: 28, txt: 28, a1: 58, a2: 30 };
const CAB = 92; // coluna dos nomes das faixas

export type TLProps = {
  id: string; props: any; l: any; ws: PalavraEd[]; midias: any[]; ondas: Record<string, Uint8Array>; normaliza: (t: string) => string;
  sel: number | null; setSel: (i: number | null) => void; px: number; setPx: (n: number) => void;
  seek: (f: number) => void; aoVivo: (p: any) => void; confirmar: (antes: any) => void; editar: (fn: (p: any) => any) => void;
  abrirTexto: () => void;
};

function Onda({ dados, de, ate, largura, altura, volume }: { dados?: Uint8Array; de: number; ate: number; largura: number; altura: number; volume: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, Math.min(8000, Math.round(largura)));
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!; ctx.clearRect(0, 0, w, altura);
    if (!dados) return;
    const i0 = Math.floor(de * 100), i1 = Math.ceil(ate * 100), n = Math.max(1, i1 - i0);
    ctx.fillStyle = "rgba(220,255,230,.85)";
    const meio = altura / 2, g = Math.min(1.6, volume);
    for (let x = 0; x < w; x++) {
      const a = i0 + Math.floor((x / w) * n), b = Math.max(a + 1, i0 + Math.floor(((x + 1) / w) * n));
      let m = 0; for (let k = a; k < b && k < dados.length; k++) if (dados[k] > m) m = dados[k];
      const h = Math.max(1, (m / 255) * (altura - 6) * g);
      ctx.fillRect(x, meio - h / 2, 1, h);
    }
  }, [dados, de, ate, w, altura, volume]);
  return <canvas ref={ref} width={w} height={altura} style={{ width: largura, height: altura, display: "block" }} />;
}

function Cursor({ fps, px, altura, scroller }: { fps: number; px: number; altura: number; scroller: React.RefObject<HTMLDivElement | null> }) {
  const f = useFrame(), tocando = useTocando();
  const x = (f / fps) * px;
  useEffect(() => {
    const s = scroller.current; if (!s || !tocando) return;
    if (x > s.scrollLeft + s.clientWidth - 60 || x < s.scrollLeft) s.scrollLeft = Math.max(0, x - 80);
  }, [x, tocando]);
  return (
    <div className="tl-cursor" style={{ left: x, height: altura }}>
      <div className="tl-cursor-cabeca" />
    </div>
  );
}

function intervaloRegua(px: number) {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s * px >= 80) return s;
  return 1200;
}

export function Timeline(T: TLProps) {
  const { props, l, px, sel } = T;
  const fps = l.fps;
  const scroller = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState({ sl: 0, w: 1200 });
  const [alvo, setAlvo] = useState<number | null>(null); // marcador de onde o clipe arrastado vai entrar
  const total = l.total / fps;
  const largura = Math.max(total * px + 300, vis.w);
  const durDe = useMemo(() => Object.fromEntries(T.midias.map((m: any) => [m.nome, m.duracao])), [T.midias]);
  const proporcao = useMemo(() => Object.fromEntries(T.midias.map((m: any) => [m.nome, m.largura && m.altura ? m.largura / m.altura : 16 / 9])), [T.midias]);

  useLayoutEffect(() => {
    const s = scroller.current; if (!s) return;
    const up = () => setVis({ sl: s.scrollLeft, w: s.clientWidth });
    up(); const ro = new ResizeObserver(up); ro.observe(s);
    let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(up); };
    s.addEventListener("scroll", onScroll);
    return () => { ro.disconnect(); s.removeEventListener("scroll", onScroll); };
  }, []);

  const xDe = (clientX: number) => { const s = scroller.current!; return clientX - s.getBoundingClientRect().left + s.scrollLeft; };
  const quadroDe = (clientX: number) => clamp(Math.round((xDe(clientX) / px) * fps), 0, Math.max(0, l.total - 1));

  // régua: clica e arrasta pra posicionar o cursor
  const reguaDown = (e: React.MouseEvent) => {
    e.preventDefault(); T.seek(quadroDe(e.clientX));
    const mv = (ev: MouseEvent) => T.seek(quadroDe(ev.clientX));
    const up = () => { removeEventListener("mousemove", mv); removeEventListener("mouseup", up); };
    addEventListener("mousemove", mv); addEventListener("mouseup", up);
  };

  // clipe: corpo = selecionar/reordenar, ponta = aparar (ripple: os seguintes andam junto)
  const clipeDown = (e: React.MouseEvent, i: number, modo: "corpo" | "esq" | "dir") => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const antes = props, c0 = props.clipes[i], lc = l.clipes[i], x0 = e.clientX;
    let moveu = false, destino: number | null = null;
    T.setSel(i);
    const mv = (ev: MouseEvent) => {
      const dx = ev.clientX - x0;
      if (!moveu && Math.abs(dx) < 4) return;
      moveu = true;
      if (modo === "corpo") {
        const t = xDe(ev.clientX) / px * fps;
        let j = l.clipes.findIndex((c: any) => t < c.desde + c.frames / 2); if (j < 0) j = l.clipes.length;
        destino = j; setAlvo(j === i || j === i + 1 ? null : j);
        return;
      }
      const novo = { ...antes, clipes: antes.clipes.slice() };
      if (modo === "esq") {
        const de = +clamp(c0.de + dx / px, 0, c0.ate - 0.1).toFixed(3);
        novo.clipes[i] = { ...c0, de }; T.aoVivo(novo); T.seek(lc.desde);
      } else {
        const ate = +clamp(c0.ate + dx / px, c0.de + 0.1, durDe[c0.video] ?? c0.ate).toFixed(3);
        novo.clipes[i] = { ...c0, ate }; T.aoVivo(novo); T.seek(lc.desde + Math.max(0, Math.round((ate - c0.de) * fps) - 1));
      }
    };
    const up = (ev: MouseEvent) => {
      removeEventListener("mousemove", mv); removeEventListener("mouseup", up); setAlvo(null);
      if (!moveu) { T.seek(quadroDe(ev.clientX)); return; }
      if (modo === "corpo") {
        if (destino !== null && destino !== i && destino !== i + 1) {
          const d = destino;
          T.editar((p) => { const [c] = p.clipes.splice(i, 1); p.clipes.splice(d > i ? d - 1 : d, 0, c); return p; });
          T.setSel(d > i ? d - 1 : d);
        }
      } else T.confirmar(antes);
    };
    addEventListener("mousemove", mv); addEventListener("mouseup", up);
  };

  // zoom com Ctrl + roda, mantendo o ponto sob o mouse
  const roda = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const s = scroller.current!, t = xDe(e.clientX) / px;
    const n = clamp(px * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 2, 600);
    T.setPx(n);
    requestAnimationFrame(() => { s.scrollLeft = t * n - (e.clientX - s.getBoundingClientRect().left); });
  };

  const ini = vis.sl / px - 2, fim = (vis.sl + vis.w) / px + 2;
  const passo = intervaloRegua(px);
  const marcas: number[] = [];
  for (let s = Math.max(0, Math.floor(ini / passo) * passo); s <= Math.min(fim, total + 10); s += passo) marcas.push(s);

  const ganchoTela = props.gancho && props.gancho.modo === "tela";
  const textos: { tipo: string; de: number; dur: number; rotulo: string }[] = [];
  if (props.gancho) textos.push({ tipo: "gancho", de: 0, dur: props.gancho.duracao ?? 1.5, rotulo: "Gancho: " + props.gancho.texto });
  (props.impactos || []).forEach((im: any) => { const q = ancora(im, T.ws, fps, T.normaliza); if (q !== null) textos.push({ tipo: "impacto", de: q / fps, dur: im.duracao ?? 1, rotulo: im.texto }); });
  (props.zooms || []).forEach((z: any) => { const q = ancora(z, T.ws, fps, T.normaliza); if (q !== null) textos.push({ tipo: "zoom", de: q / fps, dur: z.duracao ?? 1.2, rotulo: "Zoom " + (z.escala ?? 1.25) + "x" }); });
  if (props.cta) textos.push({ tipo: "cta", de: Math.max(0, total - (props.cta.duracao ?? 2.5)), dur: props.cta.duracao ?? 2.5, rotulo: "CTA: " + props.cta.texto });

  const alturaTotal = ALT.regua + ALT.v1 + ALT.leg + ALT.txt + ALT.a1 + ALT.a2;
  const pos = (s: number) => s * px;

  return (
    <div className="tl" onWheel={roda}>
      <div className="tl-cab" style={{ width: CAB }}>
        <div style={{ height: ALT.regua }} />
        <div className="tl-nome" style={{ height: ALT.v1 }}><b>V1</b>Vídeo</div>
        <div className="tl-nome" style={{ height: ALT.leg }}><b>LEG</b>Legenda</div>
        <div className="tl-nome" style={{ height: ALT.txt }}><b>TXT</b>Textos</div>
        <div className="tl-nome" style={{ height: ALT.a1 }}><b>A1</b>Voz</div>
        <div className="tl-nome" style={{ height: ALT.a2 }}><b>A2</b>Trilha</div>
      </div>
      <div className="tl-rolagem" ref={scroller}>
        <div className="tl-area" style={{ width: largura, height: alturaTotal }}>
          <div className="tl-regua" style={{ height: ALT.regua }} onMouseDown={reguaDown}>
            {marcas.map((s) => (
              <div key={s} className="tl-marca" style={{ left: pos(s) }}><span>{passo < 1 ? s.toFixed(1) : mmss(s)}</span></div>
            ))}
          </div>

          {/* V1 */}
          <div className="tl-faixa" style={{ height: ALT.v1 }} onMouseDown={(e) => { if (e.target === e.currentTarget) { T.setSel(null); T.seek(quadroDe(e.clientX)); } }}>
            {ganchoTela && <div className="tl-bloco tl-gancho" style={{ left: 0, width: pos(props.gancho.duracao ?? 1.5) }}>Gancho</div>}
            {l.clipes.map((c: any) => {
              const x = pos(c.desde / fps), w = Math.max(3, pos(c.frames / fps));
              if (x > vis.sl + vis.w + 50 || x + w < vis.sl - 50) return <div key={c.i} className={"tl-clipe" + (sel === c.i ? " sel" : "")} style={{ left: x, width: w }} />;
              const base = String(c.video).replace(/\.mp4$/, "");
              const tw = Math.round((ALT.v1 - 18) * (proporcao[c.video] || 1.77));
              const n = Math.min(80, Math.ceil(w / tw));
              return (
                <div key={c.i} className={"tl-clipe" + (sel === c.i ? " sel" : "")} style={{ left: x, width: w }} onMouseDown={(e) => clipeDown(e, c.i, "corpo")}
                  title={`#${c.i + 1} · ${c.video} ${c.de.toFixed(2)}-${c.ate.toFixed(2)} s`}>
                  <div className="tl-miniaturas">
                    {Array.from({ length: n }, (_, k) => {
                      const t = c.de + (k * tw) / px;
                      return <div key={k} style={{ width: tw, backgroundImage: `url(/midia/${T.id}/quadros/${base}/${String(Math.floor(t) + 1).padStart(5, "0")}.jpg)` }} />;
                    })}
                  </div>
                  <div className="tl-rotulo">#{c.i + 1} {c.video} · {(c.frames / fps).toFixed(1)}s</div>
                  <div className="tl-ponta esq" onMouseDown={(e) => clipeDown(e, c.i, "esq")} />
                  <div className="tl-ponta dir" onMouseDown={(e) => clipeDown(e, c.i, "dir")} />
                </div>
              );
            })}
            {alvo !== null && <div className="tl-alvo" style={{ left: pos((alvo < l.clipes.length ? l.clipes[alvo].desde : l.total) / fps) - 2 }} />}
          </div>

          {/* LEG */}
          <div className="tl-faixa" style={{ height: ALT.leg }}>
            {props.legenda?.ativa !== false && T.ws.map((w, k) => {
              const x = pos(w.de / fps); if (x < vis.sl - 100 || x > vis.sl + vis.w + 100) return null;
              return <div key={k} className="tl-palavra" style={{ left: x, width: Math.max(2, pos((w.ate - w.de) / fps) - 1) }}
                onMouseDown={(e) => { e.stopPropagation(); T.seek(w.de); }} onDoubleClick={T.abrirTexto}>{px > 30 ? w.texto : ""}</div>;
            })}
          </div>

          {/* TXT */}
          <div className="tl-faixa" style={{ height: ALT.txt }}>
            {textos.map((t, k) => (
              <div key={k} className={"tl-bloco tl-" + (t.tipo === "zoom" ? "zoompt" : t.tipo)} style={{ left: pos(t.de), width: Math.max(6, pos(t.dur)) }} title={t.rotulo}
                onMouseDown={(e) => { e.stopPropagation(); T.seek(Math.round(t.de * fps)); }}>{t.rotulo}</div>
            ))}
          </div>

          {/* A1 */}
          <div className="tl-faixa" style={{ height: ALT.a1 }}>
            {l.clipes.map((c: any) => {
              const x = pos(c.desde / fps), w = Math.max(3, pos(c.frames / fps));
              const vol = (c.volume ?? props.volumeVoz ?? 1);
              return (
                <div key={c.i} className={"tl-audio" + (sel === c.i ? " sel" : "")} style={{ left: x, width: w }} onMouseDown={(e) => clipeDown(e, c.i, "corpo")}>
                  {x < vis.sl + vis.w + 50 && x + w > vis.sl - 50 && <Onda dados={T.ondas[String(c.video).replace(/\.mp4$/, "")]} de={c.de} ate={c.ate} largura={w} altura={ALT.a1 - 4} volume={vol} />}
                  {vol !== 1 && <div className="tl-vol">{Math.round(vol * 100)}%</div>}
                </div>
              );
            })}
          </div>

          {/* A2 */}
          <div className="tl-faixa" style={{ height: ALT.a2 }}>
            {props.trilha && <div className="tl-bloco tl-trilha" style={{ left: 0, width: pos(total) }}>♪ {props.trilha.arquivo} · {Math.round((props.trilha.volume ?? 0.12) * 100)}%</div>}
          </div>

          <Cursor fps={fps} px={px} altura={alturaTotal} scroller={scroller} />
        </div>
      </div>
    </div>
  );
}
