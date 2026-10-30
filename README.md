# 瘋狂水世界｜網頁任務管理

更新日期：2026-10-30

以 FastAPI、SQLite、Node.js 與原生 HTML／JavaScript 建立的本機開發版本。提供管理帳號、遊戲角色、任務設定、執行日誌與世界地圖。尚未完成所有功能或新電腦上的完整登入驗收；介面有開關不代表功能已完成。

## 管道與功能狀態

| 管道 | 現況 |
| --- | --- |
| 微信小程序 | 已實作掃碼、角色／區服讀取及部分任務；登入交換需要有效的本機 SDK 配置，本倉庫不包含該密鑰。 |
| APP（益世界） | 已驗證會話可供部分任務使用；一般新使用者直接在網頁輸入遊戲帳密的完整登入／更新流程尚未完成。 |
| 抖音小程序 | 已驗證會話可供部分任務使用；新的小遊戲掃碼授權交換尚未完成。一般抖音帳號登入不等於遊戲登入。 |

已接入的範圍包含部分工廠生產／領取、種植、居民需求、雷達、挑戰、競技場、海盜、艦隊維護、貨輪派遣、養成及獎勵。實際執行取決於等級、活動、材料、配置與伺服器回覆；部分項目僅通過程式模擬測試，尚未實機驗證。詳見 [實作狀態](IMPLEMENTATION-STATUS.md)。

- 地圖：城池、聯盟配色、已取得區域的玩家艦隊及行軍路線、貨輪與進度、芯片礦、點選定位。貨輪明細包含玩家名、目前／預估百分比與查詢時間，每輪最多更新三艘。資料是快取，行軍位置按伺服器時間估算，不是全服即時監控；原版全部地形及城戰標記尚未完整還原。
- 禮包碼：可更新公開候選碼、合併及清空設定名單；有效性、重複領取與到期以遊戲回覆為準。清空名單不會刪除已嘗試紀錄。
- 空閒修復：預設在每輪派遣後對在港受損空閒艦隊進行一般修復，會核對汽油；修復／行軍／回程加速是獨立開關，部分加速會耗鑽。
- 潛水：目前是固定數量的協議補庫試接，預設每批玻璃、金屬、海藻各 100，受倉庫上限及雙重回執核對限制；尚未完成真實單次採集上限／收集流程，不能視為完整自動潛水。
- 自動拾荒、完整對局、普通廣告播放完成回調等仍未完成。廣告任務／商店僅接官方 VIP 免廣告資格路徑，仍有待實機驗證的項目。

## 必要環境

目前以 **Windows 10／11 64 位元**為目標；遊戲會話使用 Windows DPAPI，不能直接搬給其他 Windows 使用者或 Linux 主機使用。

