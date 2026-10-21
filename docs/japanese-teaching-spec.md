# LingoAct-JP 日語教學版

2026-10-20。沿用英語版與共用課堂元件，內部 profile 為 `japanese`，正式名稱、
Windows 執行檔與資料夾為 `LingoAct-JP`。app id、使用者資料與課程預設獨立於英語版。

## 介面與品牌

- 預設日本語；標題列與教師設定可切換「中文」，沿用既有中文介面。
- 教師顯示語言與學生說明語言獨立。切換教師介面不改變教材、答案或學生原文。
- 學生端預設日本語；語言選單僅保留日本語、中文、English，並保留學生自行選擇的既有機制。
- `scripts/japanese-ui-copy.mjs` 保存人工編寫的日文用語與補譯。
  `scripts/build-japanese-locales.mjs` 結合既有日文目錄，檢查缺漏與參數後產生
  `src/lib/japaneseLocales.ts`。不呼叫外部翻譯 API。
- 用語以教師實際操作為準：配信、早押し、授業プラン、学習者、ふりがな、作文コーチ。
- 使用者提供的東禾圖示原稿為 `build/jp-source.png`；保留完整圖樣，不裁去稻穗或書本。
  去背來源為 `build/jp-transparent.png`，外圍透明，內部白色圖案保留。
  學生頁使用隨程式打包的圖檔，右上角連到 `https://www.welearnjapanese.com/`。
  加入頁與課堂頁都依 `b=japanese` 顯示；缺少版本參數的舊連結在載入日語課堂後也會套用。
  有明確版本參數時仍以該版本為準，其他版本保留原有連結。

2026-10-21 已將共用學生頁以 Wrangler Direct Upload 部署至既有 Cloudflare Pages
`lingoact` 正式環境（`lingo.ehuayu.org`），部署為 `f80c8993`。此為本機工作樹建置，
後續從 main 自動部署時須包含本輪來源變更。正式網址已驗證單一東禾圖示的連結與三語選單，
有版本參數及缺少參數但可載入日語課堂的路徑均適用。
已用暫時課堂實際進入 `/participant/` 驗證同一組圖示與三語選單，未派送任何活動。
測試課堂與測試學生在驗證後移除，畫面紀錄於本機 `.codex-tmp/lingoact-jp-live-branding.png`。

## 開課與教學政策

1. 假名入門（`kana`）：平假名、片假名、清濁半濁音、拗音促音長音、綜合練習。
2. 日常溝通（`jf`）：採 JF Standard 六級架構，以自編任務能力摘要指導生成。
3. JLPT（`jlpt`）：N5–N1。保留舊日語課堂與級別的相容性。

必須選擇範圍或級別。教師可在活動指示中覆寫本次級別，班級預設不變；
i+1／i+2 只調整少量生詞、句構或任務，不跳整級。
教師指定的已教詞彙、句型與課本單元優先。預設初級敘述採です／ます體，
教師可要求普通體或按角色使用語體；不因級別提高就一律加上敬語。

JLPT 沒有公布現行完整分級詞彙、漢字、文法表；程式不再將約略數量寫成級別上限。
JLPT 也不直接測量口說與寫作，不把檢定級別固定換算為 JF 等級或口說認證。

