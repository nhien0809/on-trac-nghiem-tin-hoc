import json, re, sys
P = json.load(open(sys.argv[1], encoding='utf-8'))
OUT = sys.argv[2]

STEM = re.compile(r'^\s*C[aâ]u\s*(\d+)\s*[\.:\)]?\s*', re.I)
STEM7 = re.compile(r'^\s*\((NB|TH|VD|Nhận biết|Thông hiểu|Vận dụng)\)\s*:?', re.I)
LEVEL = re.compile(r'^\s*[\(\[]?\s*(Nhận\s*biết|Thông\s*hiểu|Vận\s*dụng(?:\s*cao)?|NB|TH|VDC|VD)\b\s*[\)\]]?\s*[:\.]?\s*', re.I)
OPT = re.compile(r'^\s*([A-Da-d])\s*[\.\)\:]\s*')
ANS = re.compile(r'^\s*(?:Đáp\s*án|ĐA|Đ/A)\s*(?:đúng)?\s*[:\.]?\s*([A-D])\b', re.I)
WEEK = re.compile(r'^\s*Tuần\s*(\d+)', re.I)

def norm_level(s):
    s = s.lower()
    if s.startswith('nb') or 'nhận' in s: return 'NB'
    if s.startswith('th') or 'thông' in s: return 'TH'
    if s.startswith('vd') or 'vận' in s: return 'VD'
    return ''

def is_heading(p, nopts):
    t = p['text']
    if WEEK.match(t): return True
    if re.match(r'^(CHƯƠNG|BÀI|Bài\s*\d)', t): return True
    if p['style'].startswith('Heading') and not STEM.match(t): return True
    if nopts >= 4 and re.match(r'^\d\.\s+\S', t) and p['bold_frac'] > 0.9 and len(t) < 120: return True
    if nopts >= 4 and len(t) > 15 and t.upper() == t and re.search('[A-ZĐ]', t) and not OPT.match(t): return True
    return False

questions = []
for fname, paras in P.items():
    group = int(re.findall(r'(\d+)\.docx', fname)[0])
    section = ''
    block = 0
    cur = None
    lastnum = 999
    nopts = 99
    pending_section_change = False
    def close():
        global cur
        if cur: questions.append(cur)
        cur = None
    for i, p in enumerate(paras):
        t = p['text']
        if is_heading(p, nopts):
            if cur: questions.append(cur); cur = None
            section = t; block += 1; nopts = 99
            continue
        m = STEM.match(t)
        m7 = None if m else (STEM7.match(t) if group == 7 else None)
        if m or m7:
            if cur: questions.append(cur)
            num = int(m.group(1)) if m else None
            rest = t[m.end():] if m else t
            lv = LEVEL.match(rest)
            level = ''
            if lv:
                level = norm_level(lv.group(1)); rest = rest[lv.end():]
            if num is not None and num <= lastnum and num == 1 and not pending_section_change:
                block += 1
            lastnum = num if num is not None else lastnum
            cur = dict(group=group, file=fname, section=section, block=block, num=num, level=level,
                       stem=rest.strip(), stem_bold=p['bold_frac'], opts=[], marks=[], ans_letter=None, src=i, extra=[])
            nopts = 0
            continue
        a = ANS.match(t)
        if a and cur:
            cur['ans_letter'] = a.group(1).upper(); nopts = 99
            continue
        if cur is None:
            continue
        if nopts >= 4 and not OPT.match(t):
            cur['extra'].append(t)
            continue
        om = OPT.match(t)
        txt = t[om.end():] if om else t
        cur['opts'].append(txt.strip())
        cur['marks'].append(dict(hl=p['hl'], bold=p['bold_frac'], ul=p['ul_frac'], hl_frac=p['hl_frac']))
        nopts += 1
    if cur: questions.append(cur); cur = None

# determine answer
for q in questions:
    ans = None; how = ''
    if q['ans_letter']:
        ans = 'ABCD'.index(q['ans_letter']); how = 'line'
    else:
        hl = [i for i, m in enumerate(q['marks']) if m['hl']]
        if len(hl) == 1: ans = hl[0]; how = 'hl'
        elif len(hl) > 1:
            best = max(hl, key=lambda i: q['marks'][i]['hl_frac'])
            ans = best; how = 'hl-multi'
        else:
            bd = [i for i, m in enumerate(q['marks']) if m['bold'] > 0.6]
            if len(bd) == 1: ans = bd[0]; how = 'bold'
            else:
                ul = [i for i, m in enumerate(q['marks']) if m['ul'] > 0.5]
                if len(ul) == 1: ans = ul[0]; how = 'ul'
    q['answer'] = ans; q['how'] = how

json.dump(questions, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(questions), Counter(q['how'] for q in questions))
bad = [q for q in questions if q['answer'] is None or len(q['opts']) != 4 or q['how'] == 'hl-multi' or q['extra']]
print('anomalies', len(bad))
for q in bad:
    print(f"G{q['group']} #{q['src']} C{q['num']} opts={len(q['opts'])} how={q['how']} ans={q['answer']} extra={[e[:40] for e in q['extra']]} :: {q['stem'][:70]}")

# ---- G7 answer tables
g7 = [q for q in questions if q['group'] == 7]
for idx, q in enumerate(g7):
    if 'Đáp án trắc nghiệm' in q['extra']:
        ex = q['extra']; k = ex.index('ĐA')
        letters = [x for x in ex[k+1:k+11]]
        assert all(l in 'ABCD' for l in letters), letters
        targets = g7[idx-9: idx+1]
        assert len(targets) == 10
        for t, l in zip(targets, letters):
            t['answer'] = 'ABCD'.index(l); t['how'] = 'table'
        q['extra'] = []
json.dump(questions, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('after g7:', Counter(q['how'] for q in questions))
