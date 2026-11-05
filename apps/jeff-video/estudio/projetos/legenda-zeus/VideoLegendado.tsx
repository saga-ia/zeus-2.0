import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

// Vídeo do usuário em tela cheia + legenda palavra por palavra (estilo Reels).
// palavras: lista plana com tempo de cada palavra e a cor dela (branco ou azul pra palavra-gatilho).
export type Props = {
  video: string; // arquivo dentro da pasta pública do projeto (public/<slug>/), ex: "video.mp4"
  inicio: number; // segundo do vídeo original em que este corte começa
  duracao: number; // duração do vídeo final em segundos (o Root calcula os quadros a partir daqui)
  palavras: { texto: string; inicio: number; fim: number; cor: string }[];
  destaque: string;
};

type Chunk = { inicio: number; fim: number; palavras: Props["palavras"] };

// Agrupa as palavras em blocos curtos (até 4 palavras, ou quando há uma pausa de fala),
// pra legenda ficar legível e cada bloco aparecer sincronizado com a voz.
function agruparEmBlocos(palavras: Props["palavras"]): Chunk[] {
  const blocos: Chunk[] = [];
  let atual: Props["palavras"] = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    const anterior = palavras[i - 1];
    const pausa = anterior ? p.inicio - anterior.fim : 0;
    if (atual.length >= 4 || (atual.length > 0 && pausa > 0.6)) {
      blocos.push({ inicio: atual[0].inicio, fim: atual[atual.length - 1].fim, palavras: atual });
      atual = [];
    }
    atual.push(p);
  }
  if (atual.length > 0) {
    blocos.push({ inicio: atual[0].inicio, fim: atual[atual.length - 1].fim, palavras: atual });
  }
  return blocos;
}

const Palavra: React.FC<{ texto: string; cor: string; atrasoFrames: number }> = ({ texto, cor, atrasoFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - atrasoFrames;
  const entrada = spring({ frame: local, fps, config: { damping: 14, stiffness: 180, mass: 0.5 } });
  const escala = interpolate(entrada, [0, 1], [0.4, 1], { extrapolateRight: "clamp" });
  const opacidade = interpolate(entrada, [0, 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <span
      style={{
        display: "inline-block",
        color: cor,
        transform: `scale(${Math.max(0.01, escala)})`,
        opacity: opacidade,
      }}
    >
      {texto}
    </span>
  );
};

const Legenda: React.FC<{ bloco: Chunk; inicioVideo: number }> = ({ bloco, inicioVideo }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
      <div
        style={{
          maxWidth: 940,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: 22,
          rowGap: 6,
          textAlign: "center",
          fontFamily,
          fontSize: 82,
          lineHeight: 1.12,
          textTransform: "uppercase",
          WebkitTextStroke: "3px #000000",
          paintOrder: "stroke",
          textShadow: "0 6px 18px rgba(0,0,0,0.6)",
        }}
      >
        {bloco.palavras.map((p, i) => {
          const atrasoFrames = Math.round((p.inicio - bloco.inicio) * fps);
          return <Palavra key={i} texto={p.texto} cor={p.cor} atrasoFrames={atrasoFrames} />;
        })}
      </div>
    </AbsoluteFill>
  );
};

export const VideoLegendado: React.FC<Props> = ({ video, inicio, palavras, destaque }) => {
  void destaque;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blocos = agruparEmBlocos(palavras);

  // Zoom contínuo e suave (Ken Burns em ciclo de 8s) pra dar dinamismo numa gravação de tela estática.
  const cicloFrames = fps * 8;
  const t = (frame % cicloFrames) / cicloFrames;
  const escalaVideo = 1 + 0.05 * Math.sin(t * Math.PI);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <OffthreadVideo
        src={staticFile(video)}
        startFrom={Math.round(inicio * fps)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${escalaVideo})` }}
      />
      {blocos.map((bloco, i) => {
        const de = Math.round((bloco.inicio - inicio) * fps);
        const proximo = blocos[i + 1];
        const limite = proximo ? Math.round((proximo.inicio - inicio) * fps) - de : Infinity;
        const dur = Math.max(1, Math.min(limite, Math.round((bloco.fim - bloco.inicio) * fps) + Math.round(fps * 0.15)));
        if (de + dur <= 0) return null;
        return (
          <Sequence key={i} from={Math.max(0, de)} durationInFrames={dur}>
            <Legenda bloco={bloco} inicioVideo={bloco.inicio} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
