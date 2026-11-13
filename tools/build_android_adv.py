"""Tạo data/android_adv.js: mục "Lập trình Android nâng cao" từ tools/src/android_adv.txt.

Chạy:  python tools/build_android_adv.py tools/src/android_adv.txt data/android_adv.js

Nguồn ghi đáp án đúng ("+") trước; vị trí đáp án được trộn cố định theo mã câu để không luôn là A.
Giải thích ("=") được thêm vào window.QUIZ_EXPLAIN, nên file này phải nạp sau explanations.js.
"""
import json, random, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
sets, cur = [], None
for raw in open(SRC, encoding='utf-8'):
    line = raw.rstrip('\n')
    if not line.strip() or line.startswith('# '):
        continue
    m = re.match(r'^## Đề (\d+) \| (.+)$', line)
    if m:
        sets.append(dict(n=int(m.group(1)), title=m.group(2).strip(), qs=[])); continue
    m = re.match(r'^Câu \d+ \[(NB|TH|VD)\] (.+)$', line)
    if m:
        cur = dict(level=m.group(1), q=m.group(2), ok=None, bad=[], exp='')
        sets[-1]['qs'].append(cur); continue
    if line.startswith('    '):
        cur['code'] = (cur.get('code', '') + '\n' + line[4:]).lstrip('\n')
    elif line[:2] == '+ ':
        cur['ok'] = line[2:]
    elif line[:2] == '- ':
        cur['bad'].append(line[2:])
    elif line[:2] == '= ':
        cur['exp'] = line[2:]
    else:
        raise ValueError('Dòng không hiểu: ' + line)

questions, explain, tests = [], {}, []
for st in sets:
    wid, ids = f'adv{st["n"]}', []
    for i, it in enumerate(st['qs']):
        assert it['ok'] and len(it['bad']) == 3 and it['exp'], it
        qid = f'{wid}-{i + 1:03d}'
        opts = [it['ok']] + it['bad']
        random.Random(qid).shuffle(opts)
        q = dict(id=qid, week='adv', level=it['level'], q=it['q'], options=opts, answer=opts.index(it['ok']), sources=[])
        if it.get('code'):
            q['code'] = it['code']
        questions.append(q); ids.append(qid); explain[qid] = it['exp']
    tests.append(ids)
# Một bộ duy nhất, mỗi chủ đề là một đề (Đề 1, 2, 3…).
all_ids = [i for t in tests for i in t]
weeks = [dict(id='adv', label='Android nâng cao', tag='Nâng cao', short='★', section='Lập trình Android nâng cao',
              title=' · '.join(f'Đề {st["n"]}: {st["title"]}' for st in sets), count=len(all_ids), ids=all_ids, tests=tests)]

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Sinh tự động từ tools/src/android_adv.txt bằng tools/build_android_adv.py — không sửa tay.\n')
    f.write('(function (D, E, extra) {\n'
            '  if (!D) return;\n'
            '  Array.prototype.push.apply(D.weeks, extra.weeks);\n'
            '  Array.prototype.push.apply(D.questions, extra.questions);\n'
            '  D.meta.rawCount += extra.questions.length;\n'
            '  for (var k in extra.explain) E[k] = extra.explain[k];\n'
            '})(window.QUIZ_DATA, window.QUIZ_EXPLAIN = window.QUIZ_EXPLAIN || {}, ')
    json.dump(dict(weeks=weeks, questions=questions, explain=explain), f, ensure_ascii=False, separators=(',', ':'))
    f.write(');\n')
print(len(questions), 'câu;', [(w['id'], w['count']) for w in weeks],
      'đáp án:', {c: sum(1 for q in questions if q['answer'] == i) for i, c in enumerate('ABCD')})
