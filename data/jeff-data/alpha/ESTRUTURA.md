# Alpha Digital — Estrutura Oficial

Agência de marketing e posicionamento estratégico do Jeferson Henrike.
Nome oficial: **Alpha Digital Consultoria Estratégica**.

## Posicionamento

- Combate a **mediania** das agências brasileiras.
- **Um cliente por vez**, ciclo de **6 meses**, imersão total.
- Foco: posicionamento, lançamento e escala.
- Liderança: Jeferson Henrike (um dos maiores estrategistas do Brasil).
- 2025: 23 players atendidos (estratégia ou posicionamento completo).

## Domínio

- Site público: `https://alpha.jefersonhenrike.com` → `/opt/jeff-sites/alpha/index.html`
- Sistema interno (clientes/leads/onboarding): `/opt/jeff-apps/jeff-alpha-clientes/`

## Paleta de cores oficial — Alpha Digital

Tema dark, alto contraste, único acento verde-limão neon.

### Backgrounds
| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0A0A0A` | fundo base (preto profundo) |
| `--bg-page` | `#0F0F0F` | fundo de página secundário |
| `--bg-card` | `#1A1A1A` | cartões |
| `--bg-input` | `#161616` | inputs/selects |
| `--bg-surface` | `#282828` | superfícies elevadas |

### Linhas / bordas
| Token | Hex |
|---|---|
| `--border` | `#1F1F1F` |
| `--border-strong` | `#313131` |

### Acento (cor da marca)
| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#C4FF0E` | verde-limão neon (cor principal) |
| `--primary-2` | `#A3FF33` | variação |
| `--primary-glow` | `rgba(196,255,14,0.18)` | brilho suave |
| `--primary-glow-strong` | `rgba(196,255,14,0.45)` | brilho forte |

### Texto
| Token | Hex |
|---|---|
| `--text` | `#FFFFFF` |
| `--text-2` | `#C9D2E0` |
| `--muted` | `#717680` |
| `--muted-2` | `#6A7282` |

### Estado
| Token | Hex | Uso |
|---|---|---|
| `--success` | `#00C758` | sucesso |
| `--error` | `#FB2C36` | erro |
| `--warn` | `#EDB200` | aviso |
| `--tag-bg` | `#1F3A0D` | fundo tag |
| `--tag-text` | `#7EBA8B` | texto tag |

### Tipografia
- Família: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`
- Base: 16px, line-height 1.55
- Títulos com peso 700, letter-spacing levemente apertado.

### Raios
`--r-sm:8px / --r-md:10px / --r-lg:16px / --r-xl:24px`

### Sombras / glows
- `--shadow-glow:0 0 0 1px rgba(196,255,14,0.35), 0 14px 40px -12px rgba(196,255,14,0.25)`
- `--shadow-card:0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.8)`

### Logotipo
SVG em `/opt/jeff-sites/alpha/index.html`: bloco preto rounded com letra "A" estilizada em `#C4FF0E` e barra horizontal cortando o triângulo.

## Sistema interno (Alpha Clientes)

App PM2 `jeff-alpha-clientes` em `/opt/jeff-apps/jeff-alpha-clientes/`:
- Login + TOTP
- Cadastro de clientes (status: ativo / pausado / encerrado / perdido)
- Leads (status: pending / approved / rejected)
- Onboarding público
- Dashboard com KPIs

Mesmo padrão visual da landing (paleta acima).

## Convenção: paleta por cliente

A paleta acima é da **Alpha Digital** (marca-mãe).
**Cada cliente atendido** ganha sua própria paleta dedicada, registrada na pasta do projeto:

| Cliente | Paleta principal | Hex | Pasta |
|---|---|---|---|
| **CIGC** (Glauco — Congresso de Gestores de Clínica) | dourado sobre preto | `#d4af37` / `#0b0b0c` | `/opt/jeff-data/cigc/` |
| **Alpha Digital** (marca-mãe) | verde-limão sobre preto | `#C4FF0E` / `#0A0A0A` | `/opt/jeff-data/alpha/` |

Ao criar dashboard / landing / sistema para um cliente, **usar a paleta dele**, não a da Alpha.

## O que está preservado hoje (2026-05-06)

- Landing alpha.jefersonhenrike.com — paleta verde-limão Alpha (intacta).
- Sistema jeff-alpha-clientes — paleta verde-limão Alpha (intacta).
- Dashboards CIGC (`cigc-comercial.jefersonhenrike.com` e área cliente) — paleta dourada CIGC (intacta).
- Pastas de dados separadas por cliente em `/opt/jeff-data/<cliente>/`.
