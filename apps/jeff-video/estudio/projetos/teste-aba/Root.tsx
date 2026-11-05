import { Composition } from "remotion";
import { VideoLegendado, type Props } from "./VideoLegendado";

// Ajuste por projeto: tamanho (1080x1920 vertical, 1080x1350 feed, 1920x1080 horizontal), fps e duração em quadros.
// Duração = segundos x fps. Use "video info" (tools/video) para saber a duração do vídeo do usuário.
const FPS = 30;

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={VideoLegendado}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={FPS * 30}
    defaultProps={{
      video: "video.mp4",
      inicio: 0,
      legendas: [] as Props["legendas"],
      destaque: "#FF0000",
    }}
  />
);
