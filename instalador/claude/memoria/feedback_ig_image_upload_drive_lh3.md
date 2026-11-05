---
name: Como postar imagem no Instagram via API — usar Drive lh3.googleusercontent.com
description: Meta Graph API rejeita download de imagens do nosso domínio (agente.propostaebcmkt2026.shop) com erro 9004. Solução: subir no Drive público e usar a URL CDN lh3.googleusercontent.com/d/<file_id>=w1080.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Problema descoberto em 2026-04-26**: Meta Graph API ao criar media container pra Insta retorna erro genérico "Only photo or video can be accepted as media type" quando o `image_url` aponta pro nosso domínio (`agente.propostaebcmkt2026.shop/public/...`). Tentei várias variações de headers (CRP cross-origin, ACAO *, sem CSP, sem X-Frame), sempre o mesmo erro 9004/2207052. Wikipedia URL funciona. Conclusão: ou nosso TLS não passa no validador deles, ou nosso domínio tá em alguma lista do Meta, ou nosso IP. Não vale a pena debugar — workaround é limpo.

**Solução adotada**:
1. Renderizar imagem com puppeteer (HTML→JPEG 1080x1080, salva em `/tmp/quote_card.jpg` ou similar).
2. Upload no Drive da conta default (Jeff) via Drive API (multipart upload, mimeType image/jpeg).
3. Tornar o file público: `POST /files/<id>/permissions` com `{"role":"reader","type":"anyone"}`.
4. Usar a URL CDN: `https://lh3.googleusercontent.com/d/<FILE_ID>=w1080` — Meta aceita sem problema, com Access-Control-Allow-Origin *, sem confirmação HTML.
5. POST `/v19.0/{ig_account}/media` com `image_url` + caption → `creation_id`.
6. POST `/v19.0/{ig_account}/media_publish` com `creation_id` → `id` do post.
7. GET `/v19.0/{post_id}?fields=permalink` pra ter URL final estilo `https://www.instagram.com/p/DXl_x3-kqDr/`.

**Caso teste (primeiro post via API 2026-04-26):**
- Frase: "Você não tem problema de dinheiro. Você tem problema de identidade. Resolve uma, a outra obedece."
- post_id: 18403560919148215
- permalink: https://www.instagram.com/p/DXl_x3-kqDr/

**Pra reusar na automação**:
- Pasta default no Drive: criar `/Posts Instagram/<YYYY>/<MM>/` para organizar
- Nome do arquivo: `<YYYY-MM-DD>-<slug>.jpg`
- Cada upload é file novo (não overwrite) — pode acumular, deletar mensalmente.

**Não confundir com**:
- `https://drive.google.com/uc?export=download&id=<id>` retorna HTML de confirmação se file >25MB, e Meta tropeça.
- `https://drive.google.com/file/d/<id>/view` é página HTML, não direct image.
- `https://lh3.googleusercontent.com/d/<id>=w1080` é o único caminho CDN puro confirmado.
