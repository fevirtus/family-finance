# Family Finance — Design Spec

- **Ngày:** 2026-09-29
- **Trạng thái:** Chờ review
- **Người dùng giai đoạn đầu:** chỉ chủ repo (1 user trong 1 nhóm family). Vợ tham gia sau.

## 1. Mục tiêu

Ứng dụng giúp gia đình theo dõi chi tiêu hàng tháng với **mức tự động cao nhất có thể** (không dùng dịch vụ trả phí theo giao dịch như SePay/Casso), đặt **mục tiêu tài chính** (mua xe, mua nhà…), theo dõi **subscription / hóa đơn định kỳ**, và mở rộng dần sang các tính năng gia đình khác và các nhóm chia tiền (billiard, nhà trọ).

### Tiêu chí thành công (sau ~1 tháng dùng)

- ≥80% giao dịch của chủ repo tự vào hệ thống (thông báo Android + sao kê) và tự được phân loại.
- Nhập tay 1 khoản qua Telegram < 10 giây.
- Xem được tổng chi tháng theo danh mục, tiến độ mục tiêu, và các khoản định kỳ sắp đến hạn.

### Ràng buộc

- Chạy trên homelab k3s, **stateless**; Postgres có sẵn bên ngoài cluster.
- Truy cập qua Cloudflare Tunnel, domain `*.fevirtus.dev`, ingress Traefik.
- Đăng nhập bằng Google OAuth.
- Phân loại AI dùng **DeepSeek** (qua adapter, đổi provider bằng env).
- Kênh nhập nhanh: **Telegram bot**.
- Có cả **web** (xem/chỉnh sửa) và **app Android** (Flutter).

## 2. Phạm vi

### Trong MVP (theo mốc, mỗi mốc dùng được ngay)

| Mốc | Nội dung |
|---|---|
| **M1 — Nền tảng** | FastAPI + Next.js, Google login, allowlist email, tạo nhóm family, link mời thành viên, quản lý tài khoản/ví, danh mục (bộ mặc định tiếng Việt), CRUD + lọc giao dịch trên web |
| **M2 — Telegram + AI** | Liên kết Telegram, nhập bằng chữ, nhập bằng ảnh, pipeline phân loại rule → LLM → hàng chờ xác nhận với inline button, lệnh `/thang`, `/muctieu`, `/chuaxacnhan` |
| **M3 — Import sao kê** | Upload xlsx/csv, map cột lưu theo tài khoản, khử trùng lặp, đối soát |
| **M4 — App Android** | Flutter (chỉ Android): Google login, NotificationListener cho whitelist app, hàng đợi offline, nhập nhanh, tổng quan tháng |
| **M5 — Kế hoạch** | Dashboard tháng, ngân sách theo danh mục, mục tiêu + dự báo, recurring items (tay + tự phát hiện), nhắc Telegram, báo cáo tuần/tháng |

### Ngoài MVP (làm sau, thiết kế không chặn)

- Ingest Gmail (email ngân hàng, hóa đơn subscription).
- iOS Shortcuts (Wallet transaction / Message automation), app iOS.
- Nhóm loại `split` (billiard, nhà trọ): chia tiền, công nợ giữa thành viên.
- Tài sản ròng, đầu tư.
- Tính năng gia đình khác: giấy tờ hết hạn, danh sách đi chợ…

## 3. Kiến trúc

```
Web (Next.js, next-auth Google) ─┐
Flutter Android app             ─┼──► finance-api (FastAPI, stateless, 2 replicas) ──► Postgres (db: finance)
Telegram (webhook)              ─┘       ├─ /auth/*            đổi Google ID token → API JWT
                                         ├─ /groups, /accounts, /categories, /transactions, /budgets, /goals, /recurring
                                         ├─ /imports           upload sao kê
                                         ├─ /ingest/notification   (device token)
                                         ├─ /webhooks/telegram     (secret header)
                                         └─ LLM adapter (DeepSeek text; provider riêng cho ảnh)
CronJobs (cùng image api, khác command):
  reprocess-pending (5 phút) · detect-recurring (hằng đêm) · due-reminders (hằng sáng) · reports (tuần/tháng)
```

