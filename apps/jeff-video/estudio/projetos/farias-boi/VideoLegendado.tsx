import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";

const { fontFamily: anton } = loadAnton();
const { fontFamily: dmSans } = loadDMSans();

const AZUL = "#1757FF";

export type Palavra = { inicio: number; fim: number; palavra: string };
export type Split = { inicio: number; fim: number; texto: string; lado: "esquerda" | "direita" };
export type Zoom = { inicio: number; fim: number; de: number; para: number };

export type Props = {
  video: string;
  inicio: number;
  duracao: number;
  palavras: Palavra[];
  impacto: string[];
  destaque: string;
  zooms: Zoom[];
  splits: Split[];
};

const limpa = (p: string) => p.toLowerCase().replace(/[.,!?;:]/g, "");

// zoom em cascata: interpola a escala a partir das janelas definidas em props.zooms
const useZoom = (zooms: Zoom[], inicioCorte: number, fps: number) => {
  const frame = useCurrentFrame();
  const segundo = inicioCorte + frame / fps;
  let escala = 1;
  for (const z of zooms) {
    if (segundo >= z.inicio && segundo <= z.fim) {
      escala = interpolate(segundo, [z.inicio, z.fim], [z.de, z.para], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    }
  }
  return escala;
};

const CardSplit: React.FC<{ texto: string; lado: "esquerda" | "direita" }> = ({ texto, lado }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 200, stiffness: 120 } });
  const saida = spring({ frame: durationInFrames - frame, fps, config: { damping: 200, stiffness: 120 } });
  const progresso = Math.min(entrada, saida);
  const deslocamentoFora = lado === "esquerda" ? -560 : 560;
  const x = interpolate(progresso, [0, 1], [deslocamentoFora, 0]);
  return (
    <AbsoluteFill style={{ [lado === "esquerda" ? "justifyContent" : "justifyContent"]: "center" } as any}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [lado]: 0,
          width: "46%",
          background: "linear-gradient(180deg, #000000 0%, #05070d 60%, #000000 100%)",
          borderLeft: lado === "direita" ? `6px solid ${AZUL}` : undefined,
          borderRight: lado === "esquerda" ? `6px solid ${AZUL}` : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 36px",
          transform: `translateX(${x}px)`,
          opacity: progresso,
        } as any}
      >
        <div
          style={{
            fontFamily: anton,
            textTransform: "uppercase",
            color: "#FFFFFF",
            fontSize: texto.length > 9 ? 56 : 76,
            lineHeight: 1.05,
            textAlign: "center",
            letterSpacing: "0.02em",
          }}
        >
          {texto.split(" ").map((palavra, i) => (
            <div key={i} style={{ color: i === texto.split(" ").length - 1 ? AZUL : "#FFFFFF" }}>
              {palavra}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Legenda: React.FC<{ palavras: Palavra[]; inicioCorte: number; impacto: string[]; destaque: string }> = ({
  palavras,
  inicioCorte,
  impacto,
  destaque,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segundo = inicioCorte + frame / fps;

  // janela de 4 palavras por vez, centrada na palavra atual
  const indiceAtual = palavras.findIndex((p) => segundo >= p.inicio && segundo < p.fim);
  if (indiceAtual === -1) return null;

  const JANELA = 4;
  const inicioJanela = Math.max(0, indiceAtual - (indiceAtual % JANELA));
  const grupo = palavras.slice(inicioJanela, inicioJanela + JANELA);

  const entrada = spring({ frame: frame - Math.round((grupo[0].inicio - inicioCorte) * fps), fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 340 }}>
      <div
        style={{
          maxWidth: 940,
          textAlign: "center",
          fontFamily: anton,
          fontSize: 80,
          lineHeight: 1.08,
          textTransform: "uppercase",
          color: "#FFFFFF",
          WebkitTextStroke: "3px #000000",
          paintOrder: "stroke",
          textShadow: "0 6px 20px rgba(0,0,0,0.6)",
          transform: `scale(${interpolate(entrada, [0, 1], [0.92, 1])})`,
          opacity: entrada,
        }}
      >
        {grupo.map((p, i) => {
          const ativa = p === palavras[indiceAtual];
          const palavraLimpa = limpa(p.palavra);
          const ehImpacto = impacto.includes(palavraLimpa);
          const escalaAtiva = ativa && ehImpacto ? 1.14 : 1;
          return (
            <span
              key={i}
              style={{
                color: ativa && ehImpacto ? destaque : "#FFFFFF",
                display: "inline-block",
                transform: `scale(${escalaAtiva})`,
                marginRight: 16,
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

const Selo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 90, opacity: entrada }}>
      <div
        style={{
          fontFamily: dmSans,
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: "0.22em",
          color: "#FFFFFF",
          background: "rgba(0,0,0,0.55)",
          border: `2px solid ${AZUL}`,
          borderRadius: 999,
          padding: "10px 28px",
        }}
      >
        @FARIASSOUZA.OFICIAL
      </div>
    </AbsoluteFill>
  );
};

export const VideoLegendado: React.FC<Props> = ({ video, inicio, palavras, impacto, destaque, zooms, splits }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const escala = useZoom(zooms, inicio, fps);
  const frame = useCurrentFrame();
  const segundoAtual = inicio + frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <AbsoluteFill style={{ transform: `scale(${escala})` }}>
        <OffthreadVideo
          src={staticFile(video)}
          startFrom={Math.round(inicio * fps)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* vinheta leve pra legibilidade */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)" }} />

      {/* tarja fixa pra esconder a legenda queimada do vídeo original (sempre na mesma altura) */}
      <AbsoluteFill
        style={{
          top: "47.5%",
          height: "12%",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.97) 15%, rgba(0,0,0,0.97) 85%, rgba(0,0,0,0) 100%)",
        }}
      />

      <Selo />

      {splits.map((s, i) => {
        const de = Math.round((s.inicio - inicio) * fps);
        const dur = Math.max(1, Math.round((s.fim - s.inicio) * fps));
        if (de + dur <= 0 || de >= durationInFrames) return null;
        return (
          <Sequence key={i} from={Math.max(0, de)} durationInFrames={dur}>
            <CardSplit texto={s.texto} lado={s.lado} />
          </Sequence>
        );
      })}

      <Legenda palavras={palavras} inicioCorte={inicio} impacto={impacto} destaque={destaque} />
    </AbsoluteFill>
  );
};
