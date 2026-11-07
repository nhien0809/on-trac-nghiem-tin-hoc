import json, re, sys
from collections import Counter
Q = {f"{q['group']}:{q['src']}": q for q in json.load(open('q.json', encoding='utf-8'))}
C = json.load(open('clusters.json', encoding='utf-8'))
W = json.load(open('manual_week.json', encoding='utf-8'))
A = json.load(open('manual_ans.json', encoding='utf-8'))
OUT = sys.argv[1]

# extra manual merges (same question, options reworded)
MERGE = [('6:48', '6:79'), ('8:6', '8:42'), ('1:197', '1:242')]
cid = {k: i for i, c in enumerate(C) for k in c}
for a, b in MERGE:
    ia, ib = cid[a], cid[b]
    if ia == ib: continue
    C[ia] += C[ib]; C[ib] = []
    for k in C[ia]: cid[k] = ia
C = [c for c in C if c]

SUGGESTED = {'9:8', '9:19', '9:111', '9:116', '9:127', '9:145', '2:66'}

def week_of(q, key):
    if key in W: return W[key]
    s = q['section'].upper()
    m = re.match(r'\s*TUẦN\s*(\d+)', s)
    if m:
        w = int(m.group(1)); return 1 if w <= 2 else w
    for kw, w in [('BÀI DẠY', 7), ('KHBD', 7), ('BÀI 4', 7), ('TỔ CHUYÊN MÔN', 6), ('NHÀ TRƯỜNG', 5),
                  ('PHƯƠNG PHÁP', 4), ('YÊU CẦU CẦN ĐẠT', 3), ('YCC', 3), ('MỤC TIÊU', 1), ('ĐẶC ĐIỂM', 1)]:
        if kw in s: return w
    return None

def clean(s):
    s = s.replace('\t', ' ').replace(' ', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'^\s*[\(\[]?\s*(Nhận\s*biết|Thông\s*hiểu|Vận\s*dụng|NB|TH|VD)\s*[\)\]]\s*:?\s*', '', s, flags=re.I)
    s = re.sub(r'^[:\.\-–]\s*', '', s)
    return s

def clean_opt(s):
    s = clean(s)
    return s

FIXED = re.compile(r'(cả\s+(hai|ba|bốn)?\s*(phương án|đáp án|ý)|tất cả (các )?(phương án|đáp án|ý)|\b[A-D]\s*(và|,)\s*[A-D]\b|phương án [A-D]\b|đáp án [A-D]\b|cả [A-D]\b)', re.I)

GRANK = {'line': 0, 'table': 0, 'hl': 1, 'bold': 2, 'ul': 2, 'manual': 3, 'hl-multi': 4, '': 9}
out = []
for c in C:
    qs = [Q[k] for k in c]
    for q in qs:
        k = f"{q['group']}:{q['src']}"
        if k in A: q['answer'] = A[k]; q['how'] = 'manual'
        q['key'] = k
        q['week'] = week_of(q, k)
    # representative: best answer evidence, 4 options, labelled section, longest stem
    rep = sorted(qs, key=lambda q: (GRANK.get(q['how'], 9) if q['answer'] is not None else 99,
                                     0 if len(q['opts']) == 4 else 1,
                                     0 if q['section'] else 1,
                                     -len(q['stem'])))[0]
    weeks = [q['week'] for q in qs if q['week']]
    # prefer week from explicitly labelled sources (section headings), else manual
    lab = [q['week'] for q in qs if q['section'] and q['week']]
    week = Counter(lab).most_common(1)[0][0] if lab else (Counter(weeks).most_common(1)[0][0] if weeks else None)
    levels = [q['level'] for q in qs if q['level']]
    level = rep['level'] or (Counter(levels).most_common(1)[0][0] if levels else '')
    assert rep['answer'] is not None, rep
    assert week, rep
    opts = [clean_opt(o) for o in rep['opts']]
    stem = clean(rep['stem'])
    note = None
    if rep['key'] in SUGGESTED and all(q['how'] == 'manual' for q in qs):
        note = 'Tài liệu gốc không ghi đáp án cho câu này; đáp án hiển thị là đáp án tham khảo.'
    out.append(dict(
        week=week, level=level, q=stem, options=opts, answer=rep['answer'],
        sources=sorted(set(q['group'] for q in qs)), keys=c,
        fixedOrder=bool(any(FIXED.search(o) for o in opts)),
        note=note))

# level fallback for G9 etc: infer from position-free heuristics -> leave '' if unknown
LV = {'NB': 0, 'TH': 1, 'VD': 2, '': 3}
WEEKS = [
    ('1', 'Tuần 1 – 2', 'Đặc điểm môn học, quan điểm xây dựng và mục tiêu chương trình'),
    ('3', 'Tuần 3', 'Yêu cầu cần đạt về phẩm chất, năng lực và nội dung giáo dục'),
    ('4', 'Tuần 4', 'Phương pháp giáo dục và đánh giá kết quả giáo dục'),
    ('5', 'Tuần 5', 'Xây dựng kế hoạch giáo dục nhà trường'),
    ('6', 'Tuần 6', 'Xây dựng kế hoạch giáo dục của tổ chuyên môn'),
    ('7', 'Tuần 7', 'Xây dựng kế hoạch bài dạy'),
]
questions = []
weeks = []
for wid, label, title in WEEKS:
    items = [q for q in out if str(q['week']) == wid]
    items.sort(key=lambda q: (LV[q['level']], q['sources'][0]))
    ids = []
    for i, q in enumerate(items):
        qid = f"w{wid}-{i + 1:03d}"
        ids.append(qid)
        rec = dict(id=qid, week=wid, level=q['level'], q=q['q'], options=q['options'], answer=q['answer'], sources=q['sources'])
        if q['fixedOrder']: rec['fixedOrder'] = True
        if q['note']: rec['note'] = q['note']
        questions.append(rec)
    # split into tests of <= 20, distributing levels round-robin so each test mixes NB/TH/VD
    n = len(ids)
    k = max(1, -(-n // 20))
    tests = [[] for _ in range(k)]
    for i, qid in enumerate(ids):
        tests[i % k].append(qid)
    weeks.append(dict(id=wid, label=label, title=title, count=n, ids=ids, tests=tests))

data = dict(meta=dict(rawCount=sum(len(c) for c in C), groups=len(set(q['group'] for q in Q.values()))),
            weeks=weeks, questions=questions)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Sinh tự động từ các file TracNhiemNhom*.docx — không sửa tay.\n')
    f.write('window.QUIZ_DATA = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('raw', data['meta']['rawCount'], 'unique', len(questions))
for w in weeks:
    print(w['label'], w['count'], [len(t) for t in w['tests']])
print('levels', Counter(q['level'] for q in questions))
print('fixedOrder', sum(1 for q in questions if q.get('fixedOrder')))
print('notes', sum(1 for q in questions if q.get('note')))
print('opt counts', Counter(len(q['options']) for q in questions))
json.dump(questions, open('final_questions.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
