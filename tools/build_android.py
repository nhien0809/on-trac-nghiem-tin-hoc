"""Tạo data/android.js: mục ôn "Lập trình Android" (4 tuần) từ tools/src/android_doc.txt.

Chạy:  python tools/build_android.py tools/src/android_doc.txt data/android.js

Định dạng nguồn: dòng "# Tuan N" mở đầu mỗi tuần; mỗi câu gồm "Câu k. <đề>" (có thể nhiều dòng,
vd. đoạn code), 4 dòng "A. … D. …" và "Answer: X". Số câu trong nguồn chỉ để dễ đối chiếu.
Câu trùng (cùng đề + cùng tập phương án) chỉ giữ lần xuất hiện đầu tiên.
Tài liệu gốc không chia mức độ, nên mức độ được gán gần đúng theo dạng câu hỏi.
"""
import json, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
WEEK = re.compile(r'^#\s*Tuan\s*(\d+)\s*$', re.I)
STEM = re.compile(r'^Câu\s*\d+\s*[\.:]\s*')
OPT = re.compile(r'^([A-D])\s*[\.\)]\s')
ANS = re.compile(r'^Answer\s*:\s*([A-D])\b')

items, cur, week = [], None, None
with open(SRC, encoding='utf-8') as f:
    for raw in f:
        line = raw.rstrip('\n')
        t = line.strip()
        if not t:
            continue
        m = WEEK.match(t)
        if m:
            week, cur = int(m.group(1)), None; continue
        if t.startswith('#') or week is None:
            continue
        m = STEM.match(t)
        if m:
            cur = dict(week=week, q=t[m.end():], options=[], answer=None)
            items.append(cur); continue
        if cur is None:
            continue
        m = ANS.match(t)
        if m:
            cur['answer'] = 'ABCD'.index(m.group(1)); continue
        m = OPT.match(t)
        if m and len(cur['options']) < 4:
            cur['options'].append(t[m.end():].strip()); continue
        if not cur['options']:
            if line.startswith('    '):  # dòng code (thụt 4 dấu cách trong nguồn) -> trường code riêng, giữ thụt lề
                cur['code'] = (cur.get('code', '') + '\n' + line[4:]).lstrip('\n')
            else:
                cur['q'] += '\n' + t

for it in items:
    assert len(it['options']) == 4 and it['answer'] is not None, it


def norm(s):
    return re.sub(r'\W+', ' ', s.lower()).strip()


seen, uniq = set(), []
for it in items:
    k = (norm(it['q'].split('\n')[0]), tuple(sorted(norm(o) for o in it['options'])))
    if k in seen:
        continue
    seen.add(k); uniq.append(it)


def level(q, code=None):
    first = q.split('\n')[0]
    if code or re.match(r'^(Trong ứng dụng|Trong cửa sổ|Trong ví dụ|Khi sử dụng)', first) or 'To-do-list' in first or 'công việc' in first:
        return 'VD'
    if re.search(r'\b(ĐÚNG|SAI)\b', first) or 'vai trò' in first or 'có tác dụng' in first:
        return 'TH'
    return 'NB'


TOPIC = {1: 'Tổng quan Android, Android Studio và cấu trúc project',
         2: 'View, Layout và các thành phần giao diện cơ bản',
         3: 'ListView, ArrayAdapter và AlertDialog',
         4: 'Custom Adapter, tìm kiếm, menu và ứng dụng quản lý công việc'}
ORDER = {'NB': 0, 'TH': 1, 'VD': 2}
weeks, questions = [], []
for wn in sorted({it['week'] for it in uniq}):
    wid = f'and{wn}'
    ws = sorted([it for it in uniq if it['week'] == wn], key=lambda it: ORDER[level(it['q'], it.get('code'))])
    ids = []
    for i, it in enumerate(ws):
        q = dict(id=f'{wid}-{i + 1:03d}', week=wid, level=level(it['q'], it.get('code')), q=it['q'], options=it['options'],
                 answer=it['answer'], sources=[])
        if it.get('code'):
            q['code'] = it['code']
        questions.append(q); ids.append(q['id'])
    n = len(ids); k = -(-n // 20)  # số đề, mỗi đề tối đa 20 câu, chia đều
    tests = [ids[round(j * n / k):round((j + 1) * n / k)] for j in range(k)]
    weeks.append(dict(id=wid, label=f'Lập trình Android · Tuần {wn}', tag='Android', short=str(wn),
                      section='Lập trình Android', title=TOPIC.get(wn, f'Tuần {wn}'),
                      count=n, ids=ids, tests=tests))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Sinh tự động từ tools/src/android_doc.txt bằng tools/build_android.py — không sửa tay.\n')
    f.write('(function (D, extra) {\n'
            '  if (!D) return;\n'
            '  Array.prototype.push.apply(D.weeks, extra.weeks);\n'
            '  Array.prototype.push.apply(D.questions, extra.questions);\n'
            '  D.meta.rawCount += extra.raw;\n'
            '})(window.QUIZ_DATA, ')
    json.dump(dict(weeks=weeks, questions=questions, raw=len(items)), f, ensure_ascii=False, separators=(',', ':'))
    f.write(');\n')
print('nguồn', len(items), 'câu; sau khi bỏ trùng', len(uniq))
for w in weeks:
    lv = [q['level'] for q in questions if q['week'] == w['id']]
    print(w['id'], w['count'], 'đề', [len(t) for t in w['tests']], {x: lv.count(x) for x in 'NB TH VD'.split()})
