---
name: minisite
description: Skill do Eduardo (minisites). Cria minisite de uma pagina pro celular - (1) LINKS estilo Linktree da propria marca (foto, bio, redes, 4 a 7 botoes, o principal primeiro) e (2) DIAGNOSTICO pra call (capa com promessa, 3 a 5 perguntas de 1 em 1 com progresso, contato, resultado personalizado por pontos e botao que leva ao WhatsApp com as respostas escritas, webhook opcional). Parte dos modelos testados em projetos/minisites/_modelos, passa pelo minisite-check.js (percorre o fluxo e tira print de cada tela) e pelo site-check.js, e publica em <slug>.jefersonhenrike.com so com ok. Acionar com "minisite", "linktree", "link da bio", "pagina de links", "diagnostico", "quiz", "pagina de qualificacao", "funil pra call", "Eduardo".
---

# Minisite (Eduardo)

Minisite = **uma página, feita pro celular, com uma ação principal**. Não é landing page longa (essa é a skill `site-premium`).

| Tipo | Quando | Modelo | Exemplo de referência |
|---|---|---|---|
| **Links** | link da bio do Instagram, cartão digital, QR code de evento | `/opt/jeff-worker/projetos/minisites/_modelos/links/` | linktr.ee/pulsemediavision: foto grande que dissolve no fundo, nome, bio, ícones das redes, botões empilhados |
| **Diagnóstico** | qualificar lead e levar pra call/WhatsApp; anúncio que manda pra "faça seu diagnóstico" | `/opt/jeff-worker/projetos/minisites/_modelos/diagnostico/` | setup.omatheusdaia.com.br/comece: capa com título em 2 cores + card com promessa e botão, "1 de 3", perguntas com opções prontas e texto livre, resultado personalizado e CTA de oferta |

## 1. Briefing (UMA mensagem, só o que faltar)
Leia antes `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md` se existir (público §2, voz §4, oferta §6, provas §7, visual §8).
- **Links:** nome que aparece, 1 frase de bio (o que faz + pra quem), **foto real** (vertical, rosto no terço de cima, fundo neutro ou escuro), redes que existem (com @), os botões em ordem de importância (texto + destino), qual é o PRINCIPAL, cores/logo da marca.
- **Diagnóstico:** o que a call vende e pra quem; 3 a 5 perguntas (ou eu proponho a partir da oferta); o que define lead bom (vira pontos); os 2 ou 3 resultados possíveis com os próximos passos; **WhatsApp que recebe** (com DDD) ou link de agenda; webhook (se tiver CRM/n8n); provas reais pra capa (números com fonte).
- Os dois: **slug** do subdomínio (`<slug>.jefersonhenrike.com`).
Sem dado real, não invento: número de prova, depoimento e preço só com fonte. Falta foto: pergunto, nunca uso banco de imagem nem rosto gerado por IA.

## 2. Montar
1. `mkdir -p /opt/jeff-sites/<slug>` (se já existir, **confirmar com o Jeff antes de sobrescrever**) e copie o modelo: `cp -r /opt/jeff-worker/projetos/minisites/_modelos/<links|diagnostico>/. /opt/jeff-sites/<slug>/`.
2. **Links:** troque tudo marcado com ✎ (título, description, og, nome, selo, bio, redes, botões, rodapé) e a `foto.jpg` (até 1000 px de largura, ~150 KB). 4 a 7 botões; o principal com `class="principal"`; cada `<a>` com `data-link="<apelido>"` (vira utm_content pra medir clique). Ícones extras estão num comentário dentro do arquivo.
3. **Diagnóstico:** edite só o bloco `<script type="application/json" id="config">`: `capa`, `perguntas` (opções com `pontos` e `tag` opcional; `"tipo":"texto"` pra resposta livre), `contato`, `resultados` (`min` = pontos mínimos, do menor pro maior), `tagsTexto`, `cta.whatsapp` (55 + DDD + número, só dígitos), `cta.mensagem`, `webhook` (https ou vazio). Pontuação: some o máximo possível e distribua os `min` pra cada resultado ter chance real.
4. **Identidade:** cores e fontes em `:root`. Marca com Brand Kit: `/opt/jeff-apps/jeff-central/tools/marca ver <marca>`. Não repetir a paleta/fonte dos últimos sites (`tail -20 /opt/jeff-sites/_design-log.md`); proibido Inter/Roboto/Poppins/Montserrat/Arial como voz, gradiente roxo, travessão no texto.
5. Copy curta: título até 8 palavras, bio até 15, botão com verbo concreto ("Agendar minha call", não "Clique aqui"). Pra copy de venda mais forte, chame o Ícaro (`/root/.claude/agents/icaro-copywriter.md`).

## 3. Revisar (obrigatório, nesta ordem)
1. `node /opt/jeff-worker/scripts/minisite-check.js /opt/jeff-sites/<slug>/index.html /tmp/minisite-check/<slug>`: percorre o diagnóstico como visitante (ou confere todos os links), tira print de **cada tela** no celular, reprova rolagem lateral, texto de exemplo esquecido (✎, XXXX), link vazio, WhatsApp sem número, mensagem do WhatsApp sem as respostas. Tem que dar **OK**.
2. `node /opt/jeff-worker/scripts/site-check.js /opt/jeff-sites/<slug>/index.html /tmp/site-check/<slug> --og /opt/jeff-sites/<slug>/og.png` (gera a prévia do link e aponta contraste, fonte, link quebrado). Zero bloqueante.
3. **Abrir os prints com Read** e olhar: a foto está boa? o principal salta aos olhos? cada tela do diagnóstico cabe sem rolar muito? o resultado faz sentido com as respostas?
4. Mostrar ao usuário 2 a 4 prints (links: a página; diagnóstico: capa, 1 pergunta, resultado) e pedir ok **antes de publicar**.

## 4. Publicar (só com ok do Jeff ou do Vinicius)
```bash
/opt/jeff-worker/scripts/cloudflare.sh add jefersonhenrike.com <slug> 80.241.214.10   # DNS proxied=false
/opt/jeff-worker/scripts/npm.sh add-static <slug>                                     # proxy + SSL
curl -sI https://<slug>.jefersonhenrike.com | head -1                                 # tem que ser 200
node /opt/jeff-worker/scripts/minisite-check.js https://<slug>.jefersonhenrike.com /tmp/minisite-check/<slug>-pub
echo "| $(date +%F) | <slug> | <paleta hex> | <fontes> | minisite <links|diagnostico> | <ousadia> |" >> /opt/jeff-sites/_design-log.md
```
Nunca mexer no apex `jefersonhenrike.com`, `www` nem MX. Domínio do cliente: só com o Jeff (DNS dele).

## 5. Entregar
URL + QR code se pedirem (`qrencode -o /opt/jeff-sites/<slug>/qr.png https://<slug>.jefersonhenrike.com` se existir, senão `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=<url>`), como medir (cliques chegam com `utm_source=minisite&utm_content=<apelido>` no destino; lead do diagnóstico chega no WhatsApp com as respostas) e o que trocar quando mudar oferta. Feche com o cartão de passagem (`/opt/jeff-worker/docs/cartao-passagem.md`).
