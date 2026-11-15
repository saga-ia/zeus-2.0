# Princípios do fluxo

Os bons costumes que fazem um fluxo de edição com o Claude funcionar vídeo após vídeo. Valem para qualquer tipo de vídeo e qualquer programa. Escreva-os nas regras comuns e nas skills da pessoa.

## 1. Uma skill por etapa, uma etapa por vez
- Uma skill que tenta fazer tudo de uma vez entrega um vídeo médio. Etapas pequenas, cada uma com um trabalho só, entregam muito mais.
- Cada etapa parte da anterior **travada** (aprovada). Se algo aprovado mudar depois (um corte muda depois das animações), a etapa avisa o que precisa ser refeito, em vez de seguir com um plano velho.
- Nada de encadear etapas sozinho. A pessoa aprova uma e diz "sim" para a próxima.

## 2. Planejar inteiro, executar por partes
- O que pede visão do todo (cortes, plano das animações) olha o vídeo inteiro: história, variedade, ritmo do começo ao fim.
- O que é pesado de executar (render, câmera, som) pode ir **por trecho**, escolhido pela pessoa na hora: "render até 3:00", "o hook", "o resto". Um item pertence ao trecho em que começa.
- Cada trecho lê o que os anteriores já fizeram, para não repetir a mesma fórmula.

## 3. A memória fica nos arquivos, não na conversa
- Cada vídeo tem uma pasta de trabalho do Claude (ex.: `_CLAUDE/`) com um **arquivo de estado** (ex.: `projeto.json`): o que cada etapa decidiu, o status de cada uma e as pendências.
- Por isso dá para limpar o chat (`/clear`) entre as etapas sem perder nada. A skill central lê o estado e diz onde o vídeo parou.
- O arquivo de estado cresce muito. Um script pequeno lê e muda só o pedaço que cada etapa precisa (ex.: `ver.py <pasta> status`, `ver.py <pasta> cortes`). Ler o arquivo inteiro a cada passo gasta limite à toa.

## 4. O Claude decide, os scripts calculam
- O Claude decide sobre o **texto**: qual take, onde entra uma animação, qual som. Ele lê a transcrição por frase, não por palavra.
- Os **scripts** fazem as contas: tempo por palavra, frames, bordas de corte, keyframes, níveis de áudio e o arquivo para o programa de edição. Script erra menos que conta feita à mão e gasta menos limite.
- Um script escrito para um vídeo fica guardado na pasta de ferramentas e é reaproveitado nos próximos.

## 5. Ponto salvo, pendência e `/clear`
- **Ponto salvo:** a etapa (ou o trecho) terminou, as revisões foram aplicadas e o arquivo de entrega foi gerado. Só aí a skill sugere `/clear` e a skill central.
- **Pendência:** algo que a pessoa pediu e ainda não foi aplicado fica anotado no estado e aparece no status até ser resolvido.
- Nunca sugerir `/clear` com uma revisão que não foi aplicada nem anotada.

## 6. O caderno de aprendizados
- Durante a revisão, toda correção, elogio ou preferência que vale **para outros vídeos** vira uma linha num caderno na pasta do vídeo: `- [ ] <etapa> · <o que foi pedido> · <data>`.
- Ajuste só de conteúdo daquele vídeo ("tira essa frase") não entra. Na dúvida, entra com "(talvez só deste vídeo)".
- Anotar não é mudar. As skills só mudam quando a pessoa pede ("aplica os aprendizados"): o Claude propõe onde cada linha entra, ela filtra, ele grava e marca (`[x] → onde entrou`, ou `[-]` se era só daquele vídeo).
- É isso que faz cada vídeo sair melhor que o anterior.

## 7. Gosto separado do ofício
- **Ofício** (vale para qualquer vídeo: como escolher um take, como uma curva de animação fica fluida, como alinhar um som) vai nas skills.
- **Gosto** (o da pessoa: cores, fontes, quanto zoom, quanta animação, que tipo de som) vai no **perfil**, numa pasta própria. As skills só apontam para o perfil.
- Assim a pessoa pode ter mais de um estilo (um canal, um cliente) sem copiar o fluxo: é um perfil novo.

## 8. Tendência, não regra
- Nas decisões criativas, o que está nas skills e no perfil é ponto de partida. Regra absoluta faz todo vídeo sair igual.
- Regras técnicas (sincronia, nível de áudio, formato do arquivo) podem ser firmes.

## 9. Segurança
- Nunca mover, renomear ou apagar os arquivos do projeto da pessoa. Tudo o que o Claude gera fica na pasta de trabalho dele.
- Nunca sobrescrever um arquivo já entregue (XML, render): sempre uma versão nova (`_v02`, `_v03`).
- Apagar, quando precisar, é mover para uma pasta de espera e deixar a pessoa apagar depois. Mandar para a lixeira por script pode apagar de vez sem avisar.
- Mudança no próprio fluxo (skills, scripts, perfil): com o "sim" da pessoa, e de preferência com um histórico de versões (git local) para poder voltar.

## 10. Conferir antes de confiar
- Todo formato de entrega novo começa por um **arquivo de teste curto** que a pessoa abre no programa dela e confere. Só depois de ela confirmar, o fluxo usa aquilo de verdade.
- Quando não souber como o programa representa algo, peça à pessoa para exportar um exemplo do próprio programa e copie o formato, em vez de chutar.
- Depois de mexer em scripts que já funcionam, compare o resultado novo com o de antes num vídeo de teste congelado (um "teste de regressão"). Mudança que ninguém pediu é bug.

## 11. Economia de limite
- `/clear` entre as etapas. O histórico longo é reprocessado a cada mensagem.
- Ler resumos e recortes, não arquivos inteiros: a transcrição por frase, o estado pelo script, um frame só quando há dúvida real.
- Render e tarefas longas em segundo plano: esperar não gasta limite.
- Modelo por etapa (sugestão; ajuste ao plano da pessoa):

| Etapa | Modelo | Esforço | Por quê |
|---|---|---|---|
| skill central, iniciar, assets | o mais leve que funcione bem | baixo | Organizar e encaminhar |
| preparar | intermediário | médio | Quase tudo é script |
| cortes, motion-mapa, motion-render, câmera | o mais capaz | alto | Erro aqui custa uma rodada inteira de revisão |
| sfx, aplicar aprendizados | o mais capaz | médio | Gosto dentro de regras claras |

- Trocar de modelo logo depois do `/clear` não custa nada. No meio de uma conversa longa, a troca reprocessa tudo.
