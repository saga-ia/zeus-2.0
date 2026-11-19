import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

const AZUL = "#2E8BFF";

// Headline de abertura: etiqueta no topo com o gancho do vídeo.
export const Headline: React.FC<{ linha1: string; linha2: string; destaque?: string }> = ({
  linha1,
  linha2,
  destaque,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 15, stiffness: 160, mass: 0.6 } });
  const saida = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(entrada, [0, 1], [-90, 0], { extrapolateRight: "clamp" });
  const partes = linha2.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 210 }}>
      <div
        style={{
          transform: `translateY(${y}px)`,
          opacity: entrada * saida,
          backgroundColor: "rgba(0,0,0,0.78)",
          borderLeft: `10px solid ${AZUL}`,
          padding: "26px 34px",
          maxWidth: 940,
          textAlign: "center",
          fontFamily,
          textTransform: "uppercase",
          lineHeight: 1.05,
        }}
      >
        <div style={{ color: "#FFFFFF", fontSize: 66, letterSpacing: 1 }}>{linha1}</div>
        <div style={{ fontSize: 86, letterSpacing: 1 }}>
          {partes.map((p, i) => (
            <span key={i} style={{ color: destaque && p.includes(destaque) ? AZUL : "#FFFFFF" }}>
              {p}{" "}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Palavra de impacto: etiqueta curta que entra com soco no topo do vídeo.
export const Impacto: React.FC<{ texto: string }> = ({ texto }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 11, stiffness: 220, mass: 0.5 } });
  const saida = interpolate(frame, [durationInFrames - 7, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const escala = interpolate(entrada, [0, 1], [0.5, 1], { extrapolateRight: "clamp" });
  const giro = interpolate(entrada, [0, 1], [-4, -2], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 300 }}>
      <div
        style={{
          transform: `scale(${Math.max(0.01, escala)}) rotate(${giro}deg)`,
          opacity: entrada * saida,
          backgroundColor: AZUL,
          color: "#FFFFFF",
          padding: "16px 30px",
          fontFamily,
          fontSize: 76,
          letterSpacing: 1,
          textTransform: "uppercase",
          boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        }}
      >
        {texto}
      </div>
    </AbsoluteFill>
  );
};

// Flash branco curto, usado na entrada de cada impacto.
export const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const opacidade = interpolate(frame, [0, 2, 6], [0.38, 0.18, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: "#FFFFFF", opacity: opacidade }} />;
};

// Barra de progresso fina no rodapé: mostra quanto falta do vídeo.
export const BarraProgresso: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = Math.min(1, frame / Math.max(1, durationInFrames));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ height: 10, width: "100%", backgroundColor: "rgba(255,255,255,0.18)" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: AZUL }} />
      </div>
    </AbsoluteFill>
  );
};
