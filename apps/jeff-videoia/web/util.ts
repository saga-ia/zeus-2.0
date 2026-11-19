// Utilidades da tela: chamadas à API, relógio do player (sem re-renderizar a tela inteira a cada quadro),
// formatação de tempo e as operações de edição sobre o props (dividir, apagar, mover, cortar palavras).
import { useEffect, useState } from "react";

export async function api(url: string, opts: any = {}) {
  const corpo = opts.body;
  const json = corpo !== undefined && !(corpo instanceof FormData) && typeof corpo !== "string";
  const r = await fetch(url, { credentials: "same-origin", ...opts, headers: json ? { "Content-Type": "application/json" } : undefined, body: json ? JSON.stringify(corpo) : corpo });
  if (r.status === 401) { location.href = "/login"; throw new Error("sessão expirada"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || "erro " + r.status);
  return j;
}

// relógio do player: quem precisa do quadro atual assina (cursor, timecode); o resto da tela não re-renderiza
type Ouvinte = (f: number) => void;
export const relogio = {
  frame: 0, tocando: false, subs: new Set<Ouvinte>(), subsTocando: new Set<(t: boolean) => void>(),
  set(f: number) { if (f === this.frame) return; this.frame = f; this.subs.forEach((s) => s(f)); },
  setTocando(t: boolean) { this.tocando = t; this.subsTocando.forEach((s) => s(t)); },
};
export function useFrame() {
  const [f, setF] = useState(relogio.frame);
  useEffect(() => { relogio.subs.add(setF); return () => { relogio.subs.delete(setF); }; }, []);
  return f;
}
export function useTocando() {
  const [t, setT] = useState(relogio.tocando);
  useEffect(() => { relogio.subsTocando.add(setT); return () => { relogio.subsTocando.delete(setT); }; }, []);
  return t;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const dois = (n: number) => String(Math.floor(n)).padStart(2, "0");
// 00:00:12:04 (horas:min:seg:quadro), como no DaVinci
export const timecode = (frame: number, fps: number) => { const s = frame / fps; return `${dois(s / 3600)}:${dois((s % 3600) / 60)}:${dois(s % 60)}:${dois(frame % fps)}`; };
export const mmss = (s: number) => { s = Math.max(0, s); return `${dois(s / 60)}:${dois(s % 60)}`; };
export const mmssd = (s: number) => { s = Math.max(0, s); return `${dois(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
export const copia = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

// palavras que estão na edição, na ordem da linha do tempo, com o tempo na fonte e no vídeo final (quadros)
export type PalavraEd = { clipe: number; texto: string; inicio: number; fim: number; de: number; ate: number };
export function palavrasDaEdicao(props: any, l: any): PalavraEd[] {
  const fps = l.fps, out: PalavraEd[] = [];
  for (const c of l.clipes) {
    for (const w of (props.palavras || {})[c.video] || []) {
      const meio = (w.inicio + w.fim) / 2;
      if (meio < c.de || meio > c.ate) continue;
      const de = clamp(c.desde + Math.round(w.inicio * fps) - c.iniFonte, c.desde, c.desde + c.frames - 1);
      out.push({ clipe: c.i, texto: w.texto, inicio: w.inicio, fim: w.fim, de, ate: clamp(c.desde + Math.round(w.fim * fps) - c.iniFonte, de + 1, c.desde + c.frames) });
    }
  }
  return out;
}

// clipe que está tocando no quadro f
export const clipeNoQuadro = (l: any, f: number) => l.clipes.findIndex((c: any) => f >= c.desde && f < c.desde + c.frames);

// divide o clipe que está sob o cursor em dois; devolve o índice do segundo (ou -1 se não deu)
export function dividir(props: any, l: any, f: number): number {
  const i = clipeNoQuadro(l, f); if (i < 0) return -1;
  const c = props.clipes[i], lc = l.clipes[i];
  const t = +(c.de + (f - lc.desde) / l.fps).toFixed(3);
  if (t - c.de < 0.1 || c.ate - t < 0.1) return -1;
  props.clipes.splice(i, 1, { ...c, ate: t }, { ...c, de: t });
  return i + 1;
}

export function mover(props: any, de: number, para: number) {
  const [c] = props.clipes.splice(de, 1);
  props.clipes.splice(para > de ? para - 1 : para, 0, c);
}

// corta as palavras escolhidas (índices em palavrasDaEdicao): cada clipe afetado perde o trecho, na fronteira entre palavras
export function cortarPalavras(props: any, ws: PalavraEd[], escolhidas: Set<number>) {
  const porClipe = new Map<number, number[]>();
  [...escolhidas].sort((a, b) => a - b).forEach((k) => { const c = ws[k].clipe; porClipe.set(c, [...(porClipe.get(c) || []), k]); });
  for (const ci of [...porClipe.keys()].sort((a, b) => b - a)) {
    const c = props.clipes[ci], ks = porClipe.get(ci)!;
    const doClipe = ws.map((w, k) => ({ w, k })).filter((x) => x.w.clipe === ci);
    // trechos contínuos de palavras escolhidas dentro do clipe
    const blocos: [number, number][] = [];
    for (const k of ks) { const b = blocos[blocos.length - 1]; if (b && k === b[1] + 1) b[1] = k; else blocos.push([k, k]); }
    const partes: [number, number][] = [];
    let ini = c.de;
    for (const [a, b] of blocos) {
      const pa = doClipe.findIndex((x) => x.k === a), pb = doClipe.findIndex((x) => x.k === b);
      const ant = doClipe[pa - 1], prox = doClipe[pb + 1];
      const corteIni = ant ? (ant.w.fim + ws[a].inicio) / 2 : c.de;
      const corteFim = prox ? (ws[b].fim + prox.w.inicio) / 2 : c.ate;
      partes.push([ini, corteIni]); ini = corteFim;
    }
    partes.push([ini, c.ate]);
    const novos = partes.filter(([x, y]) => y - x >= 0.1).map(([x, y]) => ({ ...c, de: +x.toFixed(3), ate: +y.toFixed(3) }));
    props.clipes.splice(ci, 1, ...novos);
  }
}

// quadro final de uma âncora { palavra, ocorrencia } ou { em } (igual ao componente)
export function ancora(a: any, ws: PalavraEd[], fps: number, normaliza: (t: string) => string): number | null {
  if (typeof a.em === "number") return Math.round(a.em * fps);
  if (!a.palavra) return null;
  const alvo = String(a.palavra).split(/\s+/).map(normaliza);
  let n = 0;
  for (let i = 0; i < ws.length; i++) if (alvo.every((t, k) => ws[i + k] && normaliza(ws[i + k].texto) === t) && ++n === (a.ocorrencia || 1)) return ws[i].de;
  return null;
}

export const guardar = { ler(k: string, d: any) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } }, gravar(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
