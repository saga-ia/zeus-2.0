import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

export type Bloco = { inicio: number; fim: number; zoomDe: number; zoomAte: number; shake?: boolean };

export type Props = {
  video: string;
  inicio: number;
  duracao: number;
  legendas: { inicio: number; fim: number; texto: string }[];
  forte: string[];
  destaque: string;
  blocos: Bloco[];
  cortes: number[];
};

const limpa = (p: string) => p.toLowerCase().replace(/[.,!?;:()"]/g, "");

const Legenda: React.FC<{ texto: string; duracao: number; destaque: string; forte: string[] }> = ({ texto, duracao, destaque, forte }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palavras = texto.trim().split(/\s+/);
  const porPalavra = duracao / palavras.length;
  const entrada = spring({ frame, fps, config: { damping: 200 } });
  const atual = Math.min(palavras.length - 1, Math.floor(frame / porPalavra));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
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
        {palavras.map((p, i) => {
          const ativa = i === atual;
          const impacto = forte.includes(limpa(p));
          const destaqueAtivo = ativa && impacto;
          // progresso de "pulso" só da palavra de impacto ativa (cresce e assenta)
          const localFrame = frame - Math.round(i * porPalavra);
          const pulso = destaqueAtivo
            ? spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 180 }, durationInFrames: 10 })
            : 0;
          const escala = destaqueAtivo ? interpolate(pulso, [0, 1], [1, 1.28]) : 1;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 6px",
                fontSize: destaqueAtivo ? 96 : 74,
                fontWeight: 900,
                color: ativa ? (impacto ? destaque : "#FFFFFF") : "#FFFFFF",
                WebkitTextStroke: "3px #000000",
                paintOrder: "stroke",
                textShadow: "0 6px 18px rgba(0,0,0,0.55)",
                transform: `scale(${escala})`,
                transformOrigin: "center bottom",
              }}
            >
              {p}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Cobre a legenda queimada do vídeo original com uma sombra suave (sem linha dura).
const TarjaOriginal: React.FC = () => {
  const mascara = "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 900,
        height: 260,
        backdropFilter: "blur(45px)",
        WebkitBackdropFilter: "blur(45px)",
        backgroundColor: "rgba(0,0,0,0.35)",
        WebkitMaskImage: mascara,
        maskImage: mascara,
      }}
    />
  );
};

const Swipe: React.FC<{ progresso: number; cor: string }> = ({ progresso, cor }) => {
  // progresso 0 -> 1: a barra entra pela direita, cobre tudo, sai pela esquerda
  const x = interpolate(progresso, [0, 0.5, 1], [100, 0, -100], { easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: cor,
        transform: `translateX(${x}%)`,
      }}
    />
  );
};

export const VideoLegendado: React.FC<Props> = ({ video, inicio, legendas, destaque, forte, blocos, cortes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tAtual = frame / fps;

  const bloco = blocos.find((b) => tAtual >= b.inicio && tAtual < b.fim) ?? blocos[blocos.length - 1];
  const progressoBloco = Math.min(1, Math.max(0, (tAtual - bloco.inicio) / Math.max(0.001, bloco.fim - bloco.inicio)));
  const easeBloco = Easing.out(Easing.cubic)(progressoBloco);
  let escalaVideo = interpolate(easeBloco, [0, 1], [bloco.zoomDe, bloco.zoomAte]);

  let deslocX = 0;
  let deslocY = 0;
  if (bloco.shake) {
    deslocX = Math.sin(frame * 2.3) * 5;
    deslocY = Math.cos(frame * 3.1) * 4;
  }

  // corte mais próximo (swipe) em andamento
  const janelaSwipe = 5 / fps; // ~0.17s de cada lado
  const corteAtivo = cortes.find((c) => Math.abs(tAtual - c) <= janelaSwipe);
  let swipeProgresso = -1;
  if (corteAtivo !== undefined) {
    swipeProgresso = (tAtual - (corteAtivo - janelaSwipe)) / (janelaSwipe * 2);
  }
  const corSwipe = corteAtivo !== undefined && cortes.indexOf(corteAtivo) % 2 === 0 ? "#0B1A3A" : "#000000";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <AbsoluteFill style={{ transform: `scale(${escalaVideo}) translate(${deslocX}px, ${deslocY}px)` }}>
        <OffthreadVideo src={staticFile(video)} startFrom={Math.round(inicio * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <TarjaOriginal />
      {legendas.map((l, i) => {
        const de = Math.round((l.inicio - inicio) * fps);
        const dur = Math.max(1, Math.round((l.fim - l.inicio) * fps));
        if (de + dur <= 0) return null;
        return (
          <Sequence key={i} from={Math.max(0, de)} durationInFrames={dur}>
            <Legenda texto={l.texto} duracao={dur} destaque={destaque} forte={forte} />
          </Sequence>
        );
      })}
      {swipeProgresso >= 0 && swipeProgresso <= 1 && <Swipe progresso={swipeProgresso} cor={corSwipe} />}
    </AbsoluteFill>
  );
};
