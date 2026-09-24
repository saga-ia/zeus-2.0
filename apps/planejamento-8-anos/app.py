"""Servidor Flask: serve UI e gera docx preenchido."""
import io
import json
import re
import copy
from flask import Flask, request, send_file, jsonify, send_from_directory
from docx import Document
from docx.oxml.ns import qn

app = Flask(__name__, static_folder='static', static_url_path='/static')

with open('fields.json', encoding='utf-8') as f:
    META = json.load(f)


def cell_paragraphs(cell):
    return cell.paragraphs


def clear_cell_keep_first(cell):
    """Remove todos os paragrafos da celula, guardando estilo do primeiro."""
    tc = cell._tc
    for p in list(cell.paragraphs)[1:]:
        p._element.getparent().remove(p._element)
    # limpa runs do primeiro
    first = cell.paragraphs[0]
    for r in list(first.runs):
        r._element.getparent().remove(r._element)


def _copy_run_format(src_run, dst_run):
    if src_run is None:
        return
    dst_run.bold = src_run.bold
    dst_run.italic = src_run.italic
    dst_run.underline = src_run.underline
    if src_run.font.name:
        dst_run.font.name = src_run.font.name
        rPr = dst_run._element.get_or_add_rPr()
        rFonts = rPr.find(qn('w:rFonts'))
        if rFonts is None:
            from docx.oxml import OxmlElement
            rFonts = OxmlElement('w:rFonts')
            rPr.append(rFonts)
        rFonts.set(qn('w:ascii'), src_run.font.name)
        rFonts.set(qn('w:hAnsi'), src_run.font.name)
    if src_run.font.size:
        dst_run.font.size = src_run.font.size
    if src_run.font.color and src_run.font.color.rgb:
        dst_run.font.color.rgb = src_run.font.color.rgb


def apply_underscore_replace(cell, value):
    """Mantem primeiro paragrafo (label). Substitui paragrafos de underscores pelo valor."""
    paragraphs = list(cell.paragraphs)
    if not paragraphs:
        return
    # detecta se o primeiro paragrafo eh label puro ou label + underscores
    first_p = paragraphs[0]
    first_txt = first_p.text
    has_label_only = ('_' not in first_txt) and first_txt.strip() != ''

    # remove todos os paragrafos com underscore
    ph_paragraphs = [p for p in paragraphs if '_' in p.text]
    ref_run = None
    for p in ph_paragraphs:
        if p.runs:
            ref_run = p.runs[0]
            break

    if has_label_only and ph_paragraphs:
        # limpa paragrafos de underscore e insere valor no primeiro deles
        # remove os underscore-paragraphs, insere novo com valor
        target = ph_paragraphs[0]
        for r in list(target.runs):
            r._element.getparent().remove(r._element)
        for p in ph_paragraphs[1:]:
            p._element.getparent().remove(p._element)
        # coloca valor (multi-line vira multiplos runs com break)
        lines = value.split('\n')
        for i, line in enumerate(lines):
            run = target.add_run(line)
            _copy_run_format(ref_run, run)
            if i < len(lines) - 1:
                run.add_break()
    else:
        # primeiro paragrafo tambem tem underscores; substitui inline preservando texto antes
        # limpa TODOS os paragrafos e reconstroi
        for r in list(first_p.runs):
            r._element.getparent().remove(r._element)
        for p in paragraphs[1:]:
            p._element.getparent().remove(p._element)
        lines = value.split('\n')
        for i, line in enumerate(lines):
            run = first_p.add_run(line)
            _copy_run_format(ref_run, run)
            if i < len(lines) - 1:
                run.add_break()


def set_empty_cell(cell, value):
    """Preenche celula que estava vazia."""
    paragraphs = list(cell.paragraphs)
    target = paragraphs[0] if paragraphs else cell.add_paragraph()
    for r in list(target.runs):
        r._element.getparent().remove(r._element)
    for p in paragraphs[1:]:
        p._element.getparent().remove(p._element)
    lines = value.split('\n')
    for i, line in enumerate(lines):
        run = target.add_run(line)
        if i < len(lines) - 1:
            run.add_break()


def apply_inline_header(doc, values):
    """Substitui campos inline na celula do cabecalho (empresa, ciclo, data, quarter)."""
    cell = doc.tables[0].rows[1].cells[0]
    empresa = values.get('t0_r1_c0_empresa', '').strip() or ''
    ciclo_ini = values.get('t0_r1_c0_ciclo_ini', '').strip() or ''
    ciclo_fim = values.get('t0_r1_c0_ciclo_fim', '').strip() or ''
    data = values.get('t0_r1_c0_data', '').strip() or ''
    quarter = values.get('t0_r1_c0_quarter', '').strip() or ''

    def pad(v, n):
        return v if v else '_' * n

    line1 = f'EMPRESA: {pad(empresa, 20)}     CICLO: 20{pad(ciclo_ini, 2)}-20{pad(ciclo_fim, 2)}     DATA: {pad(data, 10)}     QUARTER: Q{pad(quarter, 1)}'

    # limpa e escreve
    paragraphs = list(cell.paragraphs)
    target = paragraphs[0]
    ref_run = target.runs[0] if target.runs else None
    for r in list(target.runs):
        r._element.getparent().remove(r._element)
    for p in paragraphs[1:]:
        p._element.getparent().remove(p._element)
    run = target.add_run(line1)
    _copy_run_format(ref_run, run)

    # sponsor
    cell_sp = doc.tables[0].rows[1].cells[1]
    sponsor = values.get('t0_r1_c1_sponsor', '').strip() or ''
    paragraphs = list(cell_sp.paragraphs)
    target = paragraphs[0]
    ref_run = target.runs[0] if target.runs else None
    for r in list(target.runs):
        r._element.getparent().remove(r._element)
    for p in paragraphs[1:]:
        p._element.getparent().remove(p._element)
    run = target.add_run(f'SPONSOR: {sponsor if sponsor else "____________________"}')
    _copy_run_format(ref_run, run)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/meta')
def api_meta():
    return jsonify(META)


@app.route('/api/generate', methods=['POST'])
def api_generate():
    values = request.json or {}
    doc = Document('template.docx')

    # cabecalho inline
    apply_inline_header(doc, values)

    for field in META['fields']:
        if field['target']['pattern'] in ('empresa', 'ciclo_ini', 'ciclo_fim', 'data', 'quarter', 'sponsor'):
            continue
        val = values.get(field['id'], '').strip()
        if not val:
            continue
        tgt = field['target']
        cell = doc.tables[tgt['table']].rows[tgt['row']].cells[tgt['col']]
        if tgt['pattern'] == 'replace_underscores':
            apply_underscore_replace(cell, val)
        elif tgt['pattern'] == 'set_empty':
            set_empty_cell(cell, val)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    empresa = (values.get('t0_r1_c0_empresa', '') or 'planejamento').strip()
    empresa_slug = re.sub(r'[^a-zA-Z0-9]+', '-', empresa).strip('-').lower() or 'planejamento'
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        as_attachment=True,
        download_name=f'planejamento-8-anos-{empresa_slug}.docx',
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7180)
