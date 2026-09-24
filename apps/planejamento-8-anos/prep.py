"""Analisa template.docx e gera fields.json com metadados dos campos editáveis."""
import json, re
from docx import Document

TEMPLATE = 'template.docx'
OUT = 'fields.json'

SECTIONS = {
    0: {'title': 'Cabecalho', 'subtitle': 'Empresa, ciclo, sponsor'},
    1: {'title': '01 Identidade e Direcao', 'subtitle': 'Quem somos'},
    2: {'title': '02 Tese Estrategica de Tres Anos', 'subtitle': 'Onde jogar - Como vencer'},
    3: {'title': '03 Mapa Estrategico - Balanced Scorecard', 'subtitle': 'Como criamos valor'},
    4: {'title': '04 Revisao Anual e OKRs', 'subtitle': 'O plano continua valido?'},
    5: {'title': '05 Quarter e Plano Tatico', 'subtitle': 'Performance - Decisao'},
    6: {'title': '06 Governanca da Execucao', 'subtitle': 'Quem viabiliza - Quando decidimos'},
}


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def main():
    d = Document(TEMPLATE)
    fields = []

    for ti, t in enumerate(d.tables):
        for ri, row in enumerate(t.rows):
            seen = set()
            for ci, cell in enumerate(row.cells):
                cid = id(cell._tc)
                if cid in seen:
                    continue
                seen.add(cid)
                txt = cell.text

                # Caso especial: tabela 0 linha 1 col 0 (multiplos campos inline)
                if ti == 0 and ri == 1 and ci == 0:
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_empresa', 'section': ti, 'label': 'Empresa', 'kind': 'inline', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'empresa'}})
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_ciclo_ini', 'section': ti, 'label': 'Ciclo - ano inicio', 'kind': 'inline_short', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'ciclo_ini'}})
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_ciclo_fim', 'section': ti, 'label': 'Ciclo - ano fim', 'kind': 'inline_short', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'ciclo_fim'}})
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_data', 'section': ti, 'label': 'Data (DD/MM/AAAA)', 'kind': 'inline_short', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'data'}})
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_quarter', 'section': ti, 'label': 'Quarter (1-4)', 'kind': 'inline_short', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'quarter'}})
                    continue

                # Caso especial: tabela 0 linha 1 col 1 (sponsor)
                if ti == 0 and ri == 1 and ci == 1:
                    fields.append({'id': f't{ti}_r{ri}_c{ci}_sponsor', 'section': ti, 'label': 'Sponsor', 'kind': 'inline', 'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'sponsor'}})
                    continue

                # Caso: celula com underscores (label + espaco pra preencher)
                if '____' in txt or '___' in txt:
                    lines = txt.split('\n')
                    label = ''
                    ph_lines = 0
                    for l in lines:
                        if re.search(r'_{3,}', l):
                            ph_lines += 1
                        elif l.strip() and ph_lines == 0:
                            label = (label + ' ' + l.strip()).strip()
                    if not label:
                        label = clean(txt.replace('_', ''))
                    fields.append({
                        'id': f't{ti}_r{ri}_c{ci}',
                        'section': ti,
                        'label': label or f'Campo {ti}-{ri}-{ci}',
                        'kind': 'multiline' if ph_lines > 1 else 'text',
                        'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'replace_underscores'},
                    })
                    continue

                # Caso: celulas vazias de tabelas 3, 4, 5 (BSC + revisao + quarter)
                if txt.strip() == '' and ti in (3, 4, 5):
                    # Deriva label a partir do header da coluna e da linha
                    label = ''
                    if ti == 3:
                        headers = ['Perspectiva', 'Objetivo estrategico', 'KPI', 'Baseline', 'Ambicao 3 anos']
                        perspectivas = ['', '', 'Financeiro', 'Cliente e mercado', 'Processos criticos', 'Aprendizado e capacidades']
                        pers = perspectivas[ri] if ri < len(perspectivas) else f'linha {ri}'
                        col = headers[ci] if ci < len(headers) else f'col {ci}'
                        label = f'{pers} - {col}'
                    elif ti == 4:
                        label = 'Decisao anual - Manter / Acelerar / Repriorizar / Interromper / Incorporar'
                    elif ti == 5:
                        label = 'Quarter - Performance e decisao'
                    fields.append({
                        'id': f't{ti}_r{ri}_c{ci}',
                        'section': ti,
                        'label': label,
                        'kind': 'multiline' if ti in (4, 5) else 'text',
                        'target': {'table': ti, 'row': ri, 'col': ci, 'pattern': 'set_empty'},
                    })

    out = {
        'sections': [{'id': k, **v} for k, v in SECTIONS.items()],
        'fields': fields,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'{len(fields)} campos mapeados em {OUT}')


if __name__ == '__main__':
    main()
