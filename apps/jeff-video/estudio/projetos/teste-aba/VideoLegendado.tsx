import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

// Vídeo do usuário em tela cheia + legenda palavra por palavra (estilo Reels), com a palavra falada em destaque.
// legendas: segmentos da transcrição de "video transcrever" (arquivo transcricao.json, campo "segmentos").
export type Props = {
  video: string; // arquivo dentro da pasta pública do projeto (public/<slug>/), ex: "video.mp4"
  inicio: number; // segundo do vídeo original em que este corte começa
  legendas: { inicio: number; fim: number; texto: string }[];
  destaque: string;
};

const Legenda: React.FC<{ texto: string; duracao: number; destaque: string }> = ({ texto, duracao, destaque }) => {
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
          maxWidth: 900,
          textAlign: "center",
          fontFamily,
          fontSize: 78,
          lineHeight: 1.1,
          textTransform: "uppercase",
          color: "#FFFFFF",
          WebkitTextStroke: "3px #000000",
          paintOrder: "stroke",
          textShadow: "0 6px 18px rgba(0,0,0,0.55)",
          transform: `scale(${interpolate(entrada, [0, 1], [0.9, 1])})`,
          opacity: entrada,
        }}
      >
        {palavras.map((p, i) => (
          <span key={i} style={{ color: i === atual ? destaque : "#FFFFFF" }}>
            {p}{" "}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const VideoLegendado: React.FC<Props> = ({ video, inicio, legendas, destaque }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo src={staticFile(video)} startFrom={Math.round(inicio * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {legendas.map((l, i) => {
        const de = Math.round((l.inicio - inicio) * fps);
        const dur = Math.max(1, Math.round((l.fim - l.inicio) * fps));
        if (de + dur <= 0) return null;
        return (
          <Sequence key={i} from={Math.max(0, de)} durationInFrames={dur}>
            <Legenda texto={l.texto} duracao={dur} destaque={destaque} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
