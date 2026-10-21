# 瘋狂水世界｜網頁任務管理

更新日期：2026-10-21

以 FastAPI、SQLite、Node.js 與原生 HTML／JavaScript 建立的本機管理工具。登入管理帳號後，可新增遊戲帳號、保存任務配置、查看執行記錄與世界地圖。這是獨立實作的開發版本，並非原網站的後端程式，也不是遊戲官方服務。

## 目前支援狀態

| 管道 | 登入與任務狀態 |
| --- | --- |
| 微信小程序 | 已接通掃碼、角色讀取與部分任務執行；不是所有設定欄位都已可執行。 |
| APP（益世界） | 尚未完成供一般使用者使用的網頁帳密登入與會話更新。 |
| 抖音小程序 | 尚未完成小遊戲授權交換及完整託管；一般抖音帳號掃碼不等於遊戲登入。 |

微信已實作的任務涵蓋部分生產、種植、居民需求、收集、挑戰、艦隊派遣與獎勵領取。是否可執行仍取決於帳號等級、活動、材料、設定與遊戲回應。

- **競技場**：顯示最近讀到的對手列表；只挑戰排名更高、戰力更低的對手。本次執行輸過的對手跳過；低排名掃蕩僅補每日前 10 次挑戰獎勵。戰力比較不能保證勝利。
- **機械蛞蝓挑戰獎勵**：已實作達標檔位與庫存核對，通過模擬測試，仍待真實活動驗證；自動出征尚未完成。
- **世界地圖**：顯示伺服器回傳的城池及艦隊資料；不代表能取得整個伺服器的所有玩家。移動顯示依最近讀到的路線與時間推算。
- **禮包碼**：支援帶入公開候選碼，最多保存 1,000 組。是否有效、已領取或不適用，以遊戲回應為準。
- **複製配置**：設定頁右上角可選同一管理帳號下其他角色的配置帶入，再保存。登入授權不會複製，放生／分解的角色專屬 ID 名單會清空。

自動潛水、自動拾荒的獨立網頁託管、真實廣告完成回調，以及部分活動和進階選項仍未完成。介面有欄位，不代表已有可執行協議；實機測試成功與模擬測試通過也不相同。

## 在目前這台電腦啟動

