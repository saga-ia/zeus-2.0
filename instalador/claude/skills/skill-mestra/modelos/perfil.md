# Modelo: perfil

O perfil é o gosto da pessoa, separado do fluxo. Fica em `<pasta de ferramentas>/perfis/<nome>/`. Um estilo novo (outro canal, um cliente) é um perfil novo, nunca uma cópia das skills.

Cada regra do perfil traz o número e a origem ("medido nas refs 02 e 05", "pedido em 12/03"). Regra sem origem vira chute. Comece simples: o perfil cresce com o caderno de aprendizados.

## Arquivos
| Arquivo | O que decide | Quem lê |
|---|---|---|
| `identidade.md` | cores (com códigos), fontes, fundo, material (vidro, papel, plano, 3D), logotipo, o que nunca usar | motion-mapa, motion-render |
| `estilo-motion.md` | velocidades e curvas preferidas, overshoot ao chegar (se tem e quanto), movimento secundário (quanto), trocas de cena preferidas, densidade de animação por trecho (gancho, corpo, fechamento), como fazer a ênfase de frase | motion-mapa, motion-render |
| `estilo-camera.md` | escala do plano fechado, força do punch, aproximação lenta (quanto), quanto movimento no gancho e no corpo, se trava no rosto | motion-mapa, câmera |
| `estilo-cortes.md` | ar entre as frases, folga nas bordas, o que fazer com hesitação, como a pessoa costuma gravar | cortes |
| `estilo-som.md` | densidade de som por trecho, peso, sons favoritos, níveis por categoria | sfx |
| `catalogo.md` | padrões de animação que já funcionaram (repertório, nunca obrigação) | motion-mapa |
| `referencias/` e `analises/` | os trechos de referência, as fichas e a síntese | quando for revisar o estilo |
| peças-base (opcional) | o visual dos elementos que se repetem (CSS) e o movimento deles (JS) | motion-render |

## Esqueleto de um `estilo-*.md`

```markdown
# Estilo de <motion | câmera | cortes | som> — <nome do perfil>

Origem: <referências analisadas em <data>; vídeos aprovados>. Tendência, não regra.

## <tema>
- <regra, com número> (<origem>)
```

Use a mesma numeração de seções do `guias/oficio-motion.md` no `estilo-motion.md` (§1 velocidade, §2 curvas, §3 câmera…). Assim, "o §3" quer dizer a mesma coisa nos dois, e fica claro onde o perfil contraria o ofício (quando contraria, vale o perfil).
