# Etapa 6: motion-render

Constrói cada animação aprovada no plano e renderiza. É a etapa mais longa e a que mais depende do ofício.

Leia antes: `oficio-motion.md`, `hyperframes.md` (ou o guia da ferramenta escolhida) e o perfil (identidade visual, estilo de motion, peças-base, se houver).

## Ciclo
1. **Por item do plano:** conceito, storyboard, texto da tela, formato, palavras-gatilho, intenção da câmera.
2. **Tempo:** o tempo 0 da animação é o início dela na sequência; cada gatilho entra em `tempo_da_palavra − início`.
3. **Construir:**
   - **Storyboard:** quando houver, é a especificação aprovada. O que não der para fazer como descrito vai explicado no resumo.
   - **Tela cheia:** cena completa, com o fundo e a câmera virtual que o perfil pede (aproximação e deriva sempre em paralelo), chegada já em movimento e saída própria.
   - **Sobreposição:** fundo transparente, só os elementos. Na lateral, os elementos ficam do lado oposto ao rosto.
   - **Saída marcada com a direção** ("para cima", "lateral esquerda"): a câmera usa isso para chegar na mesma direção depois do corte.
   - **Eventos para o som** anotados na construção (ver `hyperframes.md`).
4. **Conferir:** check, snapshots dos momentos-chave, olhar.
5. **Renderizar** em fila, em segundo plano, com versão no nome.
6. **Conferir o arquivo:** resolução, taxa, número de frames igual à duração do item, transparência na sobreposição, um ou dois quadros, a última letra de toda palavra com gradiente.
7. **Registrar** no estado do vídeo: arquivo, versão, trilha e eventos. Um script confere tudo isso e recusa o que não bater.
8. **Entregar** conforme `entrega-no-editor.md`: o corte aprovado + as telas cheias numa trilha + as sobreposições em outra, cada render no seu tempo, escala 100%. Marcadores de pós ("desfoque do fundo aqui") e de asset faltando.

## Por trecho
A pessoa pode pedir um trecho ("renders até 3:00", "do mo08 ao mo15", "o gancho"). Construa só os itens que **começam** nele. A entrega sai com tudo o que já foi renderizado.

## Revisão
- Por número: "mo04 mais lento", "mo07 tira". Ajuste só os citados, renderize uma versão nova e gere a próxima entrega.
- **Feedback de qualidade geral** ("básico", "amador", "sem vida") pede **refazer** a animação, não retocar. Releia as referências, diga numa frase a nova direção de cada uma e construa de novo.
- Se uma revisão mudar a duração de uma animação, mude no plano e na composição e registre de novo.
- Se a pessoa mexeu direto no projeto da animação, preserve o que ela mudou.

## Aprendizado
Na aprovação, olhe o que deu certo: um padrão que se repetiu vira item do catálogo do perfil; um elemento que ficou bom vira peça-base. É assim que os próximos vídeos partem de um nível mais alto.
