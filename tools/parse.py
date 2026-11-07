import docx, glob, re, json, sys, os
from docx.oxml.ns import qn

SRC = sys.argv[1]
OUT = sys.argv[2]

def run_flags(r):
    rpr = r._r.rPr
    hl = False; bold = False; ul = False; shd = False
    if rpr is not None:
        h = rpr.find(qn('w:highlight'))
        if h is not None and h.get(qn('w:val')) not in (None, 'none'):
            hl = True
        s = rpr.find(qn('w:shd'))
        if s is not None and s.get(qn('w:fill')) not in (None, 'auto', 'FFFFFF', 'ffffff'):
            shd = True
        b = rpr.find(qn('w:b'))
        if b is not None and b.get(qn('w:val')) not in ('0', 'false'):
            bold = True
        u = rpr.find(qn('w:u'))
        if u is not None and u.get(qn('w:val')) not in ('none',):
            ul = True
    return hl or shd, bold, ul

def para_info(p):
    ppr = p._p.pPr
    pshd = False
    if ppr is not None:
        s = ppr.find(qn('w:shd'))
        if s is not None and s.get(qn('w:fill')) not in (None, 'auto', 'FFFFFF', 'ffffff'):
            pshd = True
    numbered = ppr is not None and ppr.find(qn('w:numPr')) is not None
    lines = [[]]
    for r in p.runs:
        fl = run_flags(r)
        parts = re.split(r'[\n\r\v]', r.text)
        for k, part in enumerate(parts):
            if k > 0: lines.append([])
            if part: lines[-1].append((part, *fl))
    out = []
    for li, runs in enumerate(lines):
        text = ''.join(t for t, *_ in runs).strip()
        if not text: continue
        def cov(idx):
            tot = sum(len(re.sub(r'[\s\.\:]', '', t)) for t, *_ in runs)
            c = sum(len(re.sub(r'[\s\.\:]', '', t)) for t, *f in runs if f[idx])
            return c, tot
        hc, tot = cov(0); bc, _ = cov(1); uc, _ = cov(2)
        out.append(dict(text=text, style=p.style.name,
                hl=(tot > 0 and hc > 0) or pshd, hl_frac=(hc / tot if tot else 0),
                bold_frac=(bc / tot if tot else 0), ul_frac=(uc / tot if tot else 0),
                numbered=numbered and li == 0))
    return out

def iter_block_paras(doc):
    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn('w:p'):
            yield docx.text.paragraph.Paragraph(child, doc)
        elif child.tag == qn('w:tbl'):
            t = docx.table.Table(child, doc)
            for row in t.rows:
                seen = set()
                for cell in row.cells:
                    if id(cell._tc) in seen: continue
                    seen.add(id(cell._tc))
                    for p in cell.paragraphs:
                        yield p

files = sorted(glob.glob(os.path.join(SRC, '*.docx')), key=lambda x: int(re.findall(r'(\d+)\.docx', x)[0]))
allp = {}
for f in files:
    d = docx.Document(f)
    name = os.path.basename(f)
    allp[name] = [x for p in iter_block_paras(d) if p.text.strip() for x in para_info(p)]
json.dump(allp, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print({k: len(v) for k, v in allp.items()})
