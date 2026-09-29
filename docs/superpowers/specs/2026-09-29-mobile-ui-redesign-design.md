# Mobile-first UI Redesign — Design Spec

- **Ngày:** 2026-09-29
- **Trạng thái:** Chờ review
- **Phạm vi:** Làm lại giao diện web (M1) — không thêm tính năng M5 (ngân sách, mục tiêu).
- **Liên quan:** `docs/superpowers/specs/2026-09-29-family-finance-design.md`

## 1. Vấn đề & mục tiêu

Sau khi dùng thử M1, ba điểm đau chính:

1. **Nhập giao dịch chậm** — phải mở khung, form dài, dropdown danh mục dài.
2. **Thiếu tổng quan** — vào là danh sách thô, không thấy chi theo danh mục / so với tháng trước.
3. **Không hợp điện thoại** — bố cục chật, nút nhỏ, không dùng như app.

### Tiêu chí thành công

- Một khoản chi nhập xong trong **< 5 giây, một tay** trên điện thoại (mở +, gõ số, chạm danh mục, Lưu).
- Mở app thấy ngay **tổng chi tháng, chi theo danh mục, so với tháng trước**.
- Mọi màn hình dùng tốt ở **375px** (không cuộn ngang, vùng chạm ≥ 44px) và giãn hợp lý trên desktop.
- Cài được lên màn hình chính (PWA) và mở toàn màn hình.

## 2. Quyết định đã chốt (từ brainstorming)

| Chủ đề | Quyết định |
|---|---|
| Bố cục | **Thanh tab dưới + nút “+” nổi ở giữa** (kiểu app ngân hàng/MoMo); desktop: sidebar trái |
| Nhập nhanh | **Lai**: ô số tiền hiểu “45k/1tr2” + chip số tiền + lưới 8 danh mục hay dùng + mô tả + pill tài khoản/thời gian |
| Danh sách giao dịch | **Nhóm theo ngày**, tổng mỗi ngày, bộ lọc dạng chip, chạm dòng → khung sửa |
| Phạm vi | Chỉ giao diện; tab 4 là **Tài khoản**; ngân sách/mục tiêu để M5 |
| Công nghệ UI | **shadcn/ui** (Radix + Tailwind, style new-york, icon lucide) như `reader`; Drawer (vaul) cho bottom sheet; toast bằng sonner; biểu đồ bằng thanh CSS |

## 3. Màn hình & điều hướng

### App shell (`/g/[groupId]/…`)

- **Điện thoại (< md):** header mảnh (tên nhóm) + **BottomNav**: `Tổng quan · Giao dịch · [ + ] · Tài khoản · Thêm`. Nút + nổi, có trên mọi trang, mở **QuickAdd**. Tôn trọng `safe-area-inset-bottom`.
- **Desktop (≥ md):** **SideNav** trái cùng các mục; nút “Thêm giao dịch”; bottom sheet hiển thị dạng Dialog giữa màn hình.
- `/` → `/g/<default>/overview` (hoặc `/onboarding` nếu chưa có nhóm).
- Routes: `overview`, `transactions`, `accounts`, `more`, `more/categories`, `more/group`.

### Tổng quan (`overview`)

- **MonthSwitcher** `‹ Tháng 9/2026 ›` (tháng lưu trong query `?month=YYYY-MM`, mặc định tháng hiện tại giờ VN).
- **KPI card:** Đã chi (kèm “▲/▼ x% so với tháng trước”; không có dữ liệu tháng trước thì ẩn %), Đã thu, Chênh lệch (thu − chi).
- **Chi theo danh mục:** thanh ngang theo tỉ lệ trên tổng chi, top 6 + “Xem tất cả” (mở rộng tại chỗ). “Chưa phân loại” là một dòng riêng nếu có. Chạm danh mục → `transactions?month=…&category_id=…` (hoặc `uncategorized=1`).
- **Nhắc phân loại:** “❔ N giao dịch chưa phân loại” → `transactions?uncategorized=1`.
- **Gần đây:** 5 giao dịch mới nhất (theo thời gian, trong tháng đang xem) dạng `TransactionRow`; chạm → khung sửa.
- **Trạng thái rỗng:** “Chưa có giao dịch tháng này — bấm + để thêm”.

### Giao dịch (`transactions`)

