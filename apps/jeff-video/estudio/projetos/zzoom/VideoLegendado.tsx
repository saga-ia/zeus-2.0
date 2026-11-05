import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

// Vídeo do usuário em tela cheia + legenda palavra por palavra (estilo Reels).
// palavras: lista com o tempo real de cada palavra (de "video transcrever") e a flag "destaque"
// marcando os termos-gatilho, que entram com zoom maior e cor de destaque.
export type Props = {
  video: string; // arquivo dentro da pasta pública do projeto (public/<slug>/), ex: "video.mp4"
  inicio: number; // segundo do vídeo original em que este corte começa
  duracao: number; // duração do vídeo final em segundos (o Root calcula os quadros a partir daqui)
  palavras: { inicio: number; fim: number; texto: string; destaque: boolean }[];
  destaque: string;
};

const Palavra: React.FC<{ texto: string; destaque: boolean; corDestaque: string }> = ({ texto, destaque, corDestaque }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({
    frame,
    fps,
    config: { damping: destaque ? 10 : 200, mass: 0.5, stiffness: destaque ? 260 : 180 },
    durationInFrames: 9,
  });
  const escalaBase = destaque ? 1.55 : 1;
  const escala = interpolate(entrada, [0, 1], [destaque ? 0.3 : 0.88, escalaBase]);
  const base = destaque ? 148 : 84;
  const maxChars = destaque ? 8 : 13;
  const fontSize = texto.length > maxChars ? Math.max(base * (maxChars / texto.length), destaque ? 70 : 50) : base;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
      <div
        style={{
          maxWidth: 950,
          textAlign: "center",
          fontFamily,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.1,
          textTransform: "uppercase",
          color: destaque ? corDestaque : "#FFFFFF",
          WebkitTextStroke: destaque ? "5px #000000" : "3px #000000",
          paintOrder: "stroke",
          textShadow: destaque
            ? `0 0 50px ${corDestaque}, 0 0 90px ${corDestaque}, 0 8px 20px rgba(0,0,0,0.6)`
            : "0 6px 18px rgba(0,0,0,0.55)",
          transform: `scale(${escala})`,
          opacity: Math.min(1, entrada * 2),
        }}
      >
        {texto}
      </div>
    </AbsoluteFill>
  );
};

export const VideoLegendado: React.FC<Props> = ({ video, inicio, palavras, destaque }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo src={staticFile(video)} startFrom={Math.round(inicio * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {palavras.map((p, i) => {
        const de = Math.round((p.inicio - inicio) * fps);
        const dur = Math.max(1, Math.round((p.fim - p.inicio) * fps));
        if (de + dur <= 0) return null;
        return (
          <Sequence key={i} from={Math.max(0, de)} durationInFrames={dur}>
            <Palavra texto={p.texto} destaque={p.destaque} corDestaque={destaque} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
