// Edição padrão do estúdio (aba Edição de Vídeo da Central). Um componente só, testado, configurado pelo props.json.
// O agente NÃO reescreve isto a cada vídeo: muda o props.json e, se precisar de algo único, põe em projetos/<slug>/Extras.tsx.
// Tempos no props.json: "de"/"ate" e "palavras" em segundos do vídeo ORIGINAL; "em" (impactos, zooms) em segundos do vídeo FINAL.
import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";

const FONTES: Record<string, string> = {
  Anton: anton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] }).fontFamily,
  Montserrat: montserrat("normal", { weights: ["800", "900"], subsets: ["latin", "latin-ext"] }).fontFamily,
};

export type Palavra = { texto: string; inicio: number; fim: number };
export type Zoom = "auto" | "nenhum" | "entrar" | "sair" | "soco" | number;
export type Clipe = { video: string; de: number; ate: number; zoom?: Zoom; foco?: [number, number]; volume?: number };
export type Props = {
  formato?: "9:16" | "4:5" | "1:1" | "16:9";
  fps?: number;
  clipes: Clipe[];
  palavras?: Record<string, Palavra[]>;
  legenda?: {
    ativa?: boolean; maxPalavras?: number; maxCaracteres?: number; posicao?: number; tamanho?: number; fonte?: string;
    cor?: string; corAtiva?: string | null; caixaAlta?: boolean; contorno?: number; fundo?: string | null;
  };
  destaque?: { cor?: string; palavras?: string[]; escala?: number };
  impactos?: { texto: string; palavra?: string; ocorrencia?: number; em?: number; duracao?: number; posicao?: number; cor?: string; tamanho?: number }[];
  zooms?: { palavra?: string; ocorrencia?: number; em?: number; duracao?: number; escala?: number }[];
  zoom?: { modo?: "alternado" | "suave" | "nenhum"; intensidade?: number };
  foco?: [number, number];
  transicao?: "corte" | "flash";
  enquadramento?: "preencher" | "conter";
  cobrir?: { y: number; altura: number } | null;
  gancho?: { texto: string; duracao?: number; modo?: "sobre" | "tela"; posicao?: number } | null;
  cta?: { texto: string; duracao?: number; posicao?: number } | null;
  trilha?: { arquivo: string; volume?: number; inicio?: number } | null;
  barraProgresso?: boolean;
  volumeVoz?: number;
};

const TAMANHOS = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] } as const;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const normaliza = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}%$]+/gu, "");

type ClipeLinha = Clipe & { i: number; desde: number; frames: number; iniFonte: number };
type PalavraLinha = { texto: string; de: number; ate: number; clipe: number; forte: boolean; expr?: number };

// Linha do tempo final: clipes em sequência (com o gancho "tela" antes) e palavras convertidas pra quadros do vídeo final.
export function linha(p: Props) {
  const fps = p.fps || 30;
  const offset = p.gancho && p.gancho.modo === "tela" ? Math.round((p.gancho.duracao ?? 1.5) * fps) : 0;
  let cursor = offset;
  const clipes: ClipeLinha[] = (p.clipes || []).map((c, i) => {
    const ini = Math.round(c.de * fps), fim = Math.max(ini + 1, Math.round(c.ate * fps));
    const r = { ...c, i, desde: cursor, frames: fim - ini, iniFonte: ini };
    cursor += fim - ini;
    return r;
  });
  const palavras: PalavraLinha[] = [];
  for (const c of clipes) {
    for (const w of p.palavras?.[c.video] || []) {
      const meio = (w.inicio + w.fim) / 2;
      if (meio < c.de || meio > c.ate) continue;
      const de = clamp(c.desde + Math.round(w.inicio * fps) - c.iniFonte, c.desde, c.desde + c.frames - 1);
      const ate = clamp(c.desde + Math.round(w.fim * fps) - c.iniFonte, de + 1, c.desde + c.frames);
      palavras.push({ texto: w.texto, de, ate, clipe: c.i, forte: false });
    }
  }
  // destaque: cada item pode ter mais de uma palavra ("gamma wall"); marca a sequência inteira
  const alvos = (p.destaque?.palavras || []).map((d) => d.split(/\s+/).map(normaliza).filter(Boolean)).filter((a) => a.length);
  const norm = palavras.map((w) => normaliza(w.texto));
  for (let i = 0; i < palavras.length; i++) {
    for (const a of alvos) if (a.every((t, k) => norm[i + k] === t)) a.forEach((_, k) => { palavras[i + k].forte = true; if (a.length > 1) palavras[i + k].expr = i; });
  }
  return { fps, clipes, palavras, total: Math.max(1, cursor) };
}

