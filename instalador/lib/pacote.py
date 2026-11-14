#!/usr/bin/env python3
"""Monta o pacote do ZEUS que vai pro cliente, já sem nada que é só do Jeff.

A regra é o instalador/modelos/fora.txt (uma lista só, pra instalação e pras atualizações):
  app/site/dado/pm2/host/cron/servico   o que não instala (ver o cabeçalho do fora.txt)
  arquivo <caminho>   caminho do repositório que nem entra no pacote (glob: * não atravessa /, ** atravessa)
  mantem  <caminho>   exceção dentro de um 'arquivo'
  sigilo  <termo>     texto que não pode aparecer no pacote (sem diferenciar maiúsculas); a montagem para se achar
  aceito  <caminho>   pendência conhecida: arquivo que ainda cita cliente mas não pode sair (só avisa)

Além disso: só entram as pastas de RAIZ abaixo; tabelas do instalador (hosts, pm2, bancos, env, segredos,
crontab) saem filtradas; o fora.txt do pacote leva só as linhas de 'servico' (sem nome de cliente do Jeff).

Uso:
  pacote.py montar <repo> <rev> <saida.tar.gz> [--versao N] [--forcar]   monta; sai 2 se a checagem de sigilo achar algo
  pacote.py checar <repo> <rev>                              só lista os achados de sigilo (sai 2 se houver)
  pacote.py lista  <repo> <rev>                              lista os arquivos que entrariam no pacote
"""
import gzip, hashlib, io, json, os, re, subprocess, sys, tarfile

PREFIXO = 'zeus-2.0/'
RAIZ = ['instalador/', 'worker/', 'apps/', 'infra/labastia-docker/', 'docs/crontab-snapshot.txt', 'docs/rsync-exclude.txt']
NUNCA = ['instalador/cloudflare.token', 'instalador/produto.conf', 'instalador/lib/produto.py', '**/__pycache__/**',
         '**/node_modules/**', '**/.env', '**/.env.*']


def ler_fora(texto):
    f = {}
    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha or linha.startswith('#'):
            continue
        tipo, _, resto = linha.partition(' ')
        resto = resto.strip()
        if tipo != 'sigilo':
            resto = resto.split()[0] if resto else ''
        if resto:
            f.setdefault(tipo, []).append(resto)
    return f


def casa(p, padrao):
    """padrao casa o caminho p, ou uma pasta acima dele."""
    padrao = padrao.rstrip('/')
    rx = re.escape(padrao).replace(r'\*\*', '\0').replace(r'\*', '[^/]*').replace(r'\?', '[^/]').replace('\0', '.*')
    return re.fullmatch(rx + '(/.*)?', p) is not None


