# 一起去 / Trip Helper

給家人朋友的旅行興趣收集器。每張卡片只選「有興趣」或「沒興趣」，同一地點的不同體驗獨立作答。原始紀錄可以交給 agent 探索偏好；網站提供基本統計。

介面與卡片支援正體中文及英文。語言依裝置偏好初始化，也可隨時切換；選擇會在該裝置記住。兩種語言共用卡片 ID、順序及作答資料；切換語言不會新增或清除答案。原始事件保留作答時的顯示語言。

首組內容是 **2026 年 12 月 23–31 日台北，11–70 歲**。2026 年是依建立時的今年推定，日期與受眾都在旅程 JSON，可更換。現版204張卡片包含194張照片卡、8張影片卡與2張全文字卡，涵蓋美食、購物、景點和玩樂，以實際料理、商品、活動原圖及影片呈現可判斷的亮點與取捨。來源查核日為2026-10-08；旅行日期的供應、價格、展覽與節慶場次未確認時明說。逐卡素材、來源、主觀體驗與限制見[內容審核](docs/content-research/taipei-2026-content-review.md)。

**2026年12月17–23日京都到東京，44歲夫妻兩人** 的探索調查已改為143張：139張實際照片、4段原播放器影片，涵蓋京都、宇治、富士山周邊與東京的10種體驗類別。每張照片量測原生像素並檢查實際直式卡面；逐卡保留季節、官方限制、第一手來源與拒用證據。既定航班、任天堂博物館、新幹線偏好不列為選項，也不含溫泉／足湯。詳見[內容審核](docs/content-research/kyoto-tokyo-2026-content-review.md)、[範圍紀錄](docs/content-research/kyoto-tokyo-2026-coverage.json)與[歷次需求核對](docs/content-research/session-lessons.md)。公開調查：[京都到東京](https://farl.github.io/trip-helper/#/trip/kyoto-tokyo-2026-dec)，2026-10-09已部署；本機仍可使用 `/#/trip/kyoto-tokyo-2026-dec`。先前39張的canonical、來源manifest與英文sidecar已保留。

## 正式網站

[台北旅程試玩](https://farl.github.io/trip-helper/#/trip/taipei-2026-dec) · [旅程管理](https://farl.github.io/trip-helper/#/manage/taipei-2026-dec) · [GitHub repository](https://github.com/Farl/trip-helper)。公開頁為試玩；正式收集請在管理頁建立每位旅伴的專屬邀請並分享。管理金鑰只在 GCP Secret Manager 和主辦者本機私人檔案，沒有放入公開 repository 或網頁。

2026-10-09 上線版本 `6241650`：GitHub Actions Pages + GCP Cloud Run／Firestore Standard Native（asia-east1）。真實雲端及手機瀏覽器已驗證邀請、固定牌序、二元答案、續滑、雙語、CORS、權限與原始資料匯出；上線測試邀請與回答已移除。56項單元/API測試與42項手機/桌面案例通過，4項僅手機案例在桌面略過。

## 本機使用

需要 Node.js 24。

```sh
npm ci
npm run dev
```

打開 http://127.0.0.1:5173。首頁可預覽旅程；管理頁輸入 `.data/admin-token` 裡的金鑰，新增旅伴後複製各自的專屬連結。管理金鑰不會包進網頁。連結持有者可以代表該名旅伴作答，請以私人訊息分享。

本機 API 使用 `.data/store.json` 持續保存回答。重新啟動仍會保留；只適合一個 API process。本機 localhost 連結只能在本機開啟。分享給家人朋友前需完成下方雲端部署。

作答畫面是滿版直式卡片：左滑沒興趣、右滑有興趣，容許斜滑，純上下手勢不換卡。按住立即平順縮成圓角卡片，保留內容文字，隱藏其他控制；左叉叉／右愛心同時顯示，達作答門檻時全亮、放大及亮框，未達門檻保留「放開不會作答」。固定底部的「稍後決定」只換卡、不新增或清除答案，一輪結束可集中回看未回答體驗。左右鍵或選單內的兩個按鈕也能選擇，選單上一張／下一張及鍵盤上下鍵可瀏覽，回看頁可以改選。每次操作有固定 ID，網路重送不重複計票；舊裝置修改會提示衝突。先成功載入邀請，之後斷線的操作會暫存在該裝置。初版沒有離線 app-shell，完全斷網重新開啟網頁需要等恢復連線；不要清除瀏覽器資料直到待同步數為零。

主畫面只常駐照片、完整體驗標題和輕量進度；有興趣／沒興趣的提示只在左右拖曳時出現。資訊圖示移到右上角，開啟完整描述、費用、查核與來源；選單提供點按選擇、旅程日期、參與者、同步狀態、語言切換及回看。正常儲存用小圓點表示，無法儲存或需要處理的衝突仍會直接提示。純文字卡只用於讀完便能判斷興趣的明確提案，直接顯示特色與取捨；視覺化體驗優先用對應圖片，不因缺少素材自動轉文字。

沒有邀請碼的公開旅程頁可試玩相同的左右滑、按鈕及方向鍵操作。試玩選擇只保留在當次頁面的記憶體，重新整理後清空，不建立操作佇列或傳送 API 回答；畫面標示「試玩」。要收集正式結果，請分享各位旅伴的專屬邀請連結。

## 分次使用與原始紀錄

正式邀請在卡片停住後記錄呈現；快速滑過未停住的中間卡片不記錄，明確作答則立即記錄。呈現與回答是兩種獨立事件，略過與瀏覽不計票；未回答也不當作沒興趣。新開啟頁面或重新回到前景會使用新的使用批次 ID，不以停留時間推測喜好。

牌序和續滑位置存在後端。同一裝置的未傳紀錄先接續本機進度；沒有待傳資料時，使用伺服器的新位置。離線紀錄重送具有固定 operation ID；後端以前一筆位置 ID 做交易比較，較舊裝置的佇列可以補回原始紀錄，但不能倒退較新裝置的位置。再開始新的瀏覽後可接上最新位置。已回答的續滑卡片會接到下一張未回答卡片，全部回答完成則進入完成頁。舊邀請的本機位置仍可使用。

JSON 匯出 schemaVersion 2 包含答案事件、呈現事件 `visits`、固定個人牌序和後端位置。呈現事件保留 cardId、零起算位置、sessionId、顯示語言和前一操作；`recordedAt` 是伺服器收到紀錄的時間，離線情況不代表實際看到的時間，也不能證明使用者有注意看內容。它們可供 agent 分析順序和分批使用的影響。

## 內容與 skill

使用 [trip-research skill](skills/trip-research/SKILL.md)，或直接請 agent 閱讀它。旅程檔案放 `public/trips/{id}.json`，首頁列表在 `public/trips/index.json`。來源與收集條件在 `public/trips/sources/`。英文卡片在 `public/trips/locales/en/{id}/{version}.json`，與原始內容版本綁定。發布驗證會檢查所有卡片的完整翻譯；既有邀請繼續使用原始快照，再載入相符翻譯。缺少相符翻譯時會明確提示並保留正體中文內容。

```sh
node --import tsx scripts/collect-taipei.ts
npm run validate:content
```

收集器讀取設定檔，用官方臺北 API 或觀光署每日景點資料核對地點，再使用逐體驗指定、已目視核對的素材，刷新不會退回地點的第一張照片。遊記與 vlog 可提供體驗細節，營業、費用、閉館與施工另查官方來源。重複素材可有意義地保留，發布檢查只列出重複提示，每張卡仍獨立作答。個別來源保留實際查核日，資料集刷新日另記在 manifest。回答資料庫保留來源URL與快照，不儲存外部圖片或影片檔；影片使用原發布者來源並保留署名，已檢查實際播放。

發布後的邀請綁定完整內容快照，新邀請在建立時保存各自固定的卡片順序：依類型比例分散，並減少最近卡片與場所、標籤的相似度；不依答案改變推薦。所有卡片仍各出現一次。同一份邀請在不同裝置或語言使用相同牌序；既有缺少牌序 metadata 的邀請保持原始順序。內容修改建議建立新的旅程 ID／網址。不要把不同內容覆蓋在同一版本；API 會拒絕同版本不同內容。快照、來源及內容維度一起匯出，agent 可以重做分類而不改寫原始答案。

## GCP 儲存與部署

Firestore **Standard / Native**，Cloud Run API 透過服務帳號存取。前端只呼叫 API；Firebase Rules 不負責後端授權。所有旅程共用資料庫，用旅程 ID 與 collection prefix 分隔；免費資格需確認現有 project。單筆內容快照上限由 MAX_PACK_BYTES 限制低於 Firestore 1 MiB，snapshot payload 不建立索引。回答與事件分開保存，在交易中同時寫入。沒有常駐即時監聽。

```sh
export GCP_PROJECT_ID='your-project-id'
export GCP_REGION='your-chosen-region'
export ALLOWED_ORIGINS='https://your-account.github.io'
npm run deploy:gcp
```

腳本會啟用 API、檢查既有資料庫 mode/edition/區域，必要時建立資料庫、設定 payload 索引豁免、建立專用 runtime 與 build 服務帳號及 Secret Manager 管理金鑰、部署 Cloud Run。它會改動明確指定的 project，因此先確認 project 用途、計費與權限；不採用 gcloud 預設 project。若組織政策禁止公開 Cloud Run 或授權，需由該 project 管理者處理。執行腳本的帳號需要 service usage、Firestore、service account/IAM、Secret Manager、Cloud Build/Artifact Registry 與 Cloud Run 部署權限，並能以兩個服務帳號執行（`iam.serviceAccounts.actAs`）。runtime 帳號只有 `roles/datastore.user` 與特定管理金鑰的 `roles/secretmanager.secretAccessor`；獨立 build 帳號授予 `roles/run.builder`，透過 `--build-service-account` 指定，不使用預設 Compute/Cloud Build 帳號。權限、連線或資源清單錯誤會中止，不當成資源不存在。

Cloud Run min instances 0、max instances 預設 2，`SERVICE_MEMORY` 預設 `512Mi`，給 Node、TypeScript loader、Firestore client 與內容快照保留空間；實際用量需看 Cloud Run metrics 再調整。region、資料庫、prefix、service name、`RUNTIME_ACCOUNT`、`BUILD_ACCOUNT`、CPU、timeout 與 `SOURCE_DIRECTORY` 可由環境變數設定。來源目錄預設為腳本所在 repository；`.gcloudignore` 與 `.dockerignore` 只允許 Dockerfile、package/lock、server/shared TypeScript 與 public/trips JSON，腳本會先檢查實際上傳清單，本機 `.data`、金鑰、邀請、回答、環境檔與測試產物不會上傳。API 有每 instance 的操作速率保護；instance 上限及速率保護都不是帳單硬上限。免費額度、網路流量、建置映像與 Secret Manager 按各服務資格計費。官方 managed export、備份/PITR 不在初版自動啟用；JSON 匯出提高資料可攜性，但不提供自動災難復原。原始回答不設定 TTL。

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


影片卡支援原始 HTTPS 影片及 YouTube 內嵌，顯示時預設靜音，離開卡片或開啟詳情／選項便停止播放；播放與音量使用 SVG 按鈕，影片區域保留左右滑。來源起迄秒數可呈現短片段，原片保留在原發布者平台，出處與署名在詳情。獨立核實的餐廳、商店及活動可透過 config 的 `catalogRequired:false` 和穩定 `placeId` 納入，毋須偽造觀光資料集記錄。

目前臺北測試包有204張：194照片卡、8影片卡、2文字卡，139個場所身份。新增的美食、購物、景點與玩樂交錯呈現；[範圍與拒用候選](docs/content-research/taipei-2026-coverage.json)保留未確認的缺口。舊邀請保留原版內容；新邀請使用最新版。`MAX_CARDS`預設300且可配置，內容快照仍受原有`MAX_PACK_BYTES`限制。