1. Python 3.12（包含 pip）：[官方下載](https://www.python.org/downloads/windows/)。
2. Node.js 22 或以上（包含 npm）：[官方下載](https://nodejs.org/en/download)。
3. Chrome、Edge 或其他現代瀏覽器。
4. 自己的遊戲帳號，以及對應管道所需的有效本機 SDK 配置。
5. Git 僅在使用 Git 指令下載／更新時需要：[官方下載](https://git-scm.com/downloads)。也可從 GitHub 下載 ZIP。

一般任務執行不需要另外安裝 MySQL、Docker、Npcap、Wireshark、抓包代理或測試 CA。SQLite 隨 Python 提供。模擬器與 Android 開發工具只供實驗模組使用，不是已完成的通用部署流程。

## 第一次安裝

在 PowerShell 執行，或下載 ZIP 後進入包含 `launch.py` 的資料夾：

```powershell
git clone https://github.com/andy0119/CrazyWaterWorld.git
cd CrazyWaterWorld
py -3.12 --version
node --version
npm.cmd --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd install --prefix backend/wx-game
```

抖音實驗模組如需其協議套件，再安裝：

```powershell
npm.cmd install --prefix backend/douyin-game
```

直接呼叫虛擬環境的 Python，不需要執行 `Activate.ps1` 或更改 PowerShell 執行政策。若系統找不到 `py`，請改用你安裝的 Python 3.12 執行檔路徑。

### 登入交換配置（原始碼不包含密鑰）

微信登入交換讀取 `backend/wx-game/sdk-config.json`。有權使用的環境需自行提供對應 `appId`、`appSecretKey`；範例是空白格式，**複製空白檔案不會讓登入自動可用**。

```powershell
if (!(Test-Path backend/wx-game/sdk-config.json)) {
    Copy-Item backend/wx-game/sdk-config.example.json backend/wx-game/sdk-config.json
}
```

填入環境所需的有效配置，勿將實際密鑰、遊戲會話或帳密提交到 GitHub。抖音實驗模組有對應的 `backend/douyin-game/sdk-config.example.json`，但提供配置不代表其新帳號登入流程已完成。

### 安裝檢查

```powershell
.\.venv\Scripts\python.exe -c "import fastapi, uvicorn, pydantic, sqlite3; print('Python dependencies OK')"
node -e "require('./backend/wx-game/node_modules/protobufjs/minimal'); console.log('Node dependencies OK')"
```

## 日常啟動與使用

1. 雙擊 `Start-Aurora.cmd`，優先使用專案的 `.venv`。
2. 或在專案根目錄執行：

```powershell
.\.venv\Scripts\python.exe launch.py
```

3. 瀏覽器開啟 [本機管理頁](http://127.0.0.1:8000/)。新資料庫需先建立管理帳號；管理帳號與遊戲帳號不同。
4. 依已支援管道新增角色、確認角色／區服，配置並保存任務，再按「開始」。
5. 由「動態」看實際回執；地圖請由已登入管理頁的帳號連結進入。新開分頁沒有登入狀態時只會顯示固定城池。
6. 修改設定後先保存，再停止／開始該帳號任務。尚未接通的勾選項會被啟動檢查拒絕。

服務及電腦必須持續運作；關機或休眠會中斷本機任務。關閉瀏覽器不等於停止後端。停止單一帳號請按「停止」；關閉後端在服務終端按 `Ctrl+C`。不要同時用其他遊戲客戶端操作同一角色，以免會話互相影響。

第一次啟動會建立本機 SQLite。Node 優先讀 `AURORA_NODE`，其次尋找 PATH 中的 `node`，最後兼容原開發環境的執行檔；不必安裝 Codex 才能用標準環境啟動。舊啟動器的開發機相容分支不替代上述安裝步驟。

## 更新與重新載入

先停止任務及後端，備份自己的資料庫與本機配置，再執行：

```powershell
git pull --ff-only
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd install --prefix backend/wx-game
.\.venv\Scripts\python.exe launch.py
```

- 更新 Python 後端／功能清單：需重啟後端。
- 更新 Node 任務：需停止後再開始帳號；自動重連不會重新載入程式。
- 更新前端：重新整理頁面。
- 重啟服務不會自動恢復全部帳號任務，請檢查角色授權後自行開始。

## 本機資料與上傳範圍

不要上傳：`node_modules/`、`.venv/`、`__pycache__/`、SQLite／資料庫、`.env`、實際 `sdk-config.json`、`*.local.json`、憑證、金鑰、封包／keylog、日誌與備份。`.gitignore` 已排除常見位置；自行新增檔案仍需先檢查。不要用整個 backend 資料夾壓縮後直接上傳，裡面可能含自己的登入與角色資料。

依賴透過安裝指令重建；不需要把超過 100 MB 的本機資料庫或依賴目錄提交到 GitHub。資料庫及受 DPAPI 保護的會話只留在原本使用者環境，新的電腦需重新建立管理帳號並授權。

## 常見問題

- **沒有 Node.js／微信登入服務啟動失敗**：安裝 Node，重新開啟終端；必要時指定 `$env:AURORA_NODE='C:/實際路徑/node.exe'` 後啟動。
- **缺少 SDK 配置**：見上方配置章節；倉庫刻意不含實際密鑰。
- **地圖看不到貨輪**：確認管理平台登入、圖層已開啟、帳號任務正在讀取資料及快取時間；點右側清單定位。
- **BUSINESS_BLOCKING**：伺服器拒絕該次操作，不能單憑此代碼判斷是缺料或滿倉；看附帶的工廠、配方、狀態等資訊。
- **解碼失敗／封包重傳失敗**：屬協議相容或連線問題，不等於已確認被其他人登入。保留訊息名稱、序號與時間以供排查，不要提供完整憑證或登入封包。
- **沒有收到獎勵**：以 `verified` 與實際庫存／計數為準；`unconfirmed` 不代表成功，也不會自動重送該次操作。
- **GitHub 上傳完成是否就會掛機？** 不會。GitHub 是程式碼儲存庫，GitHub Pages 不能執行 Python、Node、SQLite 或常駐任務；仍需持續開機的 Windows 主機。公開多人服務、跨平台與雲端部署尚未完成驗收。

## 專案結構與第三方來源

- `web/`：管理介面、任務配置與地圖。
- `backend/`：API、資料庫、角色會話、登入橋接與任務執行器。
- `backend/wx-game/`、`backend/douyin-game/`：協議／配置與實驗交換模組。
- `backend/wx-login/`：微信掃碼橋接。
- `android/`：Android 外殼原始碼，並非已完成的 APK 發布版。
- `launch.py`、`Start-Aurora.cmd`：本機啟動入口。

第三方協議、橋接及相關來源說明請保留各目錄中的 `NOTICE.txt`。本倉庫未新增涵蓋所有第三方檔案的開源授權；使用或再散布前應確認各來源的授權條件。
