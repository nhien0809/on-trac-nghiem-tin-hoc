# Ôn trắc nghiệm Tin học GDPT 2018

Trang web ôn tập trắc nghiệm theo tuần cho học phần *Phân tích chương trình và xây dựng kế hoạch dạy học môn Tin học (GDPT 2018)*, tổng hợp từ tài liệu Word của 11 nhóm.

- **516** câu trong tài liệu gốc → **481** câu sau khi gộp câu trùng (mỗi câu ghi rõ các nhóm nguồn).
- Chia theo tuần: Tuần 1–2, 3, 4, 5, 6, 7. Mỗi tuần chia thành các đề ≤ 20 câu; làm hết các đề là đủ mọi câu của tuần.
- Chế độ **Luyện tập** (biết đáp án ngay) hoặc **Thi thử** (chấm khi nộp bài), xáo trộn câu/đáp án, làm lại câu sai.
- **Ngân hàng câu hỏi**: tra cứu toàn bộ câu kèm đáp án, lọc theo tuần và mức độ.

Trang tĩnh (HTML/CSS/JS thuần), không cần build. Chạy thử: `python -m http.server` trong thư mục này.

## Tạo lại dữ liệu

`tools/` chứa các script đã dùng để đọc file `TracNhiemNhom*.docx` (cần `python-docx`):

1. `parse.py <thư mục docx> paras.json` — đọc đoạn văn + định dạng (tô màu, in đậm, gạch chân).
2. `extract.py paras.json q.json` — tách câu hỏi/phương án/đáp án (dòng "Đáp án", tô màu, in đậm, bảng đáp án).
3. `dedup.py x` — gom câu trùng (so khớp nội dung câu hỏi + phương án), dùng `manual_week.json`, `manual_ans.json`.
4. `build.py data/questions.js` — xuất dữ liệu cho trang.