1. 在專案根目錄雙擊 `Start-Aurora.cmd`。
2. 瀏覽器開啟 [本機網站](http://127.0.0.1:8000/)。
3. 註冊或登入管理帳號，再新增微信遊戲帳號，掃碼並讀取角色／區服。
4. 在「修改配置」選擇任務並保存，再按「開始」。
5. 從「動態」或設定頁的「執行記錄」檢查實際結果。

**執行期間需保持服務視窗開啟，且電腦不能關機或休眠。** 關閉瀏覽器不等於停止後端任務；要停止請按帳號的「停止」，或在服務視窗按 `Ctrl+C`。

若網站已啟動，啟動腳本會嘗試打開既有網站，不會自動載入更新後的後端。更新 Python 後端或功能清單後，需停止服務再啟動；更新 Node 任務程式後，需停止再開始帳號任務。重啟服務會中斷執行中的帳號，之後需重新按「開始」。

設定變更請先保存，再停止並重新開始任務。授權失效時需重新掃碼。請勿在另一個遊戲客戶端同時操作同一角色，以免遊戲會話互相頂替。

## 第一次使用需要安裝什麼

以下以 **Windows 10／11 的 64 位元電腦**為目標。這是安裝環境的說明；仍需完成下一節列出的程式路徑調整，才能移機執行。

| 軟體／套件 | 用途與安裝方式 |
| --- | --- |
| Python 3.12（64 位元） | 後端執行環境。從 [Python 官方 Windows 下載頁](https://www.python.org/downloads/windows/) 安裝 3.12 系列，包含 pip；若安裝程式提供 Python Launcher 與加入 PATH 選項，請啟用。 |
| Node.js 22 或 24 LTS（64 位元） | 微信登入橋接與遊戲任務執行器。從 [Node.js 官方下載頁](https://nodejs.org/en/download) 安裝 Windows 版本，包含 npm 並加入 PATH。 |
| FastAPI、Uvicorn、Pydantic | Python 套件，依下方指令從 `backend/requirements.txt` 安裝，不需分別下載安裝程式。 |
| protobufjs 7.6.6 | 目前遊戲協議使用的 Node 套件。若未隨程式提供 `node_modules`，依下方指令重建。 |
| Chrome 或 Edge | 開啟管理網頁；已安裝其中一個就不用另外安裝。 |
| 手機微信與自己的遊戲帳號 | 新增微信角色時掃碼授權。帳號必須由使用者自己登入。 |

一般網頁版執行不需要安裝 MySQL、Docker、Git、Npcap、Wireshark、抓包代理或測試 CA；SQLite 已包含在 Python。Git 只在要使用 Git 指令下載／更新程式碼時才需要。模擬器與 Android Studio 也不是目前微信網頁任務的必要安裝項目；開發或測試 Android 外殼時才需另行準備。

### 1. 確認安裝成功

安裝後重新開啟 PowerShell，執行：

```powershell
py -3.12 --version
node --version
npm.cmd --version
```

三個指令都應顯示版本。若顯示找不到命令，先重新開啟終端機；仍找不到時檢查安裝與 PATH，不要跳過錯誤直接啟動。

### 2. 安裝專案套件

先在檔案總管進入包含 `launch.py`、`backend`、`web` 的專案根目錄，再從該位置開啟 PowerShell：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd install --prefix backend/wx-game --no-save --package-lock=false protobufjs@7.6.6
```

這裡直接呼叫虛擬環境的 Python，不需要執行 `Activate.ps1`，也不需要為了啟用環境而更改 PowerShell 執行政策。`npm.cmd` 用來避免 PowerShell 將 npm 指令解析為受政策限制的 `npm.ps1`。

上述 npm 指令只補目前微信遊戲協議已確認使用的依賴，不代表尚未完成的抖音／模擬器模組已具備完整安裝環境。

### 3. 檢查套件

仍在專案根目錄執行：

```powershell
.\.venv\Scripts\python.exe -c "import fastapi, uvicorn, pydantic, sqlite3; print('Python dependencies OK')"
node -e "require('./backend/wx-game/node_modules/protobufjs/minimal'); console.log('Node dependencies OK')"
(Get-Command node).Source
```

前兩項應顯示 `OK`。最後一項會顯示這台電腦的 `node.exe` 位置，供下一節調整執行器路徑使用。

## 提供程式碼給其他人

目前仍有依賴原開發電腦的路徑，**不是解壓縮即可在其他電腦運行的安裝版**。

基本環境為 Windows、Python 3.12 與 Node.js 22 或更新版本。遊戲會話使用 Windows DPAPI 保護，不能直接將原電腦的會話資料庫搬給另一個 Windows 使用者使用。

Python 依賴可在專案根目錄安裝：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

目前微信協議使用的 Node 套件可按上節重建；整個專案尚未完成乾淨電腦上的安裝驗證。移機前還需調整：

- `Start-Aurora.cmd` 的 Python 執行檔及 `PYTHONPATH`。
- `backend/task_engine.py` 的 Node 執行檔位置：使用上一節 `(Get-Command node).Source` 的實際結果取代原開發電腦預設路徑。
- 微信橋接的 Node 位置支援 `AURORA_NODE`；可在啟動前執行 `$env:AURORA_NODE = (Get-Command node).Source`。這個變數目前只影響橋接，不會自動修正 `task_engine.py` 的路徑。
- 模擬器等尚未完成模組所使用的本機路徑。

完成上述環境整理後，可在專案根目錄啟動：

```powershell
.\.venv\Scripts\python.exe launch.py
```

API 文件位於 [本機 API 文件](http://127.0.0.1:8000/docs)。本機服務預設綁定 `127.0.0.1:8000`。SQLite 資料庫會在首次啟動時建立。

## 分享時要排除的內容

分享的是程式碼，不是你的帳號資料。請製作另一份乾淨副本，排除：

- `backend/aurora.sqlite3`、`aurora.sqlite3-wal`、`aurora.sqlite3-shm` 及其他私人資料庫。
- `.env`、登入會話、Token、私人憑證、TLS 金鑰、封包擷取及含敏感資料的日誌。
- `*-verified-roles.json`、舊備份、測試輸出及快取。
- `.venv`、`__pycache__` 等可重建環境；Node 依賴需另提供可靠的安裝方式。

`backend/wx-game/sdk-config.json` 等 SDK 本機設定包含金鑰，不包含在分享版本；部署者需自行提供有權使用的設定，單純安裝套件無法補上遊戲登入。

保留 `web/`、後端程式、必要的 JSON 配置表、啟動檔、依賴清單與第三方 `NOTICE.txt`。不要刪除正在使用的原專案資料庫。`.gitignore` 不會移除已經提交到 Git 的私人檔案。

## 目錄與部署限制

| 路徑 | 用途 |
| --- | --- |
| `web/` | 帳號管理、任務設定、執行記錄與地圖介面 |
| `backend/` | API、SQLite、登入橋接與任務執行器 |
| `backend/wx-game/` | 遊戲協議、配置及 Node 相依模組 |
| `backend/wx-login/` | 微信掃碼橋接 |
| `android/` | Android 外殼來源檔；不是已驗證完成的 APK 發布版 |
| `launch.py`、`Start-Aurora.cmd` | 本機啟動入口 |

GitHub 可存放原始碼；GitHub Pages 不能執行本專案的 Python、Node.js、SQLite 及常駐任務。若要提供多人長期使用，仍需常駐主機，並先完成移機、憑證管理與部署驗證。目前版本尚未完成公開多人服務的部署驗收。
