# Shop drawing thép cột

Tiện ích web nhập số liệu **cột bê tông cốt thép** (tầng, tiết diện, bố trí thép dọc/đai) rồi xuất **PDF shop drawing** khổ A0, gồm:

- Mặt đứng từng cột theo tầng, cao độ, vùng đai `a100 / a200`
- Mặt cắt tiết diện (HCN / tròn) với thép dọc và đai chính
- **Bảng thống kê cốt thép**, tổng hợp theo Ø, cây 11.7 m và số đai

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
3. Nhấp ô cột trên mặt đứng để **bố trí thép** (số thanh cạnh Cx/Cy, Ø thép chủ, Ø đai). Tick *Sử dụng cốt thép đã bố trí cho các tầng trên* nếu muốn copy lên tầng trên.
4. **Đai C** — tick bố trí Cx/Cy (cạnh lẻ). **Đai lồng** cùng bố cục, chỉ khi Cx/Cy ≥ 4 thanh; cạnh ngắn bo ngoài 2, 3, 4… sắt chủ giữa. Đai lồng và đai nhánh không dùng đồng thời; đai nhánh thì bỏ đai đơn.
5. **Draw / Xuất PDF** — tải `output.pdf`.

Dữ liệu lưu tự động trên trình duyệt (`localStorage`). **New** khôi phục bộ mẫu 3 tầng / 5 cột (BT1, C3, C4, C2, C1) khớp file PDF tham chiếu.

Trọng lượng tính theo `d² / 162.2` (kg/m). Nối thép dọc chọn 30D / 35D / 40D tại chân cột hoặc giữa cột (chiều dài nối = n × Ø). Tầng mái bẻ móc 10d.

## Xuất GitHub Pages

```bash
npm run build
```

Thư mục `docs/` là site tĩnh cho GitHub Pages.
