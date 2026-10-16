---
name: site-premium
description: Pipeline do Zeus pra criar ou redesenhar site, landing page, pagina de captura, de vendas ou de obrigado SEM cara de IA/template - briefing, direcao de arte aprovada antes do codigo, build em HTML puro com piso de qualidade, verificacao visual real (scripts/site-check.js tira print desktop+celular e aponta sinais de IA), revisao de conversao (CRO) e deploy no subdominio. Acionar com "cria um site", "faz uma landing", "pagina de vendas", "pagina de captura", "melhora esse site", "redesenha", "ta com cara de template", "ta feio", ou qualquer pedido de pagina web.
---

# Site premium (Zeus)

Problema que esta skill resolve: o modelo escreve a media da internet e nunca olha o que fez. Resultado: Inter, gradiente roxo, 3 cards iguais, rotulo em caixa alta em cima de todo titulo, painel falso feito de div. Aqui o site so sai depois de **decidir** a direcao, **construir** com piso de qualidade e **olhar** o print.

**Exceção: site ou página do próprio ZEUS** (produto, Central, material do ZEUS). Aí a identidade é a oficial do produto e não se inventa direção de arte: siga `/opt/jeff-worker/docs/design-system-zeus.md` (roxo `#673DE6`, Space Grotesk + DM Sans, cards brancos, logo do raio). As proibições desta skill (gradiente roxo, Inter etc.) valem para site de cliente, não para o ZEUS.

Página de UMA tela pro celular (link da bio estilo Linktree, quiz/diagnóstico pra call): skill `minisite` (Eduardo), não esta.

Infra (DNS, NPM, pastas, deploy): `/opt/jeff-worker/docs/criar-site-jeff.md`. Esta skill cuida do que vai dentro.

## Skills de apoio (ler na hora certa, nao tudo de uma vez)
| Quando | Ler |
|---|---|
| Fase 1, antes de propor a direcao | `/root/.claude/skills/frontend-design/SKILL.md` (inteira, curta) e da Taste so estes trechos (o arquivo tem 1.200 linhas): `sed -n '13,81p;165,261p;595,704p' /root/.claude/skills/design-taste-frontend/SKILL.md` (leitura, dials, tipografia/cor/layout, sinais de IA) |
| Fase 2, antes de escrever CSS | `references/impeccable-craft-floor.md` (piso de qualidade e o que recusar) |
| So se tiver animacao | `/root/.claude/skills/emil-design-eng/SKILL.md` (easing, duracao, quando NAO animar) |
| Fase 4 | `/root/.claude/skills/cro/SKILL.md` |
| Fase 5, polimento | o checklist curto da Fase 5 abaixo. `references/impeccable-*.md` so pra app/painel (estados de loading, vazio, erro); pra landing nao precisa |

A Taste Skill fala em React/Tailwind: traduzir pra HTML/CSS puro, que e o nosso padrao pra landing.

**Conflitos, quem ganha:**
- Taste §4.8 (gerar imagem / usar picsum, "pagina sem imagem e incompleta") **nao se aplica**: sem foto real, compor com tipografia, cor e forma. Imagem falsa e pior que nenhuma.
- Contexto §8 apontando pro "padrao Alpha do Gustavo" vale como **cor de marca** (o azul), nao como fonte, efeito glow ou fundo #05070B. A direcao da pagina sai desta skill.
- Briefing explicito do cliente ganha de tudo, inclusive das proibicoes abaixo.

## Fase 0 — Ack e briefing (uma mensagem so)
WhatsApp: mandar ack com ETA antes ("vou montar a direcao visual e te mando em ~5 min pra aprovar").

Se a marca tem `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md`, ler primeiro (publico §2, tese §3, voz §4, oferta §6, provas §7, visual §8, restricoes §10) e so perguntar o que faltar. Perguntar numa mensagem so:
1. O que e o negocio e **qual acao unica** a pagina precisa gerar (comprar, agendar, WhatsApp, inscrever).
2. Quem vai acessar (e de onde vem: anuncio, bio do Insta, indicacao).
3. **Um site de referencia que admira** (a pergunta que mais economiza tempo) e tom em 1-3 palavras.
4. Conteudo real: textos, logo, **fotos reais**, provas (numeros/depoimentos com nome), preco.
5. Pagina nova ou redesign de uma existente (link).

Se o pedido ja responde, nao perguntar: declarar o que inferiu e seguir.

## Fase 1 — Direcao de arte (PARADA: aprovar antes do codigo)
Ler as skills da Fase 1. Rodar `tail -40 /opt/jeff-sites/_design-log.md` pra ver o que ja foi usado e **nao repetir paleta nem par de fontes dos ultimos sites**.