Theo đúng pattern của project `reader`: Next.js + FastAPI (SQLAlchemy async, asyncpg, google-auth, python-jose) + Flutter, image GHCR, Secret `*-env`.

### Repo layout (monorepo)

```
family-finance/
  api/       FastAPI, uv, SQLAlchemy async, Alembic, pytest
  web/       Next.js (App Router), next-auth, Tailwind
  mobile/    Flutter (Android)
  deploy/    k8s manifests (namespace finance)
  docs/
  .github/workflows/   build theo path filter → ghcr.io/fevirtus/finance-api, finance-web; APK cho mobile
```

### Các module trong `api/` (mỗi module một trách nhiệm)

| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `auth` | Verify Google ID token, allowlist, cấp/verify JWT, device token | google-auth, jose |
| `groups` | Nhóm, thành viên, link mời; dependency `require_member(group_id)` | db |
| `ledger` | accounts, categories, transactions CRUD + query | db, groups |
| `ingest` | Nhận raw_event, dispatch parser, gọi pipeline | parsers, pipeline |
| `parsers` | Hàm thuần: `(source, payload) → ParsedTxn \| ParseError`, mỗi provider một file | không |
| `pipeline` | dedupe → internal transfer → classify → persist → notify | ledger, classify, notify |
| `classify` | rules lookup, gọi LLM, học rule từ xác nhận | llm, db |
| `llm` | Interface `LLMClient` (`classify`, `parse_quick_entry`, `parse_image`); impl DeepSeek, Fake | httpx |
| `telegram` | Webhook handler, lệnh, inline callbacks, gửi tin | pipeline, ledger, planning |
| `imports` | Đọc xlsx/csv, column mapping, tạo raw_events | openpyxl, pipeline |
| `planning` | budgets, goals (tính toán), recurring detection, reminders, reports | ledger |
| `jobs` | Entry point CronJob: `python -m app.jobs <name>` | planning, ingest |

`parsers`, tính dedupe, ghép chuyển nội bộ, dự báo mục tiêu, phát hiện định kỳ là **hàm thuần** để test không cần DB.

## 4. Data model

Postgres, database riêng `finance`. Tiền: `BIGINT` VND (âm = chi, dương = thu). Thời gian: `timestamptz` (UTC), hiển thị `Asia/Ho_Chi_Minh`. Mọi bảng nghiệp vụ có `group_id`.

```
users              id, google_sub UNIQUE, email UNIQUE, name, avatar_url, telegram_chat_id UNIQUE NULL,
                   default_group_id NULL, created_at      ← group mặc định cho Telegram/Android
groups             id, name, type ('family'|'split'), currency ('VND'), created_by, created_at
group_members      group_id, user_id, role ('owner'|'member'), joined_at  PK(group_id,user_id)
group_invites      id, group_id, token_hash, created_by, expires_at, used_by NULL
accounts           id, group_id, owner_user_id NULL, name, kind ('bank'|'ewallet'|'cash'|'credit'),
                   provider NULL ('tpbank'|'momo'|'zalopay'|'shopeepay'|'hsbc'|…), archived
categories         id, group_id, parent_id NULL, name, kind ('expense'|'income'), icon, archived
transactions       id, group_id, account_id, user_id NULL, amount BIGINT, occurred_at,
                   description, merchant NULL, counterparty NULL, category_id NULL,
                   source ('notification'|'telegram'|'web'|'statement'),
                   status ('confirmed'|'needs_review'),
                   classified_by NULL ('rule'|'llm'|'user'),
                   is_internal_transfer BOOL, transfer_pair_id NULL,
                   reconciled BOOL, raw_event_id NULL, note NULL, created_at, updated_at
raw_events         id, group_id, user_id, source, provider NULL, payload JSONB, idempotency_key UNIQUE,
                   received_at, parse_status ('pending'|'parsed'|'failed'|'ignored'), error NULL, attempts INT
merchant_rules     id, group_id, match_type ('merchant'|'counterparty'|'contains'), pattern, merchant NULL,
                   category_id, hits INT, updated_at   UNIQUE(group_id, match_type, pattern)
import_mappings    id, account_id, file_kind, column_map JSONB, header_row INT, date_format
budgets            id, group_id, category_id, amount_per_month BIGINT  UNIQUE(group_id, category_id)
budget_alerts      budget_id, month DATE, threshold (80|100)  PK(budget_id, month, threshold)  ← chỉ báo 1 lần/mốc/tháng
goals              id, group_id, name, target_amount, target_date NULL, linked_account_id NULL, icon, archived
goal_contributions id, goal_id, amount, date, transaction_id NULL, note
recurring_items    id, group_id, name, merchant_pattern NULL, amount, cadence ('monthly'|'yearly'|'weekly'),
                   next_due DATE, kind ('subscription'|'bill'), category_id NULL,
                   status ('suggested'|'active'|'dismissed'), detected BOOL
device_tokens      id, user_id, group_id, token_hash, device_name, last_seen_at, revoked_at NULL
telegram_link_codes code_hash, user_id, expires_at
```

