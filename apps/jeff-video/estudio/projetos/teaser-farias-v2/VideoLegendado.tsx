import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing, random } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

export type Palavra = { palavra: string; inicio: number; fim: number; destaque: boolean };
export type Frase = { inicio: number; fim: number; palavras: Palavra[] };
export type Clipe = { video: string; duracao: number; zoom: string; frases: Frase[] };
export type Props = {
  destaque: string;
  clipes: Clipe[];
  duracao: number;
};

const ABERTURA_S = 1.5;
const FECHAMENTO_S = 2.5;
const SWIPE_FRAMES = 8;

// Legenda: frase inteira visível, palavra falada em destaque e maior.
const Legenda: React.FC<{ frases: Frase[]; destaque: string; frame: number; fps: number }> = ({ frases, destaque, frame, fps }) => {
  const t = frame / fps;
  const frase = frases.find((f) => t >= f.inicio && t <= f.fim + 0.15);
  if (!frase) return null;
  const localFrame = frame - Math.round(frase.inicio * fps);
  const entrada = spring({ frame: localFrame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300 }}>
      <div
        style={{
          maxWidth: 920,
          textAlign: "center",
          fontFamily,
          lineHeight: 1.15,
          textTransform: "uppercase",
          transform: `scale(${interpolate(entrada, [0, 1], [0.9, 1])})`,
          opacity: entrada,
        }}
      >
        {frase.palavras.map((p, i) => {
          const ativa = t >= p.inicio && t <= p.fim + 0.05;
          const grande = p.destaque && ativa;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 6px",
                color: p.destaque ? destaque : "#FFFFFF",
                fontSize: grande ? 96 : 64,
                WebkitTextStroke: grande ? "4px #000000" : "3px #000000",
                paintOrder: "stroke",
                textShadow: "0 6px 18px rgba(0,0,0,0.6)",
                transition: "none",
                transform: grande ? "scale(1.08)" : "scale(1)",
              }}
            >
              {p.palavra}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const zoomTransform = (zoom: string, frame: number, durationInFrames: number, fps: number): string => {
  const prog = Math.min(1, frame / durationInFrames);
  switch (zoom) {
    case "in-slow": {
      const s = interpolate(prog, [0, 1], [1.0, 1.12], { easing: Easing.out(Easing.cubic) });
      return `scale(${s})`;
    }
    case "out": {
      const s = interpolate(prog, [0, 1], [1.12, 1.0], { easing: Easing.inOut(Easing.cubic) });
      return `scale(${s})`;
    }
    case "punch": {
      const sp = spring({ frame, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 12 });
      const s = interpolate(sp, [0, 1], [1.0, 1.16]);
      return `scale(${s})`;
    }
    case "shake": {
      const s = 1.06;
      const dx = (random(`shx-${Math.floor(frame / 3)}`) - 0.5) * 10;
      const dy = (random(`shy-${Math.floor(frame / 3)}`) - 0.5) * 10;
      return `scale(${s}) translate(${dx}px, ${dy}px)`;
    }
    case "kenburns": {
      const s = interpolate(prog, [0, 1], [1.0, 1.16], { easing: Easing.linear });
      const panX = interpolate(prog, [0, 1], [0, -18]);
      return `scale(${s}) translateX(${panX}px)`;
    }
    default:
      return "scale(1)";
  }
};

const ClipBlock: React.FC<{ clipe: Clipe; destaque: string }> = ({ clipe, destaque }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(clipe.duracao * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <AbsoluteFill style={{ transform: zoomTransform(clipe.zoom, frame, durationInFrames, fps), transformOrigin: "center center" }}>
        <OffthreadVideo src={staticFile(clipe.video)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* esconde a legenda queimada do vídeo original (sempre na mesma faixa da tela): a mesma imagem, borrada, por cima só daquela faixa */}
        <div
          style={{
            position: "absolute",
            top: 995,
            left: 40,
            width: 1000,
            height: 120,
            overflow: "hidden",
            borderRadius: 18,
            boxShadow: "inset 0 0 0 1.5px rgba(23,87,255,0.55)",
          }}
        >
          <OffthreadVideo
            src={staticFile(clipe.video)}
            style={{
              position: "absolute",
              top: -995,
              left: -40,
              width: 1080,
              height: 1920,
              objectFit: "cover",
              filter: "blur(50px) brightness(0.5) saturate(0.7)",
              transform: "scale(1.15)",
              transformOrigin: "center center",
            }}
          />
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(23,87,255,0.12)" }} />
        </div>
      </AbsoluteFill>
      <Legenda frases={clipe.frases} destaque={destaque} frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};

// Painel que cobre a tela inteira no corte entre blocos, varrendo de um lado a outro.
const Swipe: React.FC<{ cor: string }> = ({ cor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame, fps, config: { damping: 26, stiffness: 180 }, durationInFrames: SWIPE_FRAMES });
  const x = interpolate(sp, [0, 0.5, 1], [-110, 0, 110]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundColor: cor,
          transform: `translateX(${x}%) skewX(-6deg)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Abertura: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 200 } });
  const sai = spring({ frame: frame - 24, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily,
          color: "#FFFFFF",
          textTransform: "uppercase",
          textAlign: "center",
          lineHeight: 1.1,
          opacity: interpolate(entrada - sai, [0, 1], [0, 1]),
          transform: `scale(${interpolate(entrada, [0, 1], [0.85, 1])})`,
        }}
      >
        <div style={{ fontSize: 66 }}>VOCÊ USA</div>
        <div style={{ fontSize: 92, color: "#1757FF" }}>TODOS OS ESPAÇOS</div>
        <div style={{ fontSize: 66 }}>DO SEU NEGÓCIO?</div>
      </div>
    </AbsoluteFill>
  );
};

const Fechamento: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity: entrada,
          transform: `translateY(${interpolate(entrada, [0, 1], [40, 0])}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 54,
            color: "#FFFFFF",
            letterSpacing: 4,
            marginBottom: 18,
          }}
        >
          @FARIASSOUZA.OFICIAL
        </div>
        <div
          style={{
            fontFamily,
            fontSize: 30,
            color: "#1757FF",
            letterSpacing: 6,
          }}
        >
          CADA ESPAÇO É RECEITA
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const VideoLegendado: React.FC<Props> = ({ destaque, clipes }) => {
  const { fps } = useVideoConfig();
  const aberturaFrames = Math.round(ABERTURA_S * fps);
  const fechamentoFrames = Math.round(FECHAMENTO_S * fps);

  let cursor = aberturaFrames;
  const blocos = clipes.map((c) => {
    const dur = Math.round(c.duracao * fps);
    const from = cursor;
    cursor += dur;
    return { clipe: c, from, dur };
  });

  // swipe entre blocos, exceto entre clip3a -> clip3b (corte seco, "colados")
  const swipeBoundaries = blocos.slice(1).map((b, i) => ({
    at: b.from,
    skip: clipes[i].video === "clip3a.mp4" && clipes[i + 1].video === "clip3b.mp4",
  }));

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Sequence from={0} durationInFrames={aberturaFrames}>
        <Abertura />
      </Sequence>

      {blocos.map((b, i) => (
        <Sequence key={i} from={b.from} durationInFrames={b.dur}>
          <ClipBlock clipe={b.clipe} destaque={destaque} />
        </Sequence>
      ))}

      {swipeBoundaries.map((s, i) =>
        s.skip ? null : (
          <Sequence key={`sw-${i}`} from={s.at - SWIPE_FRAMES / 2} durationInFrames={SWIPE_FRAMES}>
            <Swipe cor={i % 2 === 0 ? "#1757FF" : "#000000"} />
          </Sequence>
        )
      )}

      <Sequence from={cursor} durationInFrames={fechamentoFrames}>
        <Fechamento />
      </Sequence>
    </AbsoluteFill>
  );
};
