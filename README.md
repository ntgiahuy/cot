# Shop drawing thép cột

Tiện ích web nhập số liệu **cột bê tông cốt thép** (tầng, tiết diện, bố trí thép dọc/đai) rồi xuất **PDF shop drawing** khổ **A1 ngang**, gồm:

- **Một trang duy nhất**: tất cả cột + chi tiết + bảng thống kê cốt thép
- Mặt đứng từng cột (tầng xếp dọc): vùng đai `a100 / a200`, dầm nét đứt, nối so le, cao độ
- Mặt cắt tiết diện (HCN / tròn) với thép dọc và đai
- **Bảng thống kê cốt thép** cùng trang, tổng hợp theo Ø, cây 11.7 m và số đai

Giao diện bám theo tiện ích desktop shop drawing cột / dầm (nền tối, hộp thoại tầng – cột – thép).

## Chạy local

```bash
npm install
npm run dev
```

Mặc định: [http://127.0.0.1:43123/](http://127.0.0.1:43123/)

## Cách dùng

1. **Tầng** — nhập số tầng, chiều cao tầng, chiều cao dầm.
2. **Add / Edit** — khai báo tên cột, số lượng, Cx × Cy, phạm vi tầng.
3. Nhấp ô cột trên mặt đứng để **bố trí thép** (số thanh cạnh Cx/Cy từ 2 đến 100; Ø 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 55). Tick *Sử dụng cốt thép đã bố trí cho các tầng trên* nếu muốn copy lên tầng trên.
4. **Đai bổ sung** — **Đai C** tick bố trí Cx/Cy (cạnh lẻ). **Đai lồng** cùng bố cục, chỉ khi Cx/Cy ≥ 4 thanh. Số cây ôm = 1/3 số thép mặt đó (làm tròn lên, tối thiểu 2). Cạnh ngắn = `n×Ø + (n−1)×hở`. **Đai kép** cùng form Cx/Cy; cạnh ngắn ôm ≥ 2/3 số thép chủ phương đó, tính từ mặt ngoài hai thanh góc của nhóm. Đai lồng và đai kép không dùng đồng thời; đai kép thì bỏ đai đơn.
5. **Draw / Xuất PDF** — tải `output.pdf`.

Dữ liệu lưu tự động trên trình duyệt (`localStorage`). **New** khôi phục bộ mẫu 3 tầng / 5 cột (BT1, C3, C4, C2, C1) khớp file PDF tham chiếu.

Trọng lượng tính theo `d² / 162.2` (kg/m). **Nối so le** chỉ chọn một: chân cột (50% nD / 50% 2nD) hoặc giữa cột (vị trí (H tầng − H dầm)/2; 50% tại đó, 50% lệch thêm nD). Tầng mái bẻ móc 10d.

## Xuất GitHub Pages

```bash
npm run build
```

Thư mục `docs/` là site tĩnh cho GitHub Pages.