Index chính: `transactions(group_id, occurred_at DESC)`, `transactions(account_id, amount, occurred_at)` (dedupe), `raw_events(parse_status, received_at)`.

## 5. Luồng xử lý giao dịch

### 5.1 Pipeline chung

1. Nguồn gửi dữ liệu → **lưu `raw_event` trước** (idempotency_key chống trùng) → trả response nhanh.
2. Parser theo `source/provider` → `ParsedTxn {amount, occurred_at, description, account_hint, counterparty}`.
   Lỗi → `parse_status='failed'`, hiện trên web mục "Chưa đọc được", có nút chạy lại (sau khi sửa parser).
   Thông báo không phải giao dịch (quảng cáo, OTP) → `ignored`.
3. **Dedupe:** cùng `account_id`, cùng `amount`, `|Δoccurred_at| ≤ 5 phút` → coi là cùng giao dịch. Nếu nguồn mới là sao kê → đánh dấu `reconciled=true`, không tạo mới.
4. **Chuyển nội bộ:** tồn tại giao dịch ngược dấu, cùng |amount|, ở một account khác cùng group, `Δ ≤ 10 phút` → ghép `transfer_pair_id`, cả hai `is_internal_transfer=true`, không tính vào chi/thu.
5. **Phân loại** (5.3).
6. Lưu `transaction`; nếu `needs_review` → gửi Telegram cho user sở hữu.

Pipeline idempotent: chạy lại một raw_event không tạo giao dịch trùng.

### 5.2 Nguồn

- **Android notification:** app nghe whitelist package (TPBank, MoMo, ZaloPay, ShopeePay, HSBC — package name xác nhận khi làm M4), gửi `{package, title, text, posted_at}` tới `/ingest/notification` kèm device token. Idempotency key = hash(package, text, posted_at). App giữ hàng đợi SQLite, retry với backoff. **Toàn bộ parse ở server.** Mẫu thông báo thật sẽ được thu thập làm fixture trước khi viết parser.
- **Group đích:** Telegram dùng `users.default_group_id`; Android dùng `device_tokens.group_id`.
- **Telegram text:** `"đi chợ 320k tiền mặt hôm qua"` → `LLMClient.parse_quick_entry` → `{amount, account_hint, category_hint, date, description}`; bot trả lời xác nhận kèm [Sửa] [Xóa]. Số tiền hiểu `k`, `tr`, `triệu`, `m`.
- **Telegram ảnh:** `LLMClient.parse_image` (provider có vision; DeepSeek chưa chắc hỗ trợ → cấu hình `LLM_VISION_PROVIDER` riêng). Luôn cần user xác nhận.
- **Web:** form thêm/sửa; `source='web'`, `classified_by='user'` nếu chọn danh mục.
- **Sao kê:** upload xlsx/csv → lần đầu map cột (ngày, mô tả, số tiền hoặc ghi nợ/ghi có) và lưu `import_mappings` theo account → mỗi dòng thành một raw_event (`source='statement'`) → pipeline. Hiện kết quả: mới / đã đối soát / lỗi.

