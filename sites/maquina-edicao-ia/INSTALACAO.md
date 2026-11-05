# Instalação local das skills

## Caminho mais fácil

1. Extraia o ZIP inteiro. Abra painel/index.html no navegador.
2. Abra seu projeto de vídeo no Codex ou no Claude Code.
3. No painel, entre em Como usar. Preencha o caminho do pacote, a pasta do projeto e o editor escolhido.
4. Copie o comando de instalação e envie ao agente. Ele deve ler o instalador, conferir a prévia e copiar as skills sem substituir versões diferentes.
5. Confirme que o agente reconhece uma das skills antes de pedir a edição.

## Copiar manualmente

Copie as pastas que estão dentro de skills, incluindo SKILL.md e suas referências, para:

- Codex, neste projeto: .agents/skills/<nome-da-skill>/
- Claude Code, neste projeto: .claude/skills/<nome-da-skill>/

Abra o projeto nessa pasta. No Codex, mencione $nome-da-skill. No Claude Code, use /nome-da-skill. Se não aparecer, retome o projeto ou reinicie o cliente. A instalação descrita é local ao projeto, não à conta inteira.

## Pelo terminal (opcional)

Com Node.js já instalado, abra o terminal na pasta extraída do pacote. Substitua o caminho pelo seu projeto existente:

    node instalar-skills.mjs --editor codex --project "CAMINHO DO PROJETO"

O comando acima só mostra a prévia. Para copiar:

    node instalar-skills.mjs --editor codex --project "CAMINHO DO PROJETO" --apply

Use --editor claude para Claude Code ou --editor ambos para os dois. Não precisa executar como administrador. O instalador não usa a rede nem lê credenciais. Uma skill idêntica é mantida; uma versão diferente gera conflito antes da cópia. Ele não remove skills e não substitui a configuração do agente.

## Se não reconhecer

Confira se você copiou a pasta inteira, se SKILL.md está no nível correto e se o projeto aberto corresponde ao destino. No Windows, use o mesmo ambiente do agente (por exemplo, não misture uma pasta do Windows com uma sessão WSL sem conferir o caminho). Se o instalador recusar um link simbólico, selecione o caminho físico da pasta.

## Ambiente de edição

Use Codex ou Claude Code com acesso à pasta e capacidade de executar o projeto. Em chats sem essas ferramentas, os prompts podem ajudar no planejamento, mas a exportação precisa de um ambiente de edição. O pacote não inclui uma assinatura de IA, créditos, transcrição paga ou serviços de geração de assets.

As skills técnicas oficiais do Remotion são distribuídas separadamente pelo Remotion. Confira a instrução atual em https://www.remotion.dev/docs/ai/skills . O comando oficial consultado nesta edição é:

    npx skills add remotion-dev/skills

Use no ambiente em que você já configurou o projeto durante o curso. Não é necessário reinstalar o que já funciona. Estas skills autorais de direção complementam a orientação técnica do Remotion.

## Documentação oficial consultada em 23/09/2026

- Codex: https://learn.chatgpt.com/docs/build-skills
- Claude Code: https://code.claude.com/docs/en/skills
- Remotion: https://www.remotion.dev/docs/ai/skills