class Regras:
    def __init__(self, fora):
        self.f = fora
        g = lambda t: set(fora.get(t, []))
        self.apps, self.hosts, self.pm2, self.dados = g('app'), g('host'), g('pm2'), g('dado')
        self.crons = fora.get('cron', [])
        self.arquivos, self.mantem = fora.get('arquivo', []) + NUNCA, fora.get('mantem', [])
        self.aceitos = fora.get('aceito', [])
        termos = fora.get('sigilo', [])
        self.sigilo = re.compile('|'.join(re.escape(t) for t in termos), re.I) if termos else None

    def entra(self, p):
        if not any(p == r or p.startswith(r) for r in RAIZ):
            return False
        if p.startswith('apps/') and p.split('/')[1] in self.apps:
            return False
        # o padrão mais específico (mais longo) que casar decide: arquivo tira, mantem devolve
        regra = max([(len(a), False) for a in self.arquivos if casa(p, a)] +
                    [(len(m), True) for m in self.mantem if casa(p, m)], default=(0, True))
        if not regra[1]:
            return False
        # modelos de banco e de .env de app fora do perfil
        if p.startswith(('instalador/modelos/bancos/', 'instalador/modelos/env/')):
            nome = p.rsplit('/', 1)[1]
            if nome.startswith('jeff-apps__') and nome[len('jeff-apps__'):].split('__')[0].removesuffix('.env') in self.apps:
                return False
        return True

    # ---- tabelas reescritas
    def linha_de_app_fora(self, linha):
        return any(f'jeff-apps/{a}/' in linha or f'jeff-apps/{a}:' in linha or linha.rstrip().endswith(f'jeff-apps/{a}')
                   for a in self.apps)

    def reescreve(self, p, dados):
        if p in self.literais:
            # segredo real do Jeff escrito no código (ex: chave da Evolution como valor padrão): sai como marcador
            # {{S:grupo:tamanho:tipo}}; o personalizar.py do cliente troca pelo valor do cliente
            for grp, tam, ph in self.literais[p]:
                dados = re.sub(rb'[A-Za-z0-9_\-+/=.]{8,}', lambda t: ph.encode() if len(t.group(0)) == tam and
                               hashlib.sha256(t.group(0)).hexdigest()[:12] == grp else t.group(0), dados)
            if p not in self.REESCRITOS:
                return dados
        txt = dados.decode('utf-8')
        linhas = txt.splitlines(keepends=True)
        if p == 'instalador/modelos/fora.txt':
            cab = []
            for l in linhas:
                if not l.startswith('#'):
                    break
                cab.append(l)
            return ''.join(cab + ['\n'] + [f'servico  {s}\n' for s in self.f.get('servico', [])]).encode()
        if p == 'instalador/modelos/hosts.tsv':
            return ''.join(l for l in linhas if l.startswith('#') or l.split('\t', 1)[0] not in self.hosts).encode()
        if p == 'instalador/modelos/pm2.tsv':
            def ok(l):
                if l.startswith('#'):
                    return True
                c = l.split('\t')
                return c[0] not in self.pm2 and not self.linha_de_app_fora(l)
            return ''.join(l for l in linhas if ok(l)).encode()
        if p in ('instalador/modelos/segredos.tsv', 'instalador/modelos/env-classificacao.tsv'):
            return ''.join(l for l in linhas if l.startswith('#') or not self.linha_de_app_fora(l)).encode()
        if p == 'worker/CLAUDE.md':
            # dados pessoais do Jeff (família) nunca vão pro servidor do cliente
            return re.sub(r'## Família Jeff.*?(?=\n---|\n## )', '', txt, count=1, flags=re.S).encode()
        if p == 'docs/crontab-snapshot.txt':
            return ''.join(l for l in linhas if not any(t in l for t in self.crons)
                           and not (l.startswith('#') and self.sigilo and self.sigilo.search(l))).encode()
        return dados

    REESCRITOS = {'instalador/modelos/fora.txt', 'instalador/modelos/hosts.tsv', 'instalador/modelos/pm2.tsv',
                  'instalador/modelos/segredos.tsv', 'instalador/modelos/env-classificacao.tsv', 'docs/crontab-snapshot.txt',
                  'worker/CLAUDE.md'}


def arquivos(repo, rev):
    """Gera (TarInfo, bytes|None) do pacote, já filtrado e reescrito."""
    fora_txt = subprocess.run(['git', '-C', repo, 'show', f'{rev}:instalador/modelos/fora.txt'],
                              capture_output=True, check=True).stdout.decode()
    r = Regras(ler_fora(fora_txt))
    seg = subprocess.run(['git', '-C', repo, 'show', f'{rev}:instalador/modelos/segredos.tsv'],
                         capture_output=True).stdout.decode()
    r.literais = {}
    for l in seg.splitlines():
        c = l.split('\t')
        if len(c) == 4 and c[0] == 'literal':
            m = re.match(r'\{\{S:([0-9a-f]{12}):(\d+):', c[3])
            rel = c[1].replace('jeff-apps/', 'apps/', 1) if c[1].startswith('jeff-apps/') else c[1].replace('jeff-worker/', 'worker/', 1)
            if m:
                r.literais.setdefault(rel, []).append((m.group(1), int(m.group(2)), c[3]))
    proc = subprocess.Popen(['git', '-C', repo, 'archive', '--format=tar', rev], stdout=subprocess.PIPE)
    with tarfile.open(fileobj=proc.stdout, mode='r|') as t:
        for m in t:
            p = m.name.rstrip('/')
            if m.isdir():
                continue
            if not r.entra(p):
                continue
            dados = t.extractfile(m).read() if m.isfile() else None
            if dados is not None and (p in Regras.REESCRITOS or p in r.literais):
                dados = r.reescreve(p, dados)
                m.size = len(dados)
            yield r, m, dados
    proc.wait()
    if proc.returncode:
        raise SystemExit(f'git archive falhou ({proc.returncode})')


