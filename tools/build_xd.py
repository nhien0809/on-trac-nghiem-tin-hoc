"""Tạo data/extra.js từ Tong_hop_cau_hoi_xd.docx (bộ câu hỏi tổng hợp của nhóm 1 và nhóm 3).

Chạy:  python tools/build_xd.py <đường dẫn Tong_hop_cau_hoi_xd.docx> data/extra.js

File sinh ra thêm một mục ôn ("Bộ tổng hợp XD") vào window.QUIZ_DATA, nên không cần chạy lại build.py.
"""
import json, re, sys
import docx

SRC, OUT = sys.argv[1], sys.argv[2]

GROUP = re.compile(r'^\(?\s*nhóm\s*(\d+)\s*\)?$', re.I)
LEVEL_HEAD = re.compile(r'^(Mức\s*(\d)|Level\s*(\d))\b', re.I)
STEM = re.compile(r'^(?:Câu|Question)\s*(\d+)\s*(?:\(([^)]*)\))?\s*[\.:]\s*', re.I)
OPT = re.compile(r'^([A-D])\s*[\.\)]\s*')
ANS = re.compile(r'^(?:Đáp\s*án(?:\s*đúng)?|Answer)\s*:?\s*([A-D])\b', re.I)
LV = {'1': 'NB', '2': 'TH', '3': 'VD'}
LV_WORD = {'remember': 'NB', 'understand': 'TH', 'apply': 'VD', 'nhận biết': 'NB', 'thông hiểu': 'TH', 'vận dụng': 'VD'}


def clean(s):
    s = s.replace(' ', ' ').strip()
    # Mũi tên trong tài liệu gốc bị mất (chỉ còn 2 dấu cách): "... học tập  Năng lực ..." -> "... học tập → Năng lực ..."
    s = re.sub(r'(\S) {2,}(Năng lực)', r'\1 → \2', s)
    return re.sub(r'\s+', ' ', s)


paras = [clean(p.text) for p in docx.Document(SRC).paragraphs if p.text.strip()]
items, cur, group, level = [], None, None, ''
for t in paras:
    m = GROUP.match(t)
    if m:
        group = int(m.group(1)); continue
    m = LEVEL_HEAD.match(t)
    if m:
        level = LV[m.group(2) or m.group(3)]; continue
    m = STEM.match(t)
    if m:
        lv = level
        if m.group(2):
            lv = LV_WORD.get(m.group(2).strip().lower(), lv)
        cur = dict(group=group, num=int(m.group(1)), level=lv, q=t[m.end():].strip(), options=[], answer=None)
        items.append(cur); continue
    if cur is None:
        continue
    m = ANS.match(t)
    if m:
        cur['answer'] = 'ABCD'.index(m.group(1).upper()); continue
    m = OPT.match(t)
    if m and len(cur['options']) < 4:
        cur['options'].append(t[m.end():].strip())

for it in items:
    assert it['group'] and len(it['options']) == 4 and it['answer'] is not None and it['level'], it

WEEK_ID = 'xd'
questions = []
for i, it in enumerate(items):
    questions.append(dict(id=f'{WEEK_ID}-{i + 1:03d}', week=WEEK_ID, level=it['level'], q=it['q'],
                          options=it['options'], answer=it['answer'], sources=[it['group']]))
ids = [q['id'] for q in questions]
week = dict(id=WEEK_ID, label='Bộ tổng hợp XD', tag='Bộ', short='XD',
            title='Câu hỏi tổng hợp (nhóm 1, nhóm 3): yêu cầu cần đạt, năng lực, đánh giá và kế hoạch dạy học',
            count=len(ids), ids=ids, tests=[ids[k:k + 20] for k in range(0, len(ids), 20)])

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Sinh tự động từ Tong_hop_cau_hoi_xd.docx bằng tools/build_xd.py — không sửa tay.\n')
    f.write('(function (D, extra) {\n'
            '  if (!D) return;\n'
            '  D.weeks.push(extra.week);\n'
            '  Array.prototype.push.apply(D.questions, extra.questions);\n'
            '  D.meta.rawCount += extra.questions.length;\n'
            '})(window.QUIZ_DATA, ')
    json.dump(dict(week=week, questions=questions), f, ensure_ascii=False, separators=(',', ':'))
    f.write(');\n')
print(len(questions), 'câu:', [(q['id'], q['level'], q['sources'][0]) for q in questions])
