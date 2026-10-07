# 一起去 / Trip Helper

給家人朋友的旅行興趣收集器。每張卡片只選「有興趣」或「沒興趣」，同一地點的不同體驗獨立作答。原始紀錄可以交給 agent 探索偏好；網站提供基本統計。

介面與卡片支援正體中文及英文。語言依裝置偏好初始化，也可隨時切換；選擇會在該裝置記住。兩種語言共用卡片 ID、順序及作答資料；切換語言不會新增或清除答案。原始事件保留作答時的顯示語言。

首組內容是 **2026 年 12 月 23–31 日台北，11–70 歲**。2026 年是依建立時的今年推定，日期與受眾都在旅程 JSON，可更換。44 張卡片、43 張實景照片，包含同一地點的不同體驗。當前價格、展覽與節慶場次的不確定性在卡片中註明；資料查核日為 2026-10-07。

## 本機使用

需要 Node.js 24。

```sh
npm ci
npm run dev
```

打開 http://127.0.0.1:5173。首頁可預覽旅程；管理頁輸入 `.data/admin-token` 裡的金鑰，新增旅伴後複製各自的專屬連結。管理金鑰不會包進網頁。連結持有者可以代表該名旅伴作答，請以私人訊息分享。

本機 API 使用 `.data/store.json` 持續保存回答。重新啟動仍會保留；只適合一個 API process。本機 localhost 連結只能在本機開啟。分享給家人朋友前需完成下方雲端部署。

作答畫面是滿版直式內容流：上下滑換卡片，左滑沒興趣、右滑有興趣；左右鍵或兩個按鈕也能選擇。上下瀏覽不算作答，回看頁可以改選。每次操作有固定 ID，網路重送不重複計票；舊裝置修改會提示衝突。先成功載入邀請，之後斷線的操作會暫存在該裝置。初版沒有離線 app-shell，完全斷網重新開啟網頁需要等恢復連線；不要清除瀏覽器資料直到待同步數為零。

主畫面只常駐照片、完整體驗標題和輕量進度；有興趣／沒興趣的提示只在左右拖曳時出現。資訊圖示移到右上角，開啟完整描述、費用、查核與來源；選單提供點按選擇、旅程日期、參與者、同步狀態、語言切換及回看。正常儲存用小圓點表示，無法儲存或需要處理的衝突仍會直接提示。沒有圖片或影片的卡片直接顯示標題與描述，不使用泛用地標插畫填補。

沒有邀請碼的公開旅程頁可試玩相同的左右滑、按鈕及方向鍵操作。試玩選擇只保留在當次頁面的記憶體，重新整理後清空，不建立操作佇列或傳送 API 回答；畫面標示「試玩」。要收集正式結果，請分享各位旅伴的專屬邀請連結。

## 內容與 skill

使用 [trip-research skill](skills/trip-research/SKILL.md)，或直接請 agent 閱讀它。旅程檔案放 `public/trips/{id}.json`，首頁列表在 `public/trips/index.json`。來源與收集條件在 `public/trips/sources/`。英文卡片在 `public/trips/locales/en/{id}/{version}.json`，與原始內容版本綁定。發布驗證會檢查所有卡片的完整翻譯；既有邀請繼續使用原始快照，再載入相符翻譯。缺少相符翻譯時會明確提示並保留正體中文內容。

```sh
node --import tsx scripts/collect-taipei.ts
npm run validate:content
```

收集器讀取設定檔，優先官方臺北 API；遇到網站阻擋則使用觀光署官方每日景點資料集。圖片使用有出處的實景遠端網址；原始照片與引用資料不複製進回答資料庫。圖片不可讀時介面會顯示文字備援。初版支援影片資料型別，但首組內容未放入未驗證的影片。

發布後的邀請綁定完整內容快照，所有人的初始卡片順序相同。內容修改建議建立新的旅程 ID／網址。不要把不同內容覆蓋在同一版本；API 會拒絕同版本不同內容。快照、來源及內容維度一起匯出，agent 可以重做分類而不改寫原始答案。

## GCP 儲存與部署

Firestore **Standard / Native**，Cloud Run API 透過服務帳號存取。前端只呼叫 API；Firebase Rules 不負責後端授權。所有旅程共用資料庫，用旅程 ID 與 collection prefix 分隔；免費資格需確認現有 project。單筆內容快照上限由 MAX_PACK_BYTES 限制低於 Firestore 1 MiB，snapshot payload 不建立索引。回答與事件分開保存，在交易中同時寫入。沒有常駐即時監聽。

```sh
export GCP_PROJECT_ID='your-project-id'
export GCP_REGION='your-chosen-region'
export ALLOWED_ORIGINS='https://your-account.github.io'
npm run deploy:gcp
```

腳本會啟用 API、檢查既有資料庫 mode/edition/區域，必要時建立資料庫、設定 payload 索引豁免、建立專用服務帳號與 Secret Manager 管理金鑰、部署 Cloud Run。它會改動明確指定的 project，因此先確認 project 用途、計費與權限；不採用 gcloud 預設 project。若組織政策禁止公開 Cloud Run 或授權，需由該 project 管理者處理。執行腳本的帳號需要 service usage、Firestore、service account/IAM、Secret Manager、Cloud Build/Artifact Registry 與 Cloud Run 部署權限。腳本沒有自動新增 Cloud Build 建置帳號權限；第一次 source deploy 若提示 build-service-account 權限不足，按錯誤指定帳號授予 `roles/run.builder` 後重跑。

Cloud Run min instances 0、max instances 預設 2，來源清單、region、資料庫、prefix、service name 可由環境變數設定。API 有每 instance 的操作速率保護；instance 上限及速率保護都不是帳單硬上限。免費額度、網路流量、建置映像與 Secret Manager 按各服務資格計費。官方 managed export、備份/PITR 不在初版自動啟用；JSON 匯出提高資料可攜性，但不提供自動災難復原。原始回答不設定 TTL。

查看管理金鑰：

```sh
gcloud secrets versions access latest --secret=trip-helper-admin --project="$GCP_PROJECT_ID"
```

自訂 SERVICE_NAME/ADMIN_SECRET_ID 時，上面的 secret 名稱也要換成該設定。不要把金鑰放進 `VITE_` 環境變數或 Git。

## GitHub Pages 多旅程

建立 GitHub repository，把程式推上 `main`，在 Settings → Pages 選 GitHub Actions。設定 repository variable `VITE_API_BASE_URL` 為 Cloud Run URL。預設相對 base 適用 project Pages；路由使用 hash，像 `/#/trip/taipei-2026-dec?invite=...`，新增旅程不需要再部署一個網站。`VITE_BASE_PATH` 通常留空，預設使用相對路徑。日期內容與公開素材可被訪客讀取，姓名、選擇與金鑰由 API 保護。

Cloud Run 的 ALLOWED_ORIGINS 要填 Pages origin，例如 `https://farl.github.io`，不要填 `/trip-helper` 路徑。多個來源可用逗號分隔。管理頁同樣用 runtime 管理金鑰進入。

## 驗證

```sh
npm test
npm run validate:content
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

單元／HTTP測試涵蓋獨立卡片、去重、改選歷史、版本衝突、重啟保存、停用邀請與匯出；瀏覽器測試涵蓋手機／桌面、全輪、接續與管理結果。GCP 真實部署與 Firestore adapter 整合仍需指定 project 與有效 Google 憑證後驗證。
