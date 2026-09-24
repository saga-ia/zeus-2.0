// Wrapper pra chamar `claude -p` igual ao agent-runner do Zeus.
// Recebe prompt + modelo, devolve string ou null em erro.
const { spawn } = require('child_process');

function runClaude({ prompt, model = 'haiku', timeoutMs = 120000 }) {
  return new Promise((resolve) => {
    const args = ['-p', '--model', model, '--output-format', 'text'];
    const child = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_DISABLE_SHELL_HOOKS: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let out = '', err = '';
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };

    const to = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish({ ok: false, error: 'timeout', stdout: out, stderr: err });
    }, timeoutMs);

    child.stdout.on('data', (d) => out += d.toString());
    child.stderr.on('data', (d) => err += d.toString());
    child.on('close', (code) => {
      clearTimeout(to);
      if (code === 0) finish({ ok: true, text: out.trim() });
      else finish({ ok: false, error: `exit ${code}`, stdout: out, stderr: err });
    });
    child.on('error', (e) => { clearTimeout(to); finish({ ok: false, error: e.message }); });

    child.stdin.end(prompt);
  });
}

// Tenta achar JSON dentro de texto livre do modelo
function extractJSON(text) {
  if (!text) return null;
  // Procura primeiro { ... }
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(text.slice(start, end)); }
  catch (_) { return null; }
}

module.exports = { runClaude, extractJSON };
