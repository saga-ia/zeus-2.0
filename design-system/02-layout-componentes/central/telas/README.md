# Telas da Central (ZEUS 2.0)

Documentação de todas as telas de `central.jefersonhenrike.com`, lida direto do código em 16/10/2026: rota, item do menu, layout, abas, componentes, estados, o que cada botão faz, APIs e arquivo de origem. As 49 telas registradas em `VALID_SCREENS` do `index.html` estão cobertas, mais o painel do Agente Posts (`/posts/`). PDI e OKRs existem no código, mas ficam fora por não serem usados.

| Arquivo | Telas |
|---|---|
| [01-inicio-voz-chat.md](01-inicio-voz-chat.md) | Início, tela de voz do ZEUS (`/jarvis`), Conversas (`/chat`), chat flutuante e botão flutuante (ZEUS, Agente de Ações, Suporte), Edição de Vídeo, Memória |
| [02-rotinas-agentes.md](02-rotinas-agentes.md) | Rotinas, Meus agentes, Agentes ZEUS (catálogo), Equipes (lista, execução com aprovação por partes, criar/editar), Habilidades, Conhecimento, Criar/editar agente, Conversa com agente (com Canais) |
| [03-gestao-atividades.md](03-gestao-atividades.md) | Gestão Inteligente, Motor de Vendas (Gestão Comercial, Auditoria, Qualidade, Diagnóstico), Growth (Dashboard Meta Ads, Análise dos Anúncios IA, Estrategista, Criar anúncio), Atividades. PDI e OKRs ficam fora (não são usados) |
| [04-canais-whatsapp-instagram-linkedin-tiktok.md](04-canais-whatsapp-instagram-linkedin-tiktok.md) | WhatsApp (e conector WhatsApp/Zeus bot), Instagram, Agente Posts, Agente de Design (Criar post, Criações, Estilos, Brand Kit), LinkedIn (com aba Estratégia), TikTok |
| [05-organograma-ferramentas-biblioteca-conectores-config.md](05-organograma-ferramentas-biblioteca-conectores-config.md) | Organograma, Ferramentas (catálogo, ferramenta, SWOT), Biblioteca, Conectores (WhatsApp Business, Planilha/CRM), Configurações (14 seções), estrutura geral (menu aberto e recolhido, empresa, sino, menu do usuário e tema, celular, roteamento e permissão, toasts e confirmações, login e convite) |

Prints de referência em [prints/](prints/), tirados da tela real (dados pessoais desfocados): Início, voz do ZEUS (2), Conversas, Agentes ZEUS, Rotinas, WhatsApp e Instagram.

## Como a Central é montada (resumo)

- **Uma página só** (`public/index.html`) com rota limpa (`/okrs`, `/motor/vendas`); cada tela é uma função `render*()` no objeto `RENDERERS`. Várias telas são **substituídas por scripts carregados depois** (`rotinas.js`, `habilidades.js`, `vendas-demo.js`, `analise.js`, `diagnostico.js`, `growth-dash.js`, `pdi.js`, `okrs.js`, `acoes.js`, `whatsapp.js`, `instagram.js`, `jarvis.js`...): o que vale é o script, não a função antiga do `index.html`.
- **Estilo inline** a partir das constantes de [componentes-e-telas.md](../componentes-e-telas.md) e dos tokens de [zeus-central.css](../../../01-identidade/tokens/zeus-central.css). Painel do Agente Posts tem CSS próprio (`posts.css`, quebra em 900 px); o resto da Central quebra em 820 px (menu vira gaveta).
- **Permissão**: o servidor é quem trava; o front só esconde o que a pessoa não pode usar (`pode()`, `souAdmin()`).

## Achados da leitura (o que a tela faz de diferente do esperado)

- **Fora do menu lateral:** Conversas (`/chat`, abre pelo botão da Início), Memória (pelo menu do usuário). Agente Posts e Agente de Design ficam em Agentes ZEUS (e o Design também em Ferramentas).
- **Nome:** o menu diz "Jarvis" e a tela de voz se chama "ZEUS".
- **Dados de demonstração:** Gestão Comercial e Qualidade do Motor de Vendas usam ~1.500 negócios fictícios gerados no navegador (só "Leads por canal" é real; "Sincronizar" é simulado). SWOT é maquete com dados fixos.
- **Visual sem ação:** em Conectores, "Quero integrar meus sistemas", "Adicionar nova conexão", busca, chips de categoria e o "3 conectados" fixo não têm ação. O seletor "ZEUS 2.3 MAX" do chat é só rótulo.
- **Código que não aparece:** chat flutuante "Copiloto ZEUS" (nada abre ele), `auditoria.js` (não é carregado), seções de Configurações `seguranca`, `motores` e `okrs` (fora do menu), ramo de Aplicações em Ferramentas, `renderHabilidades` antiga do `index.html`, aba "Compartilhados" de Meus agentes (filtro sempre vazio).
- **Celular:** Organograma só tem pan/zoom de mouse; o título da barra do celular (`#mob-titulo`) nunca recebe texto.

Cada arquivo lista no texto os pontos marcados "(a confirmar)".
