# Handoff: Zeus Central — novo visual "Roxo + magenta"

## Visão geral
Novo padrão visual da Central do ZEUS (apps/jeff-central). Cobre o layout geral (menu lateral flutuante, cabeçalho de página com abas, barra inferior no mobile, busca ⌘K) e as páginas: Início, Jarvis (voz), Rotinas, Agentes (catálogo + time), Gestão Inteligente, Atividades, Ferramentas, Biblioteca, Conectores e Configurações.

## Sobre os arquivos
Os arquivos desta pasta são **referências de design feitas em HTML**: protótipos que mostram aparência e comportamento. **Não são código de produção para copiar.** A tarefa é **recriar este visual dentro do código atual da Central** (apps/jeff-central/public: index.html, app.js, rotinas.js, jarvis…), usando os padrões que já existem lá (renderers, CSS do app, ícones em design-system/03-ativos).

- `Zeus Central - Padrao.html`: protótipo completo em um único arquivo. Abra no navegador. A paleta padrão é "Roxo + magenta"; o seletor no rodapé troca paletas (só referência, implementar apenas magenta). O seletor Desktop/Mobile no rodapé mostra o layout mobile.
- `Zeus Central - Nova.dc.html`: fonte do protótipo. Os valores exatos (cores, degradês, raios, sombras) estão no estilo inline de cada elemento e nos objetos `THEMES.magenta`, `SECTIONS`, `CATALOG`, `MODELOS` no fim do arquivo.

## Fidelidade
**Alta fidelidade.** Cores, tipografia, espaçamentos, raios, sombras e animações são finais. Dados (números, nomes de campanhas, posts) são de exemplo.

## Design tokens — paleta Roxo + magenta

### Cores base
- Primária (roxo): #673DE6 · hover/forte #5429C9 · profundo #4B26C2 · noite #230C3F / #3F1690 / #5B2BD6
- Magenta: #BE185D · rosa #EC4899 · rosa claro #F9A8D4
- Texto: #17171A (principal) · #3C3C44 (corpo) · #66666F (secundário)
- Bordas: #E6E6EA · #DADADF · borda lilás rgba(103,61,230,0.16–0.18)
- Lilás de apoio (fundos de chip/KPI): #F0ECFD
- Sucesso/verde-petróleo: #0F7A68 · alerta: #EDA100 · erro: #C0341C

### Cor por seção do menu (texto / fundo do ícone)
- Operar: #673DE6 / rgba(103,61,230,0.10)
- Canais: #BE185D / rgba(190,24,93,0.09)
- Organizar: #7C3AED / rgba(124,58,237,0.10)
- Contexto: #0F7A68 / rgba(15,122,104,0.10)

### Superfícies (variáveis CSS sugeridas)
```css
--z-sb:   radial-gradient(circle at 0% 100%, rgba(236,72,153,0.38), transparent 55%),
          radial-gradient(circle at 100% 0%, rgba(139,108,240,0.38), transparent 50%),
          linear-gradient(180deg,#230C3F 0%,#3F1690 55%,#5B2BD6 100%);       /* menu lateral e barra inferior mobile */
--z-main: radial-gradient(1100px 650px at 8% -5%, rgba(139,108,240,0.36), transparent 60%),
          radial-gradient(900px 600px at 98% 8%, rgba(236,72,153,0.26), transparent 60%),
          radial-gradient(900px 700px at 75% 105%, rgba(249,168,212,0.32), transparent 60%),
          #F1E8F8;                                                            /* fundo da área de conteúdo (aurora) */
--z-card: linear-gradient(155deg,rgba(255,255,255,0.95) 0%,rgba(252,243,250,0.88) 45%,rgba(242,229,250,0.82) 100%); /* cards "branco tingido" */
--z-jv:   radial-gradient(ellipse at 50% 48%, rgba(255,255,255,0.95) 0%, rgba(252,240,250,0.6) 30%, transparent 60%),
          radial-gradient(700px 500px at 12% 15%, rgba(139,108,240,0.34), transparent 60%),
          radial-gradient(700px 500px at 92% 20%, rgba(236,72,153,0.28), transparent 60%),
          #EFE3F6;                                                            /* fundo do Jarvis */
--z-glow: radial-gradient(circle,rgba(249,168,212,0.55) 0%,rgba(236,72,153,0.28) 38%,transparent 70%); /* halo da esfera */
```
Esfera do Jarvis: degradê de #8B6CF0 → #673DE6 → #BE185D (orbEnd), anel rgba(236,72,153,0.4).