Montar e mandar pra aprovacao:
- **Leitura:** "Estou lendo isso como: <tipo de pagina> pra <publico>, com linguagem <tom>, puxando pra <familia estetica>."
- **Dials** (Taste): VARIANCE / MOTION / DENSITY com 1 linha de porque. Clinica/institucional/publico mais velho: 3-4 / 2-3 / 3-4. Consultoria/servico premium B2B: 5-6 / 2-4 / 3-4. Lancamento/infoproduto/evento de massa: 6-8 / 4-6 / 3-4. Portfolio/criativo: 8-9 / 6-8 / 2-3.
- **Paleta:** 4 a 6 hex com nome e papel. Neutros com temperatura (nunca #000 / #808080 puros). 1 cor de destaque, usada na pagina inteira.
- **Tipografia:** 1 ou 2 familias do Google Fonts com acentuacao PT-BR, e o porque da escolha pra ESSE assunto. Nunca Inter/Roboto/Poppins/Montserrat/Open Sans/Arial como voz da pagina; nunca Fraunces/Instrument Serif por reflexo. Pool pra comecar (rodar, nao repetir): Bricolage Grotesque, Schibsted Grotesk, Familjen Grotesk, Instrument Sans, Hanken Grotesk, Onest, Geist, Sora, Archivo, Unbounded, Syne; serifas so com motivo: Newsreader, Young Serif, Gloock, Bodoni Moda, Literata.
- **Layout:** wireframe ASCII da primeira dobra + lista das secoes, cada uma com familia de layout diferente.
- **A ousadia:** o UM elemento memoravel da pagina. Todo o resto quieto (conselho da Chanel: tira um acessorio).
- **Auto-revisao:** "se eu recebesse um pedido parecido de outro cliente, chegaria nisso?" Se sim, mudar e dizer o que mudou.

No WhatsApp: mandar curto, em lista, sem travessao. Esperar o ok. Pedido do Jeff com "pode fazer direto" pula a parada (mas a direcao continua sendo escrita no DESIGN.md).

## Fase 2 — Build
Pasta `/opt/jeff-sites/<slug>/` (confirmar com o Jeff antes de sobrescrever site existente; rascunho/teste sem deploy: pasta de trabalho temporaria). `DESIGN.md` fica sempre **ao lado do index.html**, com a direcao aprovada (tokens, fontes, dials, ousadia). Ler o craft-floor.

**Piso (sempre):**
- HTML semantico, 1 H1, `lang="pt-BR"`, title, meta description, og:image, favicon, viewport.
- og:image sem foto: `site-check.js ... --og /opt/jeff-sites/<slug>/og.png` salva a primeira dobra em 1200x630. Favicon sem logo: SVG inline (data URI) com a inicial na fonte e cor da pagina.
- Titulo display com acento (Ã, É, Ç): entrelinha minima ~1.0 e nada de `overflow:hidden` cortando o acento em animacao de mascara.
- Tokens em `:root` (cores, espacos, raios, fontes). Uma escala de raio pra pagina inteira.
- Fonte via Google Fonts com `preconnect` + `display=swap`; **conferir que carrega** (o site-check acusa fonte declarada e nao carregada).
- Contraste AA (4.5:1 texto, 3:1 texto grande). Texto secundario em fundo colorido puxa do matiz, nunca cinza.
- Mobile-first, `clamp()`, sem rolagem horizontal em 390px, alvos de toque >= 44px.
- `:focus-visible` com estilo, `::selection` na paleta, `prefers-reduced-motion` respeitado.
- Movimento: um momento orquestrado (ex: entrada do hero), nao fade-up em toda secao. Easing ease-out, sem quique.
- Imagens com `alt`, `width/height`, `loading="lazy"` abaixo da dobra.
- Hero cabe na primeira dobra: titulo ate 2 linhas no desktop, subtitulo ate ~20 palavras, CTA visivel sem rolar.

**Recusar (salvo se o briefing pedir explicitamente):**
- Grade de 3 cards iguais (icone + titulo + texto) como estrutura; card dentro de card.
- Rotulo caixa-alta com tracking em cima de cada titulo (max 1 a cada 3 secoes; ideal nenhum). Numeracao 01/02/03 que nao e sequencia.
- Uma palavra do titulo em outra cor/italico como "efeito".
- Gradiente roxo/azul, texto com gradiente, glow neon, vidro/blur decorativo, borda lateral colorida em card.
- **Painel/dashboard/print falso feito de div.** Sem print real, nao tem print.
- Numero bonito sem fonte ("94/100", "+300%", "10.000 clientes"). Prova so da §7 do contexto ou do que o cliente mandou.
- Nome/depoimento inventado, "Joao Silva", foto de banco que nao e do cliente fingindo ser.
- Seta "→" no fim de todo botao; " · " como separador de tudo; ponto colorido de status decorativo.
- Fundo creme + serifa + terracota; preto + verde-acido; kit SaaS de cards arredondados com a mesma sombra (os 3 "uniformes" de pagina de IA).
- Travessao (— ou –) em qualquer texto. Palavras: incrivel, revolucionario, alavancar, potencializar, transformador, eleve, jornada, proximo nivel.
- Dois CTAs com a mesma intencao e rotulos diferentes ("Fale conosco" + "Entre em contato"): um rotulo por intencao.

**Sem foto real:** compor com tipografia, cor, forma e espaco. Pedir as fotos. Nunca link quebrado de banco de imagem.

**Copy:** do ponto de vista de quem visita, verbo ativo, botao diz o que acontece ("Quero minha vaga", nao "Enviar"). Voz da §4 do contexto quando houver.

## Fase 3 — Olhar (obrigatorio, no maximo 2 rodadas)
```bash
node /opt/jeff-worker/scripts/site-check.js /opt/jeff-sites/<slug>/index.html /tmp/site-check/<slug>
```
1. Ler o resumo: **bloqueantes** precisam zerar; avisos se corrige ou se justifica.
2. **Abrir com Read** os recortes tela a tela `desktop-01.png`, `desktop-02.png`... e `mobile-01.png`... (o `-full.png` inteiro chega minusculo, nao serve pra avaliar). Olhar de verdade: hierarquia (o que o olho ve primeiro?), respiro, ritmo entre secoes, alinhamentos, o que parece template, se a ousadia aparece.
3. Corrigir tudo num lote. Rodar de novo uma vez pra confirmar. Parar (polimento sem fim queima tempo e o timeout de 10 min do WhatsApp).

## Fase 4 — Conversao (checklist do `cro`)
Em 5 segundos da pra entender o que e e pra quem? CTA unico e visivel? Prova perto do CTA? Objecoes respondidas (preco, "serve pra mim?", risco)? Friccao (campos demais, links que tiram da pagina)? Corrigir o que for barato; o resto vira sugestao na entrega.

## Fase 5 — Polimento e deploy
- Checklist curto de landing: (1) hover e foco visiveis em todo botao/link; (2) mesmo raio e mesma sombra em tudo; (3) espaco maior acima do titulo que abaixo; (4) ritmo entre secoes consistente; (5) nenhum placeholder, "lorem", [colchete] ou numero sem fonte; (6) link do CTA testado (wa.me com numero certo e texto pre-preenchido se fizer sentido); (7) celular: CTA alcancavel com o polegar (avaliar barra fixa de WhatsApp no rodape); (8) title, description e og:image preenchidos; (9) peso da pagina leve (imagem otimizada, 1-2 familias de fonte); (10) rodape com nome, contato e ano.
- Deploy conforme `docs/criar-site-jeff.md` (DNS proxied=false, NPM com SSL). `curl -sI https://<slug>.jefersonhenrike.com` = 200.
- Rodar `site-check.js` na URL publica (pega fonte/asset que so quebra no ar).
- Registrar no log: `echo "| $(date +%F) | <slug> | <paleta hex> | <fontes> | <dials> | <ousadia> |" >> /opt/jeff-sites/_design-log.md`

## Revisao do Tome (antes de mandar pro Jeff/cliente)
Chamar o agente `tome-revisor` com: URL publica, briefing literal e caminho do DESIGN.md. Ele roda o site-check, le os prints, testa links/menu/CTA e devolve APROVADO ou PRECISA DE AJUSTE. Ajustar e pedir 1 re-teste; no maximo 2 rodadas.

## Entrega
- Link + o print `mobile.png` (WhatsApp: `scripts/wapi.sh POST /send-media` com base64, mimetype image/png).
- 3 linhas: a direcao escolhida, a ousadia, e o que ainda depende do cliente (fotos, depoimentos, preco).
- Sugestoes de conversao que nao foram aplicadas (comuns: depoimento com nome perto do CTA, resposta pra objecao de risco "e se nao servir pra mim?", barra fixa de WhatsApp no celular).
- O que foi **inferido** do contexto e nao confirmado pelo cliente (frases, listas "e pra voce / nao e pra voce"): listar pra ele validar.

## Redesign
1. `site-check.js` no site atual + ler os prints: entregar diagnostico curto (o que denuncia template, o que funciona).
2. Preservar conteudo verdadeiro, marca e funcao. Copy factual so muda com ok.
3. Redesign substitui o visual inteiro (nao "polir o visual descartado"). Refinamento mantem identidade e so corrige.
4. Seguir Fase 1 em diante.

Creditos: regras derivadas de frontend-design (Anthropic), Taste Skill (Leonxlnx, MIT), Emil Kowalski skills (MIT), Impeccable (Paul Bakaus, Apache 2.0, ver `references/IMPECCABLE-LICENSE`) e marketingskills/cro (Corey Haines, MIT).
