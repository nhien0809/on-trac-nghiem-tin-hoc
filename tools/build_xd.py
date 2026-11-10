"""Tạo data/extra.js từ tài liệu "Tong_hop_cau_hoi_xd" (Google Doc, mỗi tab một tuần).

Chạy:  python tools/build_xd.py tools/src/xd_doc.txt data/extra.js

tools/src/xd_doc.txt là bản văn bản của Google Doc; mỗi tab bắt đầu bằng dòng "# Tuan N".
Mỗi tuần thành một mục ôn riêng ("Tổng hợp XD · Tuần N") được thêm vào window.QUIZ_DATA,
nên không cần chạy lại build.py.
Mã câu của Tuần 3 giữ nguyên (xd-001…xd-009, mục 'xd') để không mất lịch sử/giải thích cũ;
các tuần sau dùng mục 'xdN' và mã 'xdN-001'….
"""
import json, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]

WEEK = re.compile(r'^#\s*Tuan\s*(\d+)\s*$', re.I)
GROUP = re.compile(r'^\(?\s*nhóm\s*(\d+)\s*\)?$', re.I)
LEVEL_HEAD = re.compile(r'^(?:Mức\s*(\d)|Level\s*(\d|I{1,3})\b|(\d)\.\s*(?:Knowledge|Comprehension|Application)\b)', re.I)
STEM = re.compile(r'^(?:Câu|Question)\s*(\d+)\s*(?:\(([^)]*)\))?\s*[\.:]\s*', re.I)
OPT = re.compile(r'^([A-D])\s*[\.\)]\s*')
ANS = re.compile(r'^(?:Đáp\s*án(?:\s*đúng)?|Answer)\s*:?\s*([A-D])\b', re.I)
LV = {'1': 'NB', '2': 'TH', '3': 'VD', 'I': 'NB', 'II': 'TH', 'III': 'VD'}
LV_WORD = {'remember': 'NB', 'understand': 'TH', 'apply': 'VD', 'nhận biết': 'NB', 'thông hiểu': 'TH', 'vận dụng': 'VD'}

# Câu thiếu đáp án trong tài liệu gốc: (tuần, nhóm, số câu) -> (đáp án, ghi chú hiện cho người học)
MISSING = {
    (4, 1, 3): ('B', 'Tài liệu gốc không ghi đáp án câu này; đáp án ở đây được suy ra từ chương trình môn Tin học 2018.'),
}

# Tuần 4 nhóm 1 đặt câu 8–10 dưới tiêu đề "Level 1" nhưng theo cách đánh số chung (1–3 NB, 4–7 TH, 8–10 VD) là câu vận dụng.
LEVEL_FIX = {(4, 1, 8): 'VD', (4, 1, 9): 'VD', (4, 1, 10): 'VD'}


def clean(s):
    s = s.replace(' ', ' ').strip()
    # Mũi tên trong tài liệu gốc bị mất (chỉ còn 2 dấu cách): "... học tập  Năng lực ..." -> "... học tập → Năng lực ..."
    s = re.sub(r'(\S) {2,}(Năng lực)', r'\1 → \2', s)
    return re.sub(r'[ \t]+', ' ', s)


with open(SRC, encoding='utf-8') as f:
    lines = [clean(l) for l in f if l.strip()]

items, cur, week, group, level = [], None, None, None, ''
for t in lines:
    m = WEEK.match(t)
    if m:
        week, group, level, cur = int(m.group(1)), None, '', None; continue
    if t.startswith('#') or week is None:
        continue
    m = GROUP.match(t)
    if m:
        group, level, cur = int(m.group(1)), '', None; continue
    m = LEVEL_HEAD.match(t)
    if m:
        level = LV[(m.group(1) or m.group(2) or m.group(3)).upper()]; cur = None; continue
    m = STEM.match(t)
    if m:
        lv = level
        if m.group(2):
            lv = LV_WORD.get(m.group(2).strip().lower(), lv)
        cur = dict(week=week, group=group, num=int(m.group(1)), level=lv, q=t[m.end():].strip(),
                   options=[], answer=None, note=None)
        items.append(cur); continue
    if cur is None:
        continue
    m = ANS.match(t)
    if m:
        cur['answer'] = 'ABCD'.index(m.group(1).upper()); continue
    m = OPT.match(t)
    if m and len(cur['options']) < 4:
        cur['options'].append(t[m.end():].strip()); continue
    if not cur['options']:
        cur['q'] += '\n' + t  # dòng phụ của đề (vd. danh sách bước (1)…(4))

for it in items:
    if it['answer'] is None and (it['week'], it['group'], it['num']) in MISSING:
        a, note = MISSING[(it['week'], it['group'], it['num'])]
        it['answer'], it['note'] = 'ABCD'.index(a), note
    it['level'] = LEVEL_FIX.get((it['week'], it['group'], it['num']), it['level'])
    assert len(it['options']) == 4 and it['answer'] is not None and it['level'], it

# Chủ đề của từng tuần (giống tên tuần ở bộ câu hỏi chính).
TOPIC = {3: 'Yêu cầu cần đạt về phẩm chất, năng lực và nội dung giáo dục',
         4: 'Phương pháp giáo dục và đánh giá kết quả giáo dục',
         5: 'Xây dựng kế hoạch giáo dục nhà trường',
         6: 'Xây dựng kế hoạch giáo dục của tổ chuyên môn',
         7: 'Xây dựng kế hoạch bài dạy'}

weeks, questions = [], []
for wn in sorted({it['week'] for it in items}):
    wid = 'xd' if wn == 3 else f'xd{wn}'
    prefix = 'xd' if wn == 3 else f'xd{wn}'
    ws = [it for it in items if it['week'] == wn]
    ids = []
    for i, it in enumerate(ws):
        q = dict(id=f'{prefix}-{i + 1:03d}', week=wid, level=it['level'], q=it['q'], options=it['options'],
                 answer=it['answer'], sources=[it['group']] if it['group'] else [])
        if it['note']:
            q['note'] = it['note']
        questions.append(q); ids.append(q['id'])
    groups = sorted({it['group'] for it in ws if it['group']})
    by = ('nhóm ' + ', '.join(map(str, groups))) if groups else 'tài liệu tổng hợp'
    weeks.append(dict(id=wid, label=f'Tổng hợp XD · Tuần {wn}', tag='XD', short=str(wn),
                      title=f'{TOPIC.get(wn, "Câu hỏi tổng hợp")} · câu hỏi tổng hợp ({by})',
                      count=len(ids), ids=ids, tests=[ids[k:k + 20] for k in range(0, len(ids), 20)]))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Sinh tự động từ tools/src/xd_doc.txt bằng tools/build_xd.py — không sửa tay.\n')
    f.write('(function (D, extra) {\n'
            '  if (!D) return;\n'
            '  Array.prototype.push.apply(D.weeks, extra.weeks);\n'
            '  Array.prototype.push.apply(D.questions, extra.questions);\n'
            '  D.meta.rawCount += extra.questions.length;\n'
            '})(window.QUIZ_DATA, ')
    json.dump(dict(weeks=weeks, questions=questions), f, ensure_ascii=False, separators=(',', ':'))
    f.write(');\n')
for w in weeks:
    print(w['id'], w['count'], [(q['id'], q['level'], q['sources'], 'ABCD'[q['answer']]) for q in questions if q['week'] == w['id']])
print('Tổng', len(questions), 'câu')
