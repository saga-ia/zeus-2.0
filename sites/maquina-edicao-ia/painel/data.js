window.caixaPreta = {
  "kind": "bonus",
  "skills": [
    {
      "id": "meia-briefing-de-edicao",
      "title": "Briefing de edição",
      "description": "Organiza intenção, arquivos, formato e critérios visuais em um pedido executável, aproveitando as informações que você já forneceu.",
      "whenToUse": "Antes de começar uma edição ou quando o pedido ainda deixa decisões importantes em aberto.",
      "starterPrompt": "Leia e aplique a skill no arquivo [PASTA DO PACOTE]/skills/meia-briefing-de-edicao/SKILL.md. Use o pedido e os materiais que já forneci para preparar o briefing desta edição. Resolva as lacunas relevantes sem repetir perguntas já respondidas. Se faltar algo essencial, identifique exatamente o que falta. Meu vídeo é [ARQUIVO] e o resultado desejado é [OBJETIVO].",
      "path": "skills/meia-briefing-de-edicao/SKILL.md"
    },
    {
      "id": "meia-legendas-e-enquadramento",
      "title": "Legendas e enquadramento",
      "description": "Orienta a edição de legendas pela fala real e ajusta o quadro para preservar leitura, rosto e elementos importantes.",
      "whenToUse": "Ao criar ou revisar legendas, enquadramento ou adaptação de proporção de um vídeo com fala.",
      "starterPrompt": "Leia e aplique a skill no arquivo [PASTA DO PACOTE]/skills/meia-legendas-e-enquadramento/SKILL.md. Ajuste as legendas e o enquadramento de [ARQUIVO] para [FORMATO E DESTINO], preservando a voz, o sentido e o estilo já aprovado. Confira uma amostra representativa com áudio e informe qual intervalo foi realmente verificado.",
      "path": "skills/meia-legendas-e-enquadramento/SKILL.md"
    },
    {
      "id": "meia-revisao-economia",
      "title": "Revisão com economia de retrabalho",
      "description": "Conduz correções por trecho, preserva o que já funciona e exige diagnóstico quando uma tentativa repete o mesmo erro.",
      "whenToUse": "Quando uma edição precisa de ajustes objetivos ou está acumulando tentativas sem resolver a causa do problema.",
      "starterPrompt": "Leia e aplique a skill no arquivo [PASTA DO PACOTE]/skills/meia-revisao-economia/SKILL.md. Revise [ARQUIVO OU PROJETO] para corrigir [PROBLEMA] no intervalo [INÍCIO-FIM]. Preserve os pontos aprovados. Use o histórico das tentativas, se houver, para identificar a causa antes de repetir alterações e confira o trecho corrigido com suas transições. Não estime consumo ou custos sem dados.",
      "path": "skills/meia-revisao-economia/SKILL.md"
    }
  ],
  "presets": [],
  "commands": [],
  "installPrompt": "Instale as skills locais deste pacote no projeto [PASTA DO PROJETO], para usar com [EDITOR: CODEX, CLAUDE CODE OU AMBOS]. O pacote foi extraído em [PASTA DO PACOTE].\nLeia o arquivo INSTALACAO.md e examine instalar-skills.mjs antes de executá-lo. Use o Node.js já instalado. Execute primeiro a prévia sem --apply. Confira os destinos: .agents/skills para Codex e .claude/skills para Claude Code, dentro do projeto informado.\nSe a prévia não mostrar conflito e o projeto for o informado, execute com --apply para concluir a cópia. Preserve qualquer skill diferente já existente; nesse caso informe o conflito, sem sobrescrever. Não instale ferramentas, dependências ou serviços extras.\nAo terminar, informe quais skills foram copiadas e como chamá-las neste editor. Verifique a descoberta das skills; se ainda não aparecerem, oriente a reabrir o projeto ou reiniciar o cliente. Não comece a editar o vídeo nesta etapa.",
  "downloads": [
    {
      "title": "Pacote de skills",
      "path": "skills.zip",
      "note": "Pastas completas com as referências internas."
    },
    {
      "title": "Instruções de instalação",
      "path": "INSTALACAO.md",
      "note": "Agente, cópia manual e terminal."
    }
  ]
};
