# 極光助手重建版 v0.1（可執行 MVP）

這是依現有前端 API 路徑與 UI 線索**重新實作**的獨立專案，並非找回原始伺服器原始碼。包含 FastAPI + SQLite 後端、響應式網站、Android WebView 客戶端原始專案。

## 本機啟動

需 Python 3.10+。

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

開啟 http://127.0.0.1:8000 ，先註冊後登入。API 文件：http://127.0.0.1:8000/docs 。資料庫首次啟動自動建立在 backend/aurora.sqlite3。

## Android

用 Android Studio 開啟 `android/`，安裝 Android SDK 35，執行或 Build > Build APK(s)。模擬器網址使用 `http://10.0.2.2:8000`；實體手機使用同區網電腦 IP，例如 `http://192.168.x.x:8000`。正式部署請改為 HTTPS，並關閉 cleartext traffic。

此環境未提供 Android SDK/Gradle，故交付的是可編譯的 Android Studio 專案**而非已編譯 APK**。

## 已完成

- 本機帳號註冊、登入、PBKDF2 密碼雜湊、24 小時 Session token
- 使用者隔離的遊戲帳號資料列表與新增（不保存遊戲密碼）
- `/api/auth/login`、`/api/auth/register`、`/api/sub-user/bind`、`/api/user/sub-users`
- `/api/kubernetes/run` 與 `/api/kubernetes/stop` 的**狀態模擬**
- 簡易 Android WebView 外殼

## 尚未恢復

- 原伺服器原始碼、既有帳號資料、付費及試用資格
- 真正 Kubernetes 工作負載、遊戲認證及遊戲自動化引擎
- 原 APK 的原生模組、OCR/影像辨識、後端支付、後台管理

## 安全事項

目前為開發版，請勿直接公開到網際網路。正式版需要 HTTPS、登入限流、CSRF/CORS 策略、權限與稽核、憑證管理、資料庫備份。原有反盜版/授權機制不應透過前端模擬來取代伺服器授權。
