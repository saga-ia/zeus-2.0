#!/usr/bin/env python3
# Checagem automática de arte (PNG) antes de entregar: reprova área vazia grande e lâmina "sem nada".
# Uso: check-arte.py arte1.png [arte2.png ...]   -> imprime OK/REPROVADO por arquivo; sai com código 1 se algum reprovar.
# Regras:
#  - faixa horizontal "lisa" (quase sem variação de cor) maior que 12% da altura, fora das bordas de 4% = REPROVADO (vazio no meio)
#  - mais de 45% da área da lâmina lisa = REPROVADO (lâmina vazia demais)
import sys
from PIL import Image, ImageStat

def linhas_lisas(im):
    g = im.convert("L"); w, h = g.size
    res = []
    for y in range(h):
        row = g.crop((0, y, w, y + 1))
        st = ImageStat.Stat(row)
        res.append(st.stddev[0] < 3.0)  # linha praticamente de uma cor só
    return res

def checar(caminho):
    im = Image.open(caminho).convert("RGB")
    im = im.resize((540, int(540 * im.height / im.width)))
    h = im.height; lisas = linhas_lisas(im)
    margem = int(h * 0.04); maior = atual = 0; ini = fim_maior = 0
    for y in range(margem, h - margem):
        if lisas[y]:
            atual += 1
            if atual > maior: maior, fim_maior = atual, y
        else: atual = 0
    pct_faixa = maior / h; pct_total = sum(lisas) / h
    problemas, alertas = [], []
    if pct_faixa > 0.12:
        y0 = (fim_maior - maior) / h; y1 = fim_maior / h
        txt = f"faixa vazia de {pct_faixa:.0%} da altura (de {y0:.0%} a {y1:.0%} da lâmina)"
        # vazio ENTRE elementos (conteúdo acima e abaixo) = reprova; vazio colado na borda = alerta
        (alertas if (y0 < 0.12 or y1 > 0.88) else problemas).append(txt)
    if pct_total > 0.70:
        alertas.append(f"{pct_total:.0%} da lâmina é fundo liso (confira se o vazio é intencional, como no print de tweet)")
    return problemas, alertas

ruim = False
for c in sys.argv[1:]:
    p, a = checar(c)
    status = "REPROVADO" if p else ("ATENÇÃO" if a else "OK")
    print(f"{status} {c}" + (": " + "; ".join(p + a) if (p or a) else ""))
    ruim = ruim or bool(p)
sys.exit(1 if ruim else 0)