依據：[JF Standard](https://www.jfstandard.jpf.go.jp/summaryen/ja/render.do)、
[JLPT FAQ](https://www.jlpt.jp/e/faq/)。沒有匯入或重散布課本、題庫、第三方釋義與音檔。

## 閱讀、讀音與語音

- 日語閱讀走獨立生成路徑，不使用 TBCL 詞庫、中文文法表、拼音或注音。
- 振假名依詞語及上下文對齊：今日／きょう、借りました／かりました。
  分詞接回必須與原文完全相同；讀音不合或內容被改寫時拒絕採用。
- 現有 `words[].pinyin` 是相容的傳輸欄位；日語只在含漢字的詞段存入平假名讀音。
  不將讀音強拆成每個漢字一份；前端共用 ruby 元件。
- 詞彙註解另保存語境詞義、讀音、辭書形與活用標籤。文法採自編日語分類，
  例句與標記必須能在本文找到；不冒稱官方 JLPT 文法表。
- 閱讀、聽力、音讀、字卡共用 `furigana` 標音方式，可關閉；聽力測驗仍不公開台本。
- 日語語音採標準日語，提示長音、促音、撥音、拗音與拍節。
  AI 回饋重視可理解性，不捏造音高重音測量或官方檢定分數。
- 新的 schema 約束同時寫入 `supabase/schema.sql` 與 migration，舊列不改寫。

## 建置與驗證

```text
pnpm build:jp
pnpm desktop:folder:jp
pnpm desktop:package:jp
node --test scripts/test-japanese-teaching.mjs
pnpm lint
pnpm test:offline
```

資料夾版沿用本機開發設定；正式發行必須依 release workflow 不帶 `.env` 建置。
圖示可重建：

```text
node scripts/build-profile-icon.mjs --source build/jp-transparent.png --profile japanese --crop 100 --name LingoAct-JP
```

`scripts/verify-japanese-schema.mjs` 在指定的本機 PostgreSQL binary 上建立可刪除的測試叢集，
補齊 Supabase 平台的角色、Storage bucket 表與 publication，再完整執行真正的
`schema.sql` 兩次及 migration 兩次；不連線到任何使用者專案。

依使用者指示，開發後端於 2026-10-20 改用 `lzhnuzixpwlevsgtifqi`（ap-southeast-1），
本機 `.env` 同步更新為該專案網址與 publishable key。真正的 `schema.sql` 與全部十二個
Edge Functions 已部署。線上 AI 教材品質與實際音檔仍須在課堂情境中持續驗證。

部署後已以暫時課堂驗證三種級別設定、無效級別拒絕、四項資料庫約束及實際 AI 振假名
（今日→きょう、学校→がっこう、日本語→にほんご）；測試課堂已刪除，原有四個課堂保留。
十二個函式皆為 ACTIVE。安全檢查沒有 ERROR；六項 WARN 對應原有三個 SECURITY DEFINER
輔助函式的 anon/authenticated 執行權限，本次未改動其存取設計。

圖示使用內建 imagegen 去背，提示保留紅色輪廓與內部白色稻穗、書本線條，只將外側白底
改為透明。七種 ICO 尺寸的透明外角測試及更新後桌面版啟動檢查均通過。

Windows 工作列的 AppUserModel relaunch icon 直接指向透明 ICO 的內容雜湊副本，
存於使用者資料目錄 `icons/taskbar-<hash>.ico`，避免同一路徑 EXE 的舊白底圖示快取。
AppUserModelId 維持原值，既有偏好設定與課堂不受影響。

## 日語音訊逐字反白

日語與中文一樣以字元作為時間軸單位；轉錄回傳的詞級起訖時間先分配到詞內字元，
只有缺漏部分才在相鄰錨點間插值。不得用連續日文段落作為一個 token，否則詞級錨點
會因 span 不同被丟掉，退回整段平均時間。換行、標點不占反白單位。
合成端重用舊音檔時會辨識過大的日語 cue，重算時間並同步已派送題目的 cue 快照。
明確指定 realignClipId 的修復仍須教師授權，且只能讀取該課堂的音檔。

2026-10-20 已使用原始 47.56 秒壽司文章音檔重取轉錄時間，把舊 14 組反白修為 198
個逐字 cue，並同步既有一題派送內容。音訊未重新合成或上傳，暫時修復課堂已刪除。
原始資料備份保留於使用者家目錄 `.lingoact/backups/`。另有離線測試確認跨段落的
實際詞級起訖時間保留、日文逐字前進及畫面一次只反白對應字元。