### 5.3 Phân loại

1. Chuẩn hóa mô tả (bỏ mã tham chiếu, số dài, ký tự thừa, uppercase → so khớp).
2. **Rule:** khớp `merchant_rules` theo thứ tự `counterparty` → `merchant` → `contains`. Khớp → `confirmed`, `classified_by='rule'`, tăng `hits`.
3. **LLM:** gửi danh mục của group + tối đa 20 ví dụ đã xác nhận gần nhất + giao dịch (mô tả đã che, số tiền, thời điểm). Trả JSON `{category_id, merchant, confidence, top3}`.
   `confidence ≥ 0.8` → `confirmed`, `classified_by='llm'`; ngược lại `needs_review`.
4. **Xác nhận:** Telegram gửi mô tả + số tiền + 3 nút danh mục gợi ý + [Khác…] (link web). User chọn → cập nhật giao dịch (`classified_by='user'`) và upsert rule (theo counterparty nếu là chuyển khoản cá nhân, ngược lại theo merchant).
5. LLM lỗi/timeout (10s) → `needs_review`, `category_id=NULL`; không chặn lưu giao dịch.

**Che dữ liệu trước khi gửi LLM:** thay mọi dãy ≥6 chữ số bằng `***`; không gửi số dư, số tài khoản.

### 5.4 Telegram

- **Liên kết:** web tạo code một lần (hết hạn 10 phút) → link `t.me/<bot>?start=<code>` → bot gắn `telegram_chat_id`. Chat chưa liên kết bị từ chối.
- **Webhook:** `POST /webhooks/telegram`, verify header `X-Telegram-Bot-Api-Secret-Token`. Update được lưu thành raw_event trước, xử lý trong request; nếu pod chết giữa chừng thì `reprocess-pending` xử lý lại. `update_id` làm idempotency key.
- **Lệnh:** `/thang` (tổng chi tháng theo danh mục, so với ngân sách), `/muctieu` (tiến độ mục tiêu), `/chuaxacnhan` (danh sách needs_review, mỗi cái có nút).

### 5.5 Kế hoạch tài chính

- **Ngân sách:** chi thực tế tháng hiện tại theo danh mục (loại chuyển nội bộ) so với `amount_per_month`; cảnh báo Telegram khi vượt 80% và 100% (mỗi mốc một lần/tháng).
- **Mục tiêu:** `saved` = tổng `goal_contributions`. Nếu goal có `linked_account_id`, mỗi giao dịch chuyển nội bộ **vào** account đó tự tạo một contribution (hệ thống không theo dõi số dư tài khoản ở MVP).
  `monthly_needed = (target − saved) / số tháng còn lại` (nếu có `target_date`).
  `projected_date` = hôm nay + (target − saved) / trung bình đóng góp 3 tháng gần nhất (không có đóng góp → không dự báo).
- **Phát hiện định kỳ** (CronJob đêm): nhóm giao dịch chi theo merchant/counterparty; ≥3 lần (hoặc ≥2 lần với merchant subscription đã biết), khoảng cách 28–33 ngày (hoặc 7±1, 365±7), số tiền lệch ≤10% → tạo `recurring_items` `status='suggested'`, user duyệt trên web hoặc Telegram.
- **Nhắc hạn** (CronJob sáng): item `active` có `next_due` trong 3 ngày tới → Telegram. Khi giao dịch khớp được ghi nhận → đẩy `next_due` sang kỳ tiếp theo.
- **Báo cáo:** tuần (sáng thứ Hai) và tháng (ngày 1) qua Telegram.

## 6. Xác thực & phân quyền

- **Web:** next-auth Google provider → lấy Google ID token → `POST /auth/google` → API JWT (lưu trong session next-auth, gọi API server-side hoặc kèm Bearer).
- **Flutter:** `google_sign_in` → ID token → `POST /auth/google` → API JWT (lưu secure storage). Sau đó app đăng ký device token cho ingest.
- API chấp nhận ID token từ các client ID được cấu hình (`GOOGLE_CLIENT_IDS`: web + android).
- `ALLOWED_EMAILS`: chỉ email trong danh sách được tạo user.
- Mọi endpoint theo group dùng dependency `require_member(group_id)`; mọi query lọc theo `group_id`.
- Device token và link code lưu dạng hash; device token có thể thu hồi trên web.

