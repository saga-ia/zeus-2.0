# Componentes e telas da Central (ZEUS 2.0)

Estado em 16/10/2026. A Central não usa classes CSS para os componentes: cada tela monta o HTML com estilos inline a partir destas constantes, definidas em `jeff-central/public/index.html`. Para tela nova, reaproveite as constantes `CFG_*` e `LI_BTN*` (é o padrão mais recente).

## Cores de estado (selos)

| Estado | Texto | Fundo | Onde |
|---|---|---|---|
| Rascunho / neutro | `#66666F` | `#F1F1F3` | LinkedIn, tarefas |
| Agendado / atenção | `#9A6700` | `rgba(237,161,0,0.14)` | LinkedIn, prioridade média |
| Em andamento | `#4A6CF7` | `rgba(74,108,247,0.10)` | chamados, publicando |
| Publicado / ok | `#0F7A68` | `rgba(15,122,104,0.10)` | LinkedIn, resolvido |
| Erro / alta | `#C0341C` | `rgba(192,52,28,0.08)` | LinkedIn, prioridade alta |
| Marca (selecionado, chip) | `#673DE6` | `rgba(103,61,230,0.10)` | chips, item ativo do menu |

Selo: `font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px`.

## Constantes de estilo

### Configurações e telas de formulário (padrão das telas novas: LinkedIn, Memória, TikTok)

| Constante | Estilo |
|---|---|
| `CFG_BOX` | `border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:22px 24px` |
| `CFG_H2` | `font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;margin:0` |
| `CFG_LBL` | `font-size:12.5px;font-weight:500;margin-bottom:7px` |
| `CFG_IN` | `width:100%;padding:10px 13px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none` |

### Botões (LinkedIn)

| Constante | Estilo |
|---|---|
| `LI_BTN` | `display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #DADADF;background:#FFFFFF;color:#17171A;text-decoration:none` |
| `LI_BTN_PRI` | `display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;border:0;background:#673DE6;color:#FFFFFF;text-decoration:none` |

### Chat (barra de ações das respostas)

| Constante | Estilo |
|---|---|
| `CHAT_ACT` | `display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:7px;font-size:11.5px;color:#66666F;cursor:pointer;user-select:none` |
| `CHAT_ICO_BTN` | `display:inline-flex;align-items:center;gap:5px;min-width:28px;height:28px;padding:0 6px;justify-content:center;border-radius:7px;font-size:11.5px;color:#66666F;cursor:pointer;user-select:none` |

### Agentes

| Constante | Estilo |
|---|---|
| `AG_BTN` | `display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;border-radius:9px;font-size:12.5px;cursor:pointer` |
| `AG_TAG` | `font-size:11px;color:#66666F;border:1px solid #DADADF;padding:2px 8px;border-radius:6px` |
| `AG_KIND` | `font-size:11px;color:#673DE6;border:1px solid rgba(103,61,230,0.35);padding:2px 8px;border-radius:6px` |
| `AG_INPUT` | `width:100%;padding:11px 13px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none` |
| `AG_MENU_ITEM` | `display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap` |

### PDI

| Constante | Estilo |
|---|---|
| `PDI_BOX` | `border:1px solid #E6E6EA;border-radius:16px;background:#FFFFFF;padding:20px` |
| `PDI_H3` | `font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:600;margin:0` |
| `PDI_EYE` | `font-size:10.5px;letter-spacing:0.14em;color:#673DE6;font-weight:700` |
| `PDI_IN` | `width:100%;padding:11px 13px;border:1px solid #DADADF;border-radius:10px;font:inherit;font-size:13.5px;color:#17171A;background:#FFFFFF;outline:none` |

### Home

| Constante | Estilo |
|---|---|
| `HC_BOX` | `border:1px solid #E6E6EA;border-radius:14px;background:#FFFFFF;box-shadow:0 4px 18px rgba(23,23,26,0.04);padding:20px` |
| `HC_H3` | `font-family:'Space Grotesk',sans-serif;font-size:14.5px;font-weight:600;margin:0` |
| `HC_MUTED` | `font-size:12.5px;color:#66666F;padding:10px 0` |

### Time

| Constante | Estilo |
|---|---|
| `TM_AVATAR` | `width:26px;height:26px;border-radius:8px;background:#EFEFF1;color:#4A4A52;font-size:9.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;border:2px solid #FFFFFF;flex:0 0 auto` |
| `TM_EYEBROW` | `font-size:10.5px;letter-spacing:0.12em;font-weight:700;color:#66666F` |

### Painéis do chat

| Constante | Estilo |
|---|---|
| `VIZ_FRAME` | `border:1px solid #E6E6EA;border-radius:12px;background:#FFFFFF;margin:4px 0 12px;overflow:hidden` |

## Menu lateral (ordem atual)

- Início · Jarvis (tela de voz do ZEUS, título "ZEUS")
- **OPERAR E AUTOMATIZAR:** Rotinas · Agentes (Meus agentes, Agentes ZEUS, Equipes de agentes, Habilidades, Conhecimento) · Gestão Inteligente
- **EXECUTAR E COMUNICAR:** Atividades · WhatsApp · Instagram · LinkedIn · TikTok · Edição de Vídeo
- **ORGANIZAÇÃO E PESSOAS:** Organograma
- **PREPARAR E ESTRUTURAR:** Formações (bloqueado) · Ferramentas · Trilhas (bloqueado)
- **CONTEXTO:** Biblioteca · Conectores · Configurações

Título de seção: `font-size:10px;letter-spacing:0.14em;color:#66666F;font-weight:700`. Item ativo: fundo `rgba(103,61,230,0.10)`, texto e ícone `#673DE6`. Menu recolhido mostra só os ícones, na mesma ordem.

## Telas e padrões recentes

- **Cabeçalho de tela:** linha "Conta <empresa>" (12px, `#66666F`), título em Space Grotesk 28px/600 com ícone roxo de 24px, parágrafo de 1 a 2 linhas em `#66666F`.
- **LinkedIn (/linkedin):** barra de conexão (ponto verde, ou âmbar quando faltam 7 dias), grade lista de posts (340px) + editor; prévia que imita o card do feed com corte em "… ver mais" (210 caracteres); miniaturas em JPG 240/720 px.
- **TikTok (/tiktok):** tela "Integração em configuração" (selo âmbar + passos numerados), padrão para integração ainda não ligada.
- **Chat:** barra de ações sob cada resposta (copiar, 👍, 👎, compartilhar, LinkedIn, gerar de novo, mais) com `CHAT_ICO_BTN`; blocos `zeus-opcoes` viram cartões clicáveis.
- **Tela de voz (/jarvis):** ver `voz-zeus.css` (tokens `--jv-*`, orbe central, cartões do time ao redor).
- **Tema escuro:** `html.tema-escuro` aplica `filter:invert(0.93) hue-rotate(180deg)` nos slots e desfaz em imagens e vídeos (`[data-no-invert]`); o fundo da página fica `#111114`. Não existe paleta escura própria: cores novas precisam funcionar invertidas.
