# Etapa 5: assets

Busca os arquivos reais que as animações precisam e que não dá para desenhar em código. Pula sozinha se nada faltar, e funciona avulsa ("busca o logo do Notion").

## O que é de quem
| Precisa de… | Quem resolve |
|---|---|
| Logo de marca ou ferramenta, ícone, print de página pública | esta etapa |
| Boneco, forma, cena montada, diagrama | o render, desenhando no código |
| Tela logada, gravação pessoal, foto da pessoa | a pessoa: só lembrar |
| Foto ou vídeo de banco | depende de ter uma fonte com licença; senão, a pessoa manda |

## Fontes que funcionam bem
- **Logo:** primeiro uma biblioteca local (os logos que já foram usados), depois fontes de logos oficiais em SVG e o Iconify (coleções como `logos` e `devicon`).
- **Ícone:** Iconify, com uma opção de cada coleção para dar variedade (Lucide, Phosphor, Tabler…). Vêm em SVG de uma cor, e o render recolore.
- **Print de site:** navegador sem interface (headless), na resolução do vídeo, com a página como ela abre.

Pesquise as fontes atuais e as licenças antes de escrever o script de busca.

## Como mostrar
- **Uma folha de contato numerada por rodada** (uma imagem só, com as opções lado a lado sobre o fundo do vídeo), nunca as opções soltas.
- Antes de mostrar, descarte o que está claramente errado: marca errada (a empresa-mãe no lugar do produto), logo antigo, print com banner de cookies ou página não carregada.
- A recomendação é a opção 1 de cada asset. A pessoa confere ou troca, respondendo por número ("a1 1, a3 2, a4 eu mando").
- Grave com a extensão da opção (SVG no lugar do PNG esperado é melhor) e atualize o plano.
- Pergunte quais vão para a biblioteca fixa (logos que voltam em outros vídeos).

## Licenças
- **Logos** são marcas registradas: usar a marca oficial, sem redesenhar nem distorcer, para falar da ferramenta. Se não achar a oficial, fica faltando; nunca um "parecido".
- **Ícones** de coleções abertas (MIT, ISC, Apache, CC BY). CC BY pede crédito: anote num arquivo de créditos para a descrição do vídeo.
- **Print de site:** página pública, para comentar o produto. Nada de tela logada ou de conta de terceiros.
- Imagem achada na web sem licença clara não entra: vira "a pessoa manda".

## Resumo
O que entrou (arquivo, fonte, licença), o que ficou faltando e o que **a pessoa** precisa gravar ou mandar, com o nome de arquivo esperado. O render constrói com um marcador visível no lugar do que ainda faltar.