- Ô tìm kiếm (submit cập nhật `?q=`), **chip lọc**: Tháng, Tài khoản, Danh mục, Chưa phân loại. Chip đang có giá trị hiển thị giá trị + nút ✕ xoá lọc. Chọn giá trị qua Drawer/Popover.
- Dải tổng: Chi / Thu / số giao dịch (từ API list hiện có).
- Danh sách **nhóm theo ngày giờ VN**: tiêu đề “Hôm nay · T2 29/09”, “Hôm qua · …”, còn lại “T4 24/09”; bên phải tổng ngày (bỏ chuyển nội bộ).
- `TransactionRow`: icon danh mục trong vòng tròn, mô tả (hoặc tên danh mục nếu trống), dòng phụ “Danh mục · Tài khoản · HH:mm”, số tiền (đỏ chi, xanh thu; chuyển nội bộ màu xám + nhãn “Chuyển nội bộ”).
- Phân trang: 50/lần, nút “Xem thêm” (tăng `limit` qua query, tối đa 200 theo API; hiển thị “Đang hiện X/Y” khi bị giới hạn).
- Chạm dòng → **TransactionSheet** chế độ sửa: cùng form với QuickAdd, thêm nút **Xoá** → **ConfirmDialog** (“Xoá giao dịch −45.000 đ?”).

### QuickAdd / TransactionSheet

- Segmented **Chi | Thu** (đổi loại lọc lại lưới danh mục; bỏ chọn danh mục không cùng loại).
- **AmountInput:** `inputMode="decimal"`, tự focus khi mở, hiển thị “= 45.000 đ” ngay khi `parseVnd` hiểu được; không hiểu → viền đỏ “Số tiền không hợp lệ” khi Lưu.
- **Chip số tiền:** 20k, 50k, 100k, 200k, 500k (chạm = đặt số tiền).
- **CategoryGrid:** 8 danh mục gợi ý theo loại (từ `/suggestions`) + ô “Khác…” mở **CategoryPicker** (toàn bộ danh mục chưa lưu trữ, có tìm kiếm). Danh mục chọn từ picker hiển thị thay chỗ ô cuối của lưới.
- **Mô tả** (tuỳ chọn), **pill Tài khoản** (mặc định `last_account_id`, nếu không có thì tài khoản đầu tiên chưa lưu trữ) → **AccountPicker**; **pill Thời gian** (mặc định bây giờ) → input `datetime-local`.
- Chế độ sửa hiện thêm **Ghi chú**.
- **Lưu:** tạo → đóng sheet, toast “Đã lưu −45.000 đ · 🍜 Ăn uống” + **Hoàn tác** (xoá giao dịch vừa tạo). Sửa → chỉ gửi trường thay đổi (`changedFields`); không đổi gì → đóng sheet, không gọi API.
- Lỗi API hiện ngay trong sheet, không đóng sheet.
- Không có tài khoản nào → sheet hiện “Thêm tài khoản trước” + nút tới tab Tài khoản.

### Tài khoản (`accounts`)

- Danh sách thẻ: icon theo loại (🏦 bank, 👛 ewallet, 💵 cash, 💳 credit), tên, provider; nhóm “Đã lưu trữ” thu gọn ở cuối.
- Nút “Thêm tài khoản” → Drawer (tên, loại dạng segmented, provider tuỳ chọn). Chạm thẻ → Drawer sửa (tên, loại, provider, Lưu trữ/Khôi phục).

### Thêm (`more`)

- Danh sách: **Danh mục** (`more/categories`), **Nhóm & thành viên** (`more/group`), **Đăng xuất**.
- `more/categories`: tab Chi/Thu, lưới icon+tên; chạm → Drawer sửa (icon, tên, Ẩn/Khôi phục); nút “Thêm danh mục”.
- `more/group`: thành viên; chủ nhóm có “Tạo link mời” + nút **Sao chép** (toast “Đã sao chép”).

### Đăng nhập & Onboarding

- Login: logo/tên app, câu mô tả ngắn, nút Google lớn; thông báo lỗi rõ ràng.
- Onboarding: tên nhóm + **chip tài khoản hay dùng** (Tiền mặt, TPBank, MoMo, ZaloPay, ShopeePay, HSBC — chọn nhiều) → tạo nhóm rồi tạo các tài khoản đã chọn (loại/provider điền sẵn) → vào Tổng quan.

### PWA

- `app/manifest.ts` (name “Family Finance”, short_name “Chi tiêu”, `display: standalone`, `start_url: /`, theme/background color), icon 192/512 + apple-touch-icon, `viewport` với `viewportFit: "cover"` và `themeColor`. Không service worker/offline ở đợt này.

## 4. Thiết kế hình ảnh

- Tailwind v4 + token của shadcn (CSS variables), màu nhấn **emerald**; chi = đỏ (`red-600`), thu = xanh (`emerald-600`), chuyển nội bộ = xám.
- Hỗ trợ **dark mode** theo hệ thống (`prefers-color-scheme`).
- Vùng chạm tối thiểu 44px; số tiền dùng `tabular-nums`; font hệ thống.

## 5. API bổ sung (chỉ đọc)

### `GET /groups/{group_id}/summary?month=YYYY-MM`

