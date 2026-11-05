import { Composition } from "remotion";
import { VideoLegendado, type Props } from "./VideoLegendado";

// Tamanho e fps ficam aqui (1080x1920 vertical, 1080x1350 feed, 1920x1080 horizontal).
// A DURAÇÃO vem do props.json (campo "duracao", em segundos): o render calcula os quadros sozinho.
const FPS = 30;

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={VideoLegendado}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 10}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.round((props.duracao || 10) * FPS)) })}
    defaultProps={{
      video: "video.mp4",
      inicio: 0,
      duracao: 10,
      legendas: [] as Props["legendas"],
      destaque: "#FF0000",
    }}
  />
);
