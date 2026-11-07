import json, re, sys, unicodedata
from difflib import SequenceMatcher
Q = json.load(open('q.json', encoding='utf-8'))
MANUAL_WEEK = json.load(open('manual_week.json', encoding='utf-8')) if len(sys.argv) > 1 else {}
MANUAL_ANS = json.load(open('manual_ans.json', encoding='utf-8')) if len(sys.argv) > 1 else {}

def week_of(q):
    s = q['section'].upper()
    m = re.match(r'\s*TUẦN\s*(\d+)', s)
    if m:
        w = int(m.group(1)); return 1 if w <= 2 else w
    for kw, w in [('BÀI DẠY', 7), ('KHBD', 7), ('BÀI 4', 7), ('TỔ CHUYÊN MÔN', 6), ('NHÀ TRƯỜNG', 5),
                  ('PHƯƠNG PHÁP', 4), ('YÊU CẦU CẦN ĐẠT', 3), ('YCC', 3), ('MỤC TIÊU', 1), ('ĐẶC ĐIỂM', 1)]:
        if kw in s: return w
    return None

def norm(s):
    s = unicodedata.normalize('NFC', s).lower()
    s = re.sub(r'[“”"\'‘’\(\)\[\]\.,:;!?\-–…]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

for q in Q:
    key = f"{q['group']}:{q['src']}"
    q['key'] = key
    q['week'] = MANUAL_WEEK.get(key, week_of(q))
    if key in MANUAL_ANS:
        q['answer'] = MANUAL_ANS[key]; q['how'] = 'manual'
    q['n_stem'] = norm(q['stem'])
    q['n_opts'] = sorted(norm(o) for o in q['opts'])

def sim(a, b):
    return SequenceMatcher(None, a, b, autojunk=False).ratio()

def same(a, b):
    if abs(len(a['n_stem']) - len(b['n_stem'])) > 0.25 * max(len(a['n_stem']), len(b['n_stem'])) + 10:
        return False
    s = sim(a['n_stem'], b['n_stem'])
    if s < 0.85: return False
    o = sim(' | '.join(a['n_opts']), ' | '.join(b['n_opts']))
    return o >= 0.75

# union-find clusters
parent = list(range(len(Q)))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]; i = parent[i]
    return i
for i in range(len(Q)):
    for j in range(i + 1, len(Q)):
        if find(i) != find(j) and same(Q[i], Q[j]):
            parent[find(j)] = find(i)
clusters = {}
for i in range(len(Q)):
    clusters.setdefault(find(i), []).append(Q[i])
cl = list(clusters.values())
print('questions', len(Q), 'unique', len(cl))
json.dump([[q['key'] for q in c] for c in cl], open('clusters.json', 'w', encoding='utf-8'), ensure_ascii=False)

# report conflicts
def ans_text(q):
    return norm(q['opts'][q['answer']]) if q['answer'] is not None and q['answer'] < len(q['opts']) else None
conf = 0
for c in cl:
    ats = set(ans_text(q) for q in c if ans_text(q) is not None)
    if len(ats) > 1:
        # tolerate near-identical answer texts
        ats_l = list(ats)
        if all(sim(ats_l[0], x) > 0.8 for x in ats_l[1:]): continue
        conf += 1
        print('CONFLICT:', c[0]['stem'][:100])
        for q in c:
            print('   ', q['key'], 'ans=', 'ABCD'[q['answer']] if q['answer'] is not None else None, '|', (q['opts'][q['answer']][:80] if q['answer'] is not None else ''))
print('conflicts', conf)
weeks = set(q['week'] for c in cl for q in c)
nowk = [c for c in cl if all(q['week'] is None for q in c)]
print('clusters without week', len(nowk))
mixed = [c for c in cl if len(set(q['week'] for q in c if q['week'])) > 1]
print('clusters with mixed weeks', len(mixed))
for c in mixed:
    print('  MIXED', [(q['key'], q['week']) for q in c], c[0]['stem'][:80])
noans = [c for c in cl if all(q['answer'] is None for q in c)]
print('clusters without answer', len(noans))
for c in noans: print('  NOANS', [q['key'] for q in c], c[0]['stem'][:80])
with open('nowk.txt', 'w', encoding='utf-8') as f:
    for c in nowk:
        q = c[0]
        f.write(f"{'|'.join(x['key'] for x in c)} :: {q['stem'][:160]}\n")