def achados(r, m, dados):
    if not r.sigilo:
        return set()
    n = {x.group(0).lower() for x in r.sigilo.finditer(m.name)}
    if dados and len(dados) <= 5_000_000 and b'\0' not in dados[:8192]:
        n |= {x.group(0).lower() for x in r.sigilo.finditer(dados.decode('utf-8', 'ignore'))}
    return n


def montar(repo, rev, saida, forcar=False, versao=None):
    total, achou, pend = 0, {}, {}
    tmp = saida + '.parcial'
    with open(tmp, 'wb') as bruto, gzip.GzipFile(fileobj=bruto, mode='wb', compresslevel=6, mtime=0) as gz, \
            tarfile.open(fileobj=gz, mode='w|', format=tarfile.PAX_FORMAT) as out:
        for r, m, dados in arquivos(repo, rev):
            a = achados(r, m, dados)
            if a:
                (pend if any(casa(m.name, x) for x in r.aceitos) else achou)[m.name] = sorted(a)
            m.name = PREFIXO + m.name
            out.addfile(m, io.BytesIO(dados) if dados is not None else None)
            total += 1
        if versao:   # o servidor do cliente sabe qual versão tem (instalar.sh e atualizar.sh leem)
            v = f'{versao}\n'.encode()
            ti = tarfile.TarInfo(PREFIXO + 'VERSAO')
            ti.size, ti.mode, ti.mtime = len(v), 0o644, 0
            out.addfile(ti, io.BytesIO(v))
    if pend:
        print(f'pendência conhecida: {len(pend)} arquivo(s) de código ainda citam cliente (linhas "aceito" do fora.txt)',
              file=sys.stderr)
    for p, n in sorted(achou.items()):
        print(f'SIGILO\t{p}\t{", ".join(n)}', file=sys.stderr)
    if achou and not forcar:
        os.unlink(tmp)
        print(f'pacote NÃO montado: {len(achou)} arquivo(s) com termo de sigilo (lista acima)', file=sys.stderr)
        return 2
    os.replace(tmp, saida)
    print(f'{total} arquivos, {os.path.getsize(saida) / 1e6:.1f} MB -> {saida}', file=sys.stderr)
    print(json.dumps({'arquivos': total, 'pendencias': len(pend)}))
    return 0


def checar(repo, rev):
    achou = 0
    for r, m, dados in arquivos(repo, rev):
        a = achados(r, m, dados)
        if a:
            aceito = any(casa(m.name, x) for x in r.aceitos)
            achou += not aceito
            print(f'{"pendente" if aceito else "SIGILO"}\t{m.name}\t{", ".join(sorted(a))}')
    return 2 if achou else 0


if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    cmd, repo, rev = sys.argv[1:4]
    if cmd == 'montar':
        v = sys.argv[sys.argv.index('--versao') + 1] if '--versao' in sys.argv else None
        sys.exit(montar(repo, rev, sys.argv[4], '--forcar' in sys.argv, v))
    elif cmd == 'checar':
        sys.exit(checar(repo, rev))
    elif cmd == 'lista':
        for _, m, _ in arquivos(repo, rev):
            print(f'{m.size}\t{m.name}')
    else:
        sys.exit(__doc__)
