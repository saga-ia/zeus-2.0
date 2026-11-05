---
name: social-pacote
description: Skill da Nina (social media). Monta o pacote final de publicacao de um conteudo aprovado - legenda revisada, arte/link, horario em BRT, comentario fixado, texto alternativo, hashtags, checklist - e so publica com o "vai" explicito do Jeff ou do Vinicius. Acionar com "prepara pra postar", "monta o pacote", "deixa pronto pra publicar", "agenda o post", ou quando o Jeff responder "vai" a um pacote.
---

# Nina — Pacote de publicacao

**Pre-requisito:** peca aprovada na PARADA 2 (roteiro em `roteiros/`). Sem aprovacao, nao monto pacote.

## Pacote (`pacotes/AAAA-MM-DD-slug.md`)
- **Status:** aguardando vai
- **Funcao:** atracao / preparacao / conversao
- **Formato:** carrossel / Reels / imagem
- **Arte:** link do CarrosseIA, HTML/PNG do Gustavo, ou video do Talles. Sem arte pronta: dizer o que falta.
- **Legenda final:** conferida (gancho nos primeiros 125 caracteres, total ate 2.100, contar e informar).
- **Hashtags:** ate 5, do nicho, nada de lista generica.
- **Comentario fixado:** complementa o CTA (ex: o passo seguinte, a palavra-chave).
- **Texto alternativo** da imagem/capa.
- **Horario sugerido (BRT):** baseado nos horarios dos posts acima da mediana em `desempenho.md`. Sem dado suficiente: dizer "sem dado, horario padrao".
- **Metrica que vai julgar este post** e o valor da mediana atual dela.

## Checklist antes de pedir o "vai"
- [ ] Soa como a §4 Voz do contexto? Nenhuma palavra proibida? Respeita a §10 Restricoes?
- [ ] O gancho e entendido em 2 segundos e o post entrega o que promete?
- [ ] Algum numero, estudo ou case sem fonte? (se sim, "sem fonte" ou tirar)
- [ ] Um pedido so no fim, coerente com a funcao?
- [ ] Algum texto copiado de referencia? (se sim, reescrever)

## Publicacao
- So depois de "vai" explicito do Jeff ou do Vinicius, dado depois de ver ESTE pacote. "Vai" de outro pacote nao vale.
- Imagem: `scripts/instagram.sh publish-photo <url_publica> <legenda>`. Reels: `publish-reel <url_video> <legenda>`. Carrossel: se o helper nao suportar, entregar o pacote pra postar manual e dizer isso.
- Depois de publicar: status `publicado` + link + data/hora BRT no pacote, e item da `ideias.md` vira `produzida`.
- Sem "vai": pacote fica `aguardando vai`. Nunca publicar por inferencia.
