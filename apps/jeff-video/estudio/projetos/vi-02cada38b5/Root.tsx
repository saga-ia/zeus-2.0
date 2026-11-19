import { Composition } from "remotion";
import { Edicao, metadados, type Props } from "../../lib/edicao";
import { Extras } from "./Extras";

// Não mexa aqui: formato, fps e duração saem do props.json (formato "9:16" | "4:5" | "1:1" | "16:9").
// Visual e tempo: props.json. Algo único deste vídeo: Extras.tsx.
const Video: React.FC<Props> = (p) => (
  <Edicao {...p}>
    <Extras {...p} />
  </Edicao>
);

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{ clipes: [] } as Props}
    calculateMetadata={({ props }) => metadados(props)}
  />
);