```json
{
  "month": "2026-09",
  "total_expense": -12450000, "total_income": 25000000,
  "prev_total_expense": -11000000, "prev_total_income": 25000000,
  "transaction_count": 86, "uncategorized_count": 3,
  "expense_by_category": [{"category_id": "…|null", "amount": -4200000, "count": 31}],
  "income_by_category":  [{"category_id": "…|null", "amount": 25000000, "count": 1}]
}
```

- Ranh giới tháng theo `Asia/Ho_Chi_Minh` (tái dùng `month_range`); tháng trước tính từ tháng hiện tại.
- **Bỏ qua `is_internal_transfer`** ở mọi con số; `uncategorized_count` và `transaction_count` cũng không tính chuyển nội bộ.
- `*_by_category` sắp xếp theo |amount| giảm dần; `category_id = null` cho chưa phân loại.
- Non-member → 404; `month` sai → 422.

### `GET /groups/{group_id}/suggestions`

```json
{"expense_category_ids": ["…"], "income_category_ids": ["…"], "last_account_id": "…|null"}
```

- Mỗi loại tối đa 8 danh mục, xếp theo số giao dịch trong **90 ngày gần nhất** (của cả nhóm), bỏ danh mục đã lưu trữ; thiếu thì bổ sung theo thứ tự tạo (thứ tự danh mục mặc định).
- `last_account_id`: tài khoản (chưa lưu trữ) của giao dịch **do chính người gọi tạo** gần nhất theo `created_at`; không có → `null`.
- Non-member → 404.

### PATCH giao dịch

Không đổi API. Web chỉ gửi các trường thay đổi, để `classified_by/status` chỉ bị đặt lại khi người dùng thực sự đổi danh mục.

## 6. Luồng dữ liệu phía web

- `app/g/[groupId]/layout.tsx` (server) tải `me`, `accounts`, `categories`, `suggestions` song song, render `AppShell` (client) với các dữ liệu này; `AppShell` sở hữu trạng thái mở/đóng QuickAdd và TransactionSheet sửa (qua context `useTransactionSheet()` để trang nào cũng mở được).
- Trang (server component) tải dữ liệu riêng: overview → `summary` + list `limit=5`; transactions → list theo filter.
- Ghi dữ liệu: server actions trả `ActionResult = { error?: string; id?: string }`; thành công → `revalidatePath` layout nhóm (`/g/[groupId]`, "layout") để Tổng quan, Giao dịch và gợi ý cùng làm mới.
- Hàm thuần mới (có test): `groupByVnDay(items)`, `vnDayLabel(date, now)`, `changedFields(initial, next)`, `shortVnd(amount)` (“4,2tr”, “45k” cho nhãn gọn).
- `apiFetch` chuyển về `/login?callbackUrl=<đường dẫn hiện tại>` khi hết phiên (đọc từ header `x-pathname` do `proxy.ts` gắn, hoặc caller truyền vào).

## 7. Kiểm thử

- **API (pytest):** summary — ranh giới tháng VN, loại chuyển nội bộ, tháng trước, dòng chưa phân loại, sắp xếp, 404/422; suggestions — thứ tự theo tần suất, cửa sổ 90 ngày, bổ sung mặc định, bỏ lưu trữ, `last_account_id` theo người gọi, 404.
- **Web (vitest + Testing Library):** `groupByVnDay` (23:30 VN ngày 30/09 thuộc 30/09), `vnDayLabel`, `changedFields`, `shortVnd`; TransactionSheet — chip đặt số tiền, lưới danh mục lọc theo Chi/Thu, tài khoản mặc định = last_account, lỗi hiện tại chỗ, sửa không đổi gì thì không gọi action, chỉ gửi trường đổi; ConfirmDialog trước khi xoá.
- **Kiểm tra bằng mắt:** chạy API + web local, đăng nhập bằng phiên thử do hai script chỉ-dành-cho-dev tạo, chỉ dùng DB và secret **local**, không nằm trong image production (`api/scripts` và `web/scripts` đều bị `.dockerignore` loại):
  1. `api/scripts/dev_session.py` — tạo (hoặc lấy) user thử `dev@example.com` trong DB local, seed một nhóm có vài tài khoản và giao dịch mẫu, in ra API JWT ký bằng `JWT_SECRET` local.
  2. `web/scripts/dev-session.mjs <api-jwt>` — mã hoá cookie next-auth (`next-auth.session-token`) bằng `NEXTAUTH_SECRET` local chứa `apiToken`, in ra giá trị cookie để đặt vào trình duyệt kiểm thử.
  Chụp ảnh các trang ở 375×812 và 1280×800, sáng/tối.

## 8. Ngoài phạm vi

Ngân sách, mục tiêu, biểu đồ theo thời gian, offline/service worker, app Flutter, sửa hàng loạt, kéo-vuốt để xoá.
