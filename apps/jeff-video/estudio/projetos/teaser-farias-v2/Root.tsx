import { Composition } from "remotion";
import { VideoLegendado, type Props } from "./VideoLegendado";

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
      destaque: "#1757FF",
      clipes: [] as Props["clipes"],
      duracao: 10,
    }}
  />
);
