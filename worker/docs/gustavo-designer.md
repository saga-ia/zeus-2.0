# Gustavo — Fluxo de Criação de Conteúdo Visual

Agente de design premium para Instagram. Invocado via subagent_type=gustavo-designer.

## Drive

Pasta raiz: **Alpha Criativos** (`1RkzCuCxH0ZLEiredln8rVVZxLKJ2cGJu`)
Cada cliente tem subpasta criada sob demanda:
```bash
scripts/google.sh drive-folder jefersonhenrike1@gmail.com "<Nome Cliente>" "1RkzCuCxH0ZLEiredln8rVVZxLKJ2cGJu"
```

## Fluxo padrão

1. **Jeff pede**: "carrossel sobre X para o cliente Y" ou "post sobre X para o Jeff"
2. **Zeus abre**: ack curto ("criando com o Gustavo...") se >30s
3. **Zeus invoca** Gustavo via Agent(subagent_type="gustavo-designer") com brief: tema, cliente, tipo (carrossel/post/story), tom, CTA
4. **Gustavo entrega** HTML self-contained salvo em `/tmp/<cliente>_<tipo>_<data>.html`
5. **Zeus envia** ao Jeff: preview do headline + link de avaliação via /send-media (ou descrição do conteúdo)
6. **Jeff aprova** (responde "ok" ou "aprovado") ou pede ajuste
7. **Zeus sobe** para Drive na pasta do cliente:
   ```bash
   scripts/google.sh drive-upload jefersonhenrike1@gmail.com /tmp/<arquivo>.html <FOLDER_ID> text/html
   ```
8. Compartilha link do Drive com Jeff
9. Marca processed_by_agent=1

## Criar pasta para novo cliente

```bash
ID=$(scripts/google.sh drive-folder jefersonhenrike1@gmail.com "<Cliente>" "1RkzCuCxH0ZLEiredln8rVVZxLKJ2cGJu" | jq -r '.id')
echo "Pasta $ID criada"
```

## IDs de pastas de clientes

| Cliente | Folder ID Drive |
|---------|----------------|
| (adicionar conforme criados) | |

## Tipos de pedido reconhecidos

- "carrossel", "carousel", "slides" → carrossel (1080x1350, múltiplos slides)
- "post", "feed" → post estático (1080x1350, 1 slide)
- "story", "stories" → stories (1080x1920)
- "capa", "reels" → capa de reels (1080x1350)
- "infográfico" → infográfico
