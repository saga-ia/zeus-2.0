#!/usr/bin/env node
// Servidor MCP mínimo (stdio, JSON-RPC por linha) com UMA ferramenta: consultar a base de vendas.
// É a única coisa que o analista de vendas (Diagnóstico/Auditoria) pode usar; por baixo chama bin/consulta-sql.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const SCRIPT = path.join(__dirname, 'consulta-sql');
const TOOL = {
  name: 'consultar',
  description: 'Consulta a base de vendas da empresa (schema zv) com UMA instrução SELECT ou WITH. Devolve CSV, no máximo 300 linhas. Somente leitura.',
  inputSchema: { type: 'object', properties: {
    sql: { type: 'string', description: 'Uma única consulta SELECT/WITH sobre as views zv.*' },
    descricao: { type: 'string', description: 'O que esta consulta apura, em português e linguagem de negócio (aparece na tela para a direção). Ex.: "quantos clientes ficaram sem resposta na semana"' },
  }, required: ['sql', 'descricao'] },
};
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (_) { continue; }
    if (m.id === undefined) continue; // notificações
    if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'zv', version: '1.0.0' } } });
    else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: [TOOL] } });
    else if (m.method === 'tools/call') {
      const a = (m.params && m.params.arguments) || {};
      const r = spawnSync(SCRIPT, [String(a.sql || '')], { encoding: 'utf8', timeout: 45000, maxBuffer: 20 * 1024 * 1024 });
      const ok = r.status === 0;
      send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: ok ? r.stdout : (r.stderr || r.stdout || 'falha na consulta') }], isError: !ok } });
    } else if (m.method === 'ping') send({ jsonrpc: '2.0', id: m.id, result: {} });
    else send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'método não suportado' } });
  }
});