## 7. Triển khai

- Namespace `finance`.
- `finance-api`: Deployment 2 replicas, readiness `/healthz` (kiểm tra DB). initContainer `alembic upgrade head`; `env.py` lấy `pg_advisory_lock` để chỉ một pod migrate.
- `finance-web`: Deployment 1 replica.
- Service ClusterIP cho cả hai; Ingress (Traefik) `finance.fevirtus.dev` → web, `finance-api.fevirtus.dev` → api. Public hostname trên Cloudflare Tunnel do chủ repo thêm.
- CronJobs dùng image api: `reprocess-pending` (*/5), `detect-recurring` (02:00), `due-reminders` (08:00), `reports` (08:30 thứ Hai và ngày 1) — giờ theo `Asia/Ho_Chi_Minh` (`timeZone` của CronJob).
- Secrets (chủ repo tự tạo, spec chỉ nêu key):
  - `finance-api-env`: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_IDS`, `ALLOWED_EMAILS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DEEPSEEK_API_KEY`, `LLM_VISION_PROVIDER`, `LLM_VISION_API_KEY`, `PUBLIC_WEB_URL`
  - `finance-web-env`: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `API_URL`
- Telegram `setWebhook` chạy một lần qua script `api/scripts/set_webhook.py`.
- CI (GitHub Actions, path filter): api → ruff + pytest (Postgres service) → build/push `ghcr.io/fevirtus/finance-api:sha-<sha>`; web → lint + tsc + test → build/push `finance-web`; mobile → `flutter analyze` + test → build APK artifact. Deploy: cập nhật tag image trong `deploy/` và `kubectl apply` (thủ công giai đoạn đầu).

## 8. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Parser không đọc được | raw_event `failed` + lý do; hiện trên web; chạy lại được |
| LLM lỗi/timeout | Giao dịch lưu `needs_review`, không danh mục; không retry tự động cho classify (user xác nhận) |
| Pod chết giữa xử lý | `reprocess-pending` lấy raw_event `pending` > 2 phút, `attempts < 5` |
| Gửi Telegram lỗi | Log, không làm hỏng luồng chính |
| Ingest trùng | Idempotency key → trả 200, không tạo mới |
| App Android offline | Hàng đợi SQLite, retry backoff |
| Token hết hạn | API trả 401 → client đăng nhập lại |

## 9. Kiểm thử

- **API (pytest):** Postgres thật (DB test tạm, CI dùng service container).
  - Parser: fixture mẫu thông báo và sao kê thật (đã che) → golden test.
  - Hàm thuần: dedupe, ghép chuyển nội bộ, parse số tiền tiếng Việt (`45k`, `1tr2`, `1.200.000đ`), che dữ liệu, dự báo mục tiêu, phát hiện định kỳ.
  - Pipeline + classify với `FakeLLMClient`.
  - API: phân quyền group (user ngoài group bị 403), allowlist, webhook secret.
- **Web:** eslint + `tsc --noEmit`; test component cho form giao dịch.
- **Flutter:** `flutter analyze`; unit test hàng đợi offline và bộ lọc whitelist.

## 10. Rủi ro & câu hỏi mở

- **Nội dung thông báo ngân hàng** có thể thiếu số tiền/mô tả hoặc bị ẩn khi khóa màn hình → cần mẫu thật trước M4; fallback là sao kê.
- **DeepSeek vision:** chưa xác nhận; M2 kiểm tra, nếu không có thì dùng provider khác cho ảnh.
- **Quyền riêng tư:** mô tả giao dịch gửi tới DeepSeek (đã che số dài). Chấp nhận ở MVP.
- **Background trên Android:** một số ROM kill NotificationListener → hướng dẫn tắt tối ưu pin cho app.
- **Backup Postgres:** thuộc trách nhiệm hạ tầng hiện có; có thể thêm CronJob `pg_dump` sau.