export function metadados(p: Props) {
  const [width, height] = TAMANHOS[p.formato || "9:16"] || TAMANHOS["9:16"];
  const l = linha(p);
  return { durationInFrames: l.total, fps: l.fps, width, height };
}

// Quadro do vídeo final em que acontece a N-ésima ocorrência de uma palavra (ou o "em" em segundos).
function ancora(a: { palavra?: string; ocorrencia?: number; em?: number }, ws: PalavraLinha[], fps: number): number | null {
  if (typeof a.em === "number") return Math.round(a.em * fps);
  if (!a.palavra) return null;
  const alvo = a.palavra.split(/\s+/).map(normaliza);
  let n = 0;
  for (let i = 0; i < ws.length; i++) {
    if (alvo.every((t, k) => ws[i + k] && normaliza(ws[i + k].texto) === t) && ++n === (a.ocorrencia || 1)) return ws[i].de;
  }
  return null;
}

// ─── Legenda: páginas curtas (2 a 3 palavras), frase quebrada em pontuação e pausa ─────────────────────────────────
type Pagina = { ws: PalavraLinha[]; de: number; ate: number };
function paginas(ws: PalavraLinha[], maxP: number, maxC: number, fps: number): Pagina[] {
  const out: PalavraLinha[][] = [];
  let cur: PalavraLinha[] = [];
  const fecha = () => { if (cur.length) out.push(cur); cur = []; };
  ws.forEach((w, i) => {
    const prev = ws[i - 1];
    const len = cur.map((x) => x.texto).join(" ").length + 1 + w.texto.length;
    const mesmaExpr = prev && w.expr !== undefined && w.expr === prev.expr; // "big mac" nunca se parte em duas telas
    if (cur.length && !mesmaExpr && (cur.length >= maxP || len > maxC || (prev && w.de - prev.ate > 0.45 * fps))) fecha();
    else if (cur.length && !mesmaExpr && w.expr !== undefined && cur.length + (ws.filter((x) => x.expr === w.expr).length) > maxP + 1) fecha();
    cur.push(w);
    if (/[.!?…]$/.test(w.texto) || (/[,;:]$/.test(w.texto) && cur.length >= 2)) fecha();
  });
  fecha();
  return out.map((g, k) => {
    const prox = out[k + 1];
    const fim = g[g.length - 1].ate + Math.round(0.5 * fps);
    return { ws: g, de: g[0].de, ate: prox ? Math.min(prox[0].de, fim) : fim };
  });
}

