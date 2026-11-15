import type { Props } from "../../lib/edicao";

// Camadas exclusivas deste vídeo, desenhadas por cima de tudo (vídeo, legenda, impactos).
// Só use quando o props.json não resolver. Tudo em função de useCurrentFrame(): nada de CSS transition,
// setTimeout ou estado guardado entre quadros. Exemplo de uso: selo, lower third com nome, contador.
export const Extras: React.FC<Props> = () => null;