### Faixa (banner) do cabeçalho de cada página, por seção
- Operar: linear-gradient(120deg,#230C3F 0%,#4B26C2 50%,#7C5CF0 100%)
- Canais: linear-gradient(120deg,#230C3F 0%,#7E1D6E 45%,#BE185D 80%,#EC4899 110%)
- Organizar: linear-gradient(120deg,#230C3F 0%,#5B21B6 50%,#8B5CF6 100%)
- Contexto: linear-gradient(120deg,#230C3F 0%,#134E4A 50%,#4B26C2 100%)
- Início/base: linear-gradient(120deg,#230C3F 0%,#4B26C2 50%,#673DE6 100%)

### Tipografia
- Títulos e números: **Space Grotesk** 500/600/700 (títulos de página ~28–32px, cards 15–18px, KPIs 34px, letter-spacing -0.02em)
- Interface e texto: **DM Sans** 400–700, base 14px; rótulos de seção 10.5px, 700, letter-spacing 0.14em, MAIÚSCULAS

### Raios e sombras
- Menu flutuante: raio 18px, sombra 0 18px 44px rgba(52,26,134,0.35)
- Cards: raio 14–16px, borda 1px #E6E6EA; hover: translateY(-2px) + sombra 0 10px 24px rgba(23,23,26,0.07)
- Painéis do Jarvis: raio 20px, faixa superior 4px linear-gradient(90deg,#673DE6,#A43CC4,#D16BE0), sombra 0 24px 60px rgba(23,23,26,0.14)
- Barra inferior mobile: raio 26px, sombra 0 16px 36px rgba(52,26,134,0.42)
- Botões/ícones: raio 8–11px; chips: 20px (pílula)

## Layout
### Desktop
- Menu lateral **flutuante** (não colado na borda): 252px aberto / 68px recolhido (rail com tooltips), margem 12px, fundo --z-sb, texto branco.
- Topo do menu: logo + botão recolher; cartão **"Falar com o ZEUS"** com esfera animada (abre o Jarvis); busca ⌘K.
- Grupos: (sem rótulo) Início, Jarvis · OPERAR: Rotinas, Agentes, Gestão Inteligente, Atividades · CANAIS: WhatsApp, Instagram, LinkedIn, TikTok (ponto amarelo "em configuração"), Edição de Vídeo · ORGANIZAR: Organograma, Ferramentas, Formações 🔒, Trilhas 🔒 · CONTEXTO: Biblioteca, Conectores. Itens bloqueados continuam como hoje (cadeado, opacidade 0.5).
- Rodapé do menu: usuário (avatar + nome + empresa), sino de notificações, Configurações.
- Item ativo: pílula de destaque que **desliza** entre itens (transition ~.35s cubic-bezier(.22,1,.36,1)).
- Conteúdo: fundo --z-main; cabeçalho de página = faixa com o degradê da seção + título + **abas internas** com indicador deslizante (o submenu de Agentes virou abas da página).

### Mobile
- **Sem barra superior com hambúrguer.** Navegação por **barra inferior flutuante** (left/right 10px, bottom 12px, altura 70px, fundo --z-sb) com 5 botões: Início · Agentes · [Jarvis — botão central circular 62px elevado -34px com a esfera] · Conversas (badge) · Menu.
- Ativo: ícone em pílula 46×30 com fundo rgba(255,255,255,0.20), texto branco 700; inativo rgba(255,255,255,0.62).
- "Menu" abre uma **bottom sheet** (raio 28px no topo, animação slide-up .32s): cartão do usuário (sino + configurações), busca, e todas as páginas em grade de 4 colunas por seção (ícone 56×56 raio 18px, cor da seção).
- Conteúdo deve ter padding-bottom ~110px para não ficar atrás da barra.

## Interações
- ⌘K / Ctrl+K abre a busca global (páginas, abas, agentes) com navegação por setas e Enter.
- Jarvis: ao "Conversar", sequência de estados OUVINDO → ZEUS TRABALHANDO → FALANDO; agente em ação ganha anel conic-gradient(#673DE6,#D16BE0); a fonte de dados consultada acende (chip roxo); legenda grande com termos/números em #673DE6; painel de resultado entra pela direita (KPIs + gráfico de barras que cresce, ou prévia de arte com Aprovar / Pedir ajuste).
- Rotinas: bloco "Modelos prontos" recolhível (chevron gira 180°) com os 12 modelos de rotinas.js em 4 categorias; "Usar" cria a rotina no topo da lista.
- Agentes: foto real de cada agente (Nina, Sobral, Ícaro, Gustavo…) em avatar circular 42px. No protótipo são espaços para foto — usar as fotos reais do produto.
- Animações de entrada de página: fade + rise curto (~.4s).

## Assets
- Ícones: usar os ícones oficiais de design-system/03-ativos (o protótipo replica os traços).
- Fotos dos agentes: fornecidas pelo time (não incluídas).
- Logos de integrações: no protótipo são siglas coloridas; usar os logos oficiais.

## Arquivos
- Zeus Central - Padrao.html (protótipo offline)
- Zeus Central - Nova.dc.html (fonte com todos os valores)