const Legenda: React.FC<{ p: Props; ws: PalavraLinha[] }> = ({ p, ws }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = p.legenda || {};
  const esc = width / 1080;
  const pags = React.useMemo(() => paginas(ws, L.maxPalavras || 3, L.maxCaracteres || 22, fps), [ws, L.maxPalavras, L.maxCaracteres, fps]);
  if (L.ativa === false) return null;
  const pg = pags.find((x) => frame >= x.de && frame < x.ate);
  if (!pg) return null;
  const t = frame - pg.de;
  const entra = spring({ frame: t, fps, config: { damping: 14, stiffness: 260, mass: 0.6 } });
  const cor = L.cor || "#FFFFFF", dest = p.destaque?.cor || "#FF0000", escD = p.destaque?.escala ?? 1.18;
  const tam = (L.tamanho || 92) * esc;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", left: 70 * esc, right: 70 * esc, top: (L.posicao ?? 0.68) * height,
          transform: `translateY(-50%) scale(${interpolate(entra, [0, 1], [0.82, 1])}) translateY(${interpolate(entra, [0, 1], [18, 0])}px)`,
          opacity: interpolate(t, [0, 3], [0, 1], { extrapolateRight: "clamp" }),
          display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", columnGap: tam * 0.24, rowGap: tam * 0.05,
          fontFamily: FONTES[L.fonte || "Anton"] || FONTES.Anton, fontWeight: L.fonte === "Montserrat" ? 900 : 400,
          lineHeight: 1.08, textAlign: "center",
        }}
      >
        {pg.ws.map((w, i) => {
          const ativa = frame >= w.de && (i === pg.ws.length - 1 || frame < pg.ws[i + 1].de);
          const pop = ativa ? spring({ frame: frame - w.de, fps, config: { damping: 12, stiffness: 300 }, durationInFrames: 8 }) : 1;
          const s = (w.forte ? escD : 1) * (ativa ? interpolate(pop, [0, 1], [1.12, 1]) : 1);
          const c = w.forte ? dest : ativa && L.corAtiva ? L.corAtiva : cor;
          return (
            <span
              key={i}
              style={{
                display: "inline-block", fontSize: tam * (w.forte ? escD : 1), color: c, transform: `scale(${s / (w.forte ? escD : 1)})`,
                textTransform: L.caixaAlta === false && !w.forte ? "none" : "uppercase",
                WebkitTextStroke: L.fundo ? undefined : `${(L.contorno ?? 10) * esc}px #000`, paintOrder: "stroke fill",
                textShadow: L.fundo ? undefined : `0 ${6 * esc}px ${18 * esc}px rgba(0,0,0,.6)`,
                background: L.fundo || undefined, padding: L.fundo ? `${4 * esc}px ${14 * esc}px` : undefined, borderRadius: L.fundo ? 12 * esc : undefined,
              }}
            >
              {w.texto.replace(/[.,;:]+$/, "")}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Vídeo ────────────────────────────────────────────────────────────────────────────────────────────────────────
function escalaClipe(c: ClipeLinha, p: Props, t: number): number {
  const I = p.zoom?.intensidade ?? 1.12, modo = p.zoom?.modo || "alternado";
  const z: Zoom = c.zoom ?? "auto";
  if (typeof z === "number") return z;
  const prog = c.frames > 1 ? t / (c.frames - 1) : 0;
  const ida = (a: number, b: number) => interpolate(prog, [0, 1], [a, b]);
  if (z === "nenhum") return 1;
  if (z === "entrar") return ida(1, I);
  if (z === "sair") return ida(I, 1);
  if (z === "soco") return ida(I, I + 0.02);
  if (modo === "nenhum") return 1;
  if (modo === "suave") return c.i % 2 ? ida(1 + (I - 1) / 2, 1) : ida(1, 1 + (I - 1) / 2);
  return c.i % 2 ? ida(I, I + 0.02) : ida(1, 1.03); // alternado: corte seco com soco de câmera em clipe sim, clipe não
}

// Desfoca a faixa da legenda que já veio queimada no vídeo. Fica dentro do quadro com zoom, então acompanha o movimento.
const Tarja: React.FC<{ y: number; altura: number }> = ({ y, altura }) => {
  const { height } = useVideoConfig();
  const borda = "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)";
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, top: y * height, height: altura * height,
      backdropFilter: "blur(26px) brightness(.85)", WebkitBackdropFilter: "blur(26px) brightness(.85)", maskImage: borda, WebkitMaskImage: borda,
    }} />
  );
};

const ClipeView: React.FC<{ c: ClipeLinha; p: Props; extra: number }> = ({ c, p, extra }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const foco = c.foco || p.foco || [0.5, 0.35];
  const s = escalaClipe(c, p, frame) * extra;
  const vol = (f: number) => (c.volume ?? p.volumeVoz ?? 1) * Math.min(1, (f + 1) / 2, (c.frames - f) / 2);
  const src = staticFile(c.video);
  const conter = p.enquadramento === "conter";
  const transf = { transform: `scale(${s})`, transformOrigin: `${foco[0] * 100}% ${foco[1] * 100}%` };
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      {conter && (
        <OffthreadVideo src={src} trimBefore={c.iniFonte} muted
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(40px) brightness(.55)", transform: "scale(1.2)" }} />
      )}
      <AbsoluteFill style={transf}>
        <OffthreadVideo src={src} trimBefore={c.iniFonte} volume={vol}
          style={{ width: "100%", height: "100%", objectFit: conter ? "contain" : "cover", objectPosition: `${foco[0] * 100}% ${foco[1] * 100}%` }} />
        {p.cobrir && <Tarja y={p.cobrir.y} altura={p.cobrir.altura} />}
      </AbsoluteFill>
      {p.transicao === "flash" && c.i > 0 && (
        <AbsoluteFill style={{ backgroundColor: "#fff", opacity: interpolate(frame, [0, Math.round(fps * 0.15)], [0.55, 0], { extrapolateRight: "clamp" }) }} />
      )}
    </AbsoluteFill>
  );
};

const TextoGrande: React.FC<{ texto: string; dur: number; posicao: number; cor: string; tamanho: number; fonte: string; fundo?: string }> = ({ texto, dur, posicao, cor, tamanho, fonte, fundo }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const esc = width / 1080;
  const e = spring({ frame, fps, config: { damping: 10, stiffness: 220, mass: 0.7 } });
  const sai = interpolate(frame, [dur - 5, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", left: 60 * esc, right: 60 * esc, top: posicao * height, transform: `translateY(-50%) scale(${interpolate(e, [0, 1], [0.55, 1])})`,
      opacity: Math.min(interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" }), sai), textAlign: "center",
      fontFamily: fonte, fontSize: tamanho * esc, lineHeight: 0.98, color: cor, textTransform: "uppercase", whiteSpace: "pre-line",
      WebkitTextStroke: fundo ? undefined : `${12 * esc}px #000`, paintOrder: "stroke fill", textShadow: `0 ${8 * esc}px ${30 * esc}px rgba(0,0,0,.65)`,
    }}>
      {fundo ? <span style={{ background: fundo, padding: `${10 * esc}px ${30 * esc}px`, borderRadius: 18 * esc, display: "inline-block" }}>{texto}</span> : texto}
    </div>
  );
};

export const Edicao: React.FC<Props & { children?: React.ReactNode }> = (p) => {
  const frame = useCurrentFrame();
  const { fps, height, durationInFrames } = useVideoConfig();
  const l = React.useMemo(() => linha(p), [p]);
  const fonte = FONTES[p.legenda?.fonte || "Anton"] || FONTES.Anton;
  const dest = p.destaque?.cor || "#FF0000";
  // zoom pontual (mergulho) em palavras ou segundos: entra com mola, segura e solta
  let extra = 1;
  for (const z of p.zooms || []) {
    const q = ancora(z, l.palavras, fps); if (q === null) continue;
    const d = Math.round((z.duracao ?? 1.2) * fps), es = z.escala ?? 1.25;
    if (frame < q || frame > q + d + 8) continue;
    const ent = spring({ frame: frame - q, fps, config: { damping: 18, stiffness: 160 } });
    const sai = spring({ frame: frame - q - d, fps, config: { damping: 20, stiffness: 160 } });
    extra *= 1 + (es - 1) * (ent - (frame > q + d ? sai : 0));
  }
  const ganchoDur = p.gancho ? Math.round((p.gancho.duracao ?? 1.5) * fps) : 0;
  const ctaDur = p.cta ? Math.round((p.cta.duracao ?? 2.5) * fps) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {l.clipes.map((c) => (
        <Sequence key={c.i} from={c.desde} durationInFrames={c.frames}>
          <ClipeView c={c} p={p} extra={extra} />
        </Sequence>
      ))}
      {p.gancho && p.gancho.modo === "tela" && (
        <Sequence from={0} durationInFrames={ganchoDur}>
          <AbsoluteFill style={{ backgroundColor: "#000" }} />
          <TextoGrande texto={p.gancho.texto} dur={ganchoDur} posicao={0.5} cor="#FFFFFF" tamanho={130} fonte={fonte} />
        </Sequence>
      )}
      {p.gancho && p.gancho.modo !== "tela" && (
        <Sequence from={0} durationInFrames={ganchoDur}>
          <TextoGrande texto={p.gancho.texto} dur={ganchoDur} posicao={p.gancho.posicao ?? 0.2} cor="#FFFFFF" tamanho={104} fonte={fonte} />
        </Sequence>
      )}
      {(p.impactos || []).map((im, k) => {
        const q = ancora(im, l.palavras, fps); if (q === null) return null;
        const d = Math.round((im.duracao ?? 1) * fps);
        return (
          <Sequence key={k} from={q} durationInFrames={d}>
            <TextoGrande texto={im.texto} dur={d} posicao={im.posicao ?? 0.4} cor={im.cor || dest} tamanho={im.tamanho ?? 150} fonte={fonte} />
          </Sequence>
        );
      })}
      <Legenda p={p} ws={l.palavras} />
      {p.cta && (
        <Sequence from={Math.max(0, durationInFrames - ctaDur)} durationInFrames={ctaDur}>
          <TextoGrande texto={p.cta.texto} dur={ctaDur + 10} posicao={p.cta.posicao ?? 0.42} cor="#FFFFFF" tamanho={86} fonte={fonte} fundo={dest} />
        </Sequence>
      )}
      {p.barraProgresso && (
        <div style={{ position: "absolute", left: 0, top: 0, height: 10, width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`, background: dest }} />
      )}
      {p.trilha && (
        <Audio src={staticFile(p.trilha.arquivo)} loop trimBefore={Math.round((p.trilha.inicio || 0) * fps)}
          volume={(f) => (p.trilha!.volume ?? 0.12) * Math.min(1, f / (fps * 0.8), (durationInFrames - f) / (fps * 1.2))} />
      )}
      {p.children}
    </AbsoluteFill>
  );
};
