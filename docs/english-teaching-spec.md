# LingoAct-English 英語教學改版規格

2026-10-08：英語版已完成第一階段程式實作與本機建置，沿用共用課堂流程；尚未部署後端或發布新版 release。

## 已確認的產品決策

- 英語是教學目標語言；介面與輔助說明可選繁體中文或 English。
- 首頁預設「各級學校」，其他模式為一般英語能力 CEFR、全民英檢 GEPT、多益 TOEIC。
- 各級學校：國小三、四年級；國小五、六年級；國中；普通高中；技術型高中。技高以自己的課綱為準。
- 國中另選七／八／九年級，普通高中另選高一／高二／高三；難度獨立選基礎／一般／進階，切換學段預設第一個年級及一般難度。舊學段代碼仍相容，不把舊「一般」課堂擅自認定為某一年級。
- 年級的篇幅與教學進度是 LingoAct 在官方學段課綱內編寫的建議，不宣稱官方有一份逐年級詞彙或文法清單，不將大考中心六級詞表分配為固定學年。詞彙保留原學段參照，年級策略由 prompt 控制；教師指定已教教材優先。
- 年級代碼：國中 `j7/j8/j9`、普通高中 `h1/h2/h3`；難度以 `-foundation/-advanced` 後綴保存，一般無後綴。選年級時保留難度；換學段時回到第一個年級與一般難度；重按已選學段不重設年級。英文年級按鈕使用 `Grade 7/8/9` 和 `Grade 10/11/12`，長標籤容許換行。
- 年級補修驗證：25 項英語測試、63 項完整離線回歸、型別與後端檢查通過；實際選單渲染於 320/420/600px，國中／高中六種組合皆無按鈕文字或頁面水平溢出。新版教師 EXE 仍待後續打包。
- 線上隔離測試 `scripts/verify-school-grades-live.mjs`：18 種年級／難度組合皆可儲存，派送指定 Grade 8 與 i+2 保持獨立，未改動班級預設；測試課堂已清除。測試發現 `update_session` 原先把有 `system_language` 的英語班改回華語，已限縮中文系統語言規則至非英語班，並驗證儲存後仍為 `en/en108/none`。
- 年級版後端與學生頁已更新：`https://effe61c0.lingoact.pages.dev`；正式學生網址 HTTP 200 且已載入新 JS。教師 EXE／GitHub release 仍暫停打包。
- 學段與 CEFR 不固定換算。國小一、二年級、大學及成人課程可用 CEFR 自訂，不補造官方年級標準。
- 教師須選級別。選填本課詞彙、句型、主題或課本單元；各級學校另有基礎／標準／進階調整，屬產品設定。
- 閱讀保留原程度／i+1／i+2，調整生詞比例、句構及任務，不能自動跳整個 CEFR 等級。
- 各活動沿用開課級別；教師在 prompt 明確要求換級別，僅覆寫該活動。
- 教師派送的文章、貼文、內容、題目、選項、詞彙及句型提示全部保持原文。只有介面及非測驗的學習說明可依學生選擇翻譯；按需呼叫並快取。
- 發音以可理解性為原則，語音口音與程度分開選擇。Phonics／IPA 為可選輔助，不能沿用華語的拼音或注音規則。

## 資料交付與查詢

- `data/english/catalog.json`：四模式、級別、能力摘要、TOEIC 分項門檻與題型、已確認產品決策。
- `data/english/sources.json`：13 個官方來源的出處與用途。
- `data/english/source-lock.json`：取得日期、版本、來源 SHA-256；CEFR 官方 PDF 已透過網頁工具查閱，但主機阻擋 CLI 下載，沒有虛構檔案 hash。
- `data/english/english-standards.sqlite`：已生成的本機 SQLite 研究資料庫，排除於 Git 及發行資產之外。
- `data/english/import-report.json`：實際匯入數量與範圍、交叉核對結果及限制。

資料庫中，`sources` 保存來源；`frameworks`、`levels` 保存分類；`descriptors` 保存有來源的編寫摘要；`competencies` 保存課綱代碼與條文；`vocabulary` 保存词條、級別、詞性、原表項目、別名及頁碼；`grammar` 保存文法參考表的原文行；`official_tables` 保存 GEPT 等官方規格／評分表的原始表格列；`exam_parts` 保存已正規化的 TOEIC 題型；`score_thresholds` 分開保存聽讀說寫門檻。`source_pages` 及 `evidence_search` 用於核對原始證據，不能直接整份放進 AI prompt。

參考表的「1200／800／2000」是官方表名，不是匯入資料列數。原表以括號合併別名和變化形；大考中心也將部分詞形與斜線變體合併列出。保留原條目，不為了湊數自行補詞。高中六個詞彙級別是大考中心的參考分級，**不是 CEFR A1–C2，也不是高中一至六年級**。

```sql
-- 國中基本詞彙查詢
SELECT lemma, entry, aliases, page
FROM vocabulary WHERE list_id = 'basic1200' AND lemma = 'apple';

-- 官方課綱的某項能力
SELECT description, page FROM competencies
WHERE source = 'naer-general-2018' AND code = '1-Ⅱ-1';

-- 多益 B2 不是直接拿證書顏色推論
SELECT skill, minimum, caveat FROM score_thresholds WHERE cefr = 'B2';

-- GEPT 中級的官方規格及評分表，原列保留 rowspan 的影響
SELECT table_number, rows FROM official_tables WHERE source = 'gept-intermediate';
```

重建使用 Codex 的 Python（需 `pypdf`、`pdfplumber`）：

```text
python scripts/fetch-english-standards.py
python scripts/build-english-standards.py
python scripts/test-english-standards.py
```

原始檔快取於 `.codex-tmp/english-sources/`。建庫會核對來源雜湊，並以高中詞彙表的「依級別」和「依字母」兩份排列交叉核對每個詞條、詞性及級別。只有全部通過後才替換資料庫。

## 官方來源與使用界線

- [國教院英語文課綱](https://stv.naer.edu.tw/teaching/course_outline.jsp?lvtype=A)：國中小與普通高中；來源 PDF 見 sources.json。
- [技術型高中英語文課綱](https://stv.naer.edu.tw/data/course_outline/pta_18519_8013652_59836.pdf)：獨立於普通高中保存。
- [大考中心高中英文參考詞彙表](https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309)：111 學年度起適用；封面要求非營利使用註明出處，營利使用須事先書面同意。2026-10-08 使用者確認非商用用途，允許將詞彙專用匯出資料及來源聲明放入 English／完整版；原始研究資料庫仍不打包。
- [CEFR 2020 Companion volume](https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4)：Pre-A1–C2，聽讀說寫與發音等能力；保存精簡編寫摘要與頁碼，不重散布整份原文。
- [GEPT 各級測驗介紹](https://www.gept.org.tw/Exam_Intro/t01_introduction.asp)：目前初、中、中高、高四級；逐級來源另列。
- [GEPT 分項 CEFR 說明](https://www.gept.org.tw/FAQ/FAQ_Show2.asp?FAQClassID=30)：聽讀 A2/B1/B2/C1；說寫 A2+/B1+/B2+/C1+。不以聽讀推定說寫能力。
- [TOEIC 分項 CEFR 對照](https://www.toeic.com.tw/quick-links/faq/how-to-choose/)：聽、讀、說、寫各自保存；C1 閱讀 455 的專家同意比例限制也保存。不建立不存在的 C2 門檻。
- [TOEIC 聽讀題型](https://www.toeic.com.tw/toeic/listening-reading/about/content/)與[說寫題型](https://www.toeic.com.tw/toeic/speaking-writing/about/content/)：題數、時間與題型事實。AI 練習評分不是官方量尺分數。

CEFR、TOEIC 不提供本次可匯入的通用固定分級詞表。補查已找到[GEPT 官方參考字表](https://www.lttc.ntu.edu.tw/tw/vocabulary)：2024年修訂完成，初、中、中高三級；先前將 GEPT 一併列為未找到詞表並不準確，已修正。GEPT 字表尚未匯入及確認重散布條件，高級不虛構固定詞表。GEPT 測驗原始表格已保存；轉為 runtime 題型與評量欄位仍須逐表處理合併儲存格。

## LingoAct 專屬詞彙表

`lingoact-vocabulary.json` 是可隨 English 與完整版打包的詞彙參考資料；`lingoact-vocabulary.csv` 供教師檢視，`lingoact-vocabulary.sqlite` 供本機查詢。重建使用 `python scripts/build-lingoact-vocabulary.py`，驗證使用 `python scripts/test-lingoact-vocabulary.py`。數量與覆蓋範圍見 `data/english/vocabulary-report.json`。

詞庫合併國教院常用詞表與大考中心六級詞表，保留原表條目、別名、詞性及頁碼，再以可明確判讀的斜線變體建立查詢詞形。官方級別仍屬各自來源，不把它換算成 CEFR、年級、GEPT 或 Lexile。未分級的公開教材補充詞保持未分級。括號內的變化形保留在原始證據，不冒充新的官方詞條。

參考龍騰、翰林及南一官方公開的字彙教材介紹，採用 LingoAct 自編的主題分類、詞族、搭配詞、語境辨義及循環複習設計。`publisher-references.json` 記錄逐一來源和涵蓋範圍；翰林2023年1月高中時事通的公開詞條可核對頁碼及檔案雜湊。沒有完整匯入三家各冊課本詞表，不能宣稱完成版本／冊次／課次對齊，也不複製書商釋義、例句、文章或音檔。

`vocabulary-editorial.json` 是人工編寫的起始教學標籤，空欄位代表尚未編修。課堂歷程才能決定複習順序，不使用捏造的出版社字頻排名。非商用來源聲明隨程式放在 `supabase/licenses/english-vocabulary-NOTICE.txt`。

已透過 `scripts/build-english-runtime.py` 建立供 Edge Functions 使用的精簡詞库，接入英語生成的詞彙提示及學校模式閱讀詞彙查詢。每次只取少量相關詞條，不把整份詞庫送入 prompt。CEEC 可選字尾仍回溯同一個原始詞條；原表依級別及依字母排列兩份清單已交叉核對。

## 2026-10-08 實作結果

- 英語开課提供各級學校、CEFR Pre-A1–C2、GEPT 四級、TOEIC 聽讀色級及獨立說寫分項目標，必須選級別。學校模式保留標準代碼，另加產品的基礎／進階選項。
- 各活動沿用共用程度指令；教師明確換級別只作用在本次派題。學校與 TOEIC 顏色不再固定換成 CEFR。
- 聽說與閱讀語音提供美式／英式發音，口音加入快取識別，避免兩種音檔混用。以模型發音指令控制，尚未以真人聽辨驗證所有生成音檔。
- 英語閱讀使用英文詞數、英文詞界及英文文法標記；不生成拼音或注音。文法目前採 LingoAct 編寫的常用類別，不宣稱全部官方文法表均已轉為執行時規則。
- 英文評核保留學習證據；英語說明用適合班級程度的短句。開課選繁體說明時，教師介面和周邊說明仍可使用繁體。英文看圖說寫的標題、詞彙、句型及題目保持英文。
- 學生翻譯仍不能改寫題目與教材；閱讀釋義、文法說明的英文學習參照加上保護標記，按需翻譯且快取。
- 驗證包括模擬 AI 請求的生成與解說、美英口音快取、前後端級別一致、開課儲存、閱讀顯示與原有華語功能回歸。本機建置成功不等於已部署或完成真實課堂驗收。

## 現有程式與實作順序

### 2026-10-09 補修（後端、學生頁已部署；打包仍暫停）

- 開課範例固定使用 `e.g. Beginner English · Tuesday`；共享英文選單縮為 Activities、Current、History、Audio studio、Reading & quizzes 等自然標籤，Huayu／SC 的英文介面同步使用。
- 修正教師控制面板的 grid／flex 最小寬度與換行；聽說視窗內文獨立捲動，保留可編輯逐字稿；英文 KTV 以完整單詞標示，採較小的英文字級。
- 英語閱讀獨立使用英文詞數、詞界與級別策略；文法接上課綱附錄六的 76 個實際項目，排除 PDF 的 17 個分類標題，另保留產品編寫的廣義文法類別。這些英文項目名稱是編輯翻譯，並非官方 CEFR 文法分級。
- 修正學校詞表的字母分段邊界與跨頁匯入；去除 wrong yard、wrist yell、yummy zebra 等誤合併詞條，重建含來源的 6,264 個書面詞形。課綱「1,200／800」為原表名称，拆分原表斜線寫法後的行數為 1,214／794，不宣稱行數等於官方學習總量。
- 英語題目、選項、配對欄、答案、字卡原始釋義與看圖鷹架加入語言檢查；閱讀與自訂測驗最多額外修正一次，仍混入中文等文字時拒絕派送。教師備課方向可中文輸入，不再直接顯示給學生。
- 課堂收尾、延伸練習、作品討論、兩人任務、排序／配對的預設學生題目改為英語；語音辨識與合成的英語班也檢查原稿。這是錯誤文字系統檢查，不宣稱能判斷所有拉丁字母語言。
- 英語學生的說明語言選單只留 English／繁體中文；教材、題目及選項保持原文，繁中僅用於介面與非考試釋義。
- 驗證使用模擬 AI 回應、真正的函式請求與 React 顯示測試；不能代替真實 AI 內容、語音的人工聽辨及整堂課驗收。依使用者要求，後續打包與 release 暫停。

### 本輪檢查與共用問題紀錄

本輪共用程式修正適用 Huayu、SC、English：學生測驗資料驗證延伸到每筆題目與答案，阻擋空項目、物件型題幹、不合法選項與題型進入 React；活動預設標題按教學語言選擇；出題失敗判斷辨識繁體、簡體、英語的既有狀態，避免把失敗永遠當成「出題中」。繁體預設標題保留原文字，國語版沒有進行功能轉換。

英語的繁體中文 AI 評語改為真正按需翻譯並快取，處理舊相容欄位 `zh_tw` 實際裝英文的情況。測验題幹、選項、配對欄、文章和原始答案不翻譯；英語回答中的學習參照加以保護。文件評語與口語評語也採相同輔助翻譯機制，繁體班原本已有的繁體評語不新增 AI 呼叫。

| 活動／題型 | 程度與語言約束 | 本輪證據 |
| --- | --- | --- |
| 閱讀與閱讀測驗 | 選定標準及級別、獨立 i+1／i+2、英文詞界與文法；中文標音不進入英語閱讀 | 實際 CEFR A2、i+1 生成；英語生成／語法與中文回歸測試 |
| 選擇、填空、簡答、排序、配對 | 共用生成器帶入班級程度，題幹、選項、答案同一教學語言；排序／配對答案獨立保存 | 七模式 × 四種英語標準的實際 AI 請求測試；五型真實 AI 生成和學生接收；選擇與簡答真實評分 |
| 寫作、寫作教練 | 同一班級程度與教學語言；提示、鷹架、教練回應走程度政策，說明語言另處理 | 寫作真實生成接收；教練生成器納入程度檢查 |
| 字詞卡 | 詞與基礎釋義保持教學原文、釋義受班級程度限制；翻譯只處理釋義面 | 真實生成、學生接收與字卡音檔；語言保護與進度回歸 |
| 聽說播音室、朗讀、口語回答 | 英語美式／英式；華語標準國語／台灣腔；HSK 普通話；AI 派題與評核帶程度 | 美英對話真實合成、下載與 KTV 時間軸；三種華語標音、合成與快取線上測試 |
| 看圖說寫、圖片排序寫作 | 計畫與題目帶班級程度；詞彙、句型、題目一起派送；英文教材不混中文 | 計畫／派送函式及 React 顯示測試，簡體與繁體保留各自規則 |
| 拍照描述、手寫／圖片／文件作答 | 教師題目原文；AI 評核由呼叫端傳入班級程度與說明語言 | 評核語言、上傳／鷹架路徑與資料表檢查；非所有檔案格式的逐一人工驗收 |
| 造句牆 | 生成器帶入程度與目標語言，教師內容保持原文 | 程度政策與語言保護檢查 |
| 延伸練習、作品討論、兩人任務 | 班級預設程度，教師可改活動程度；討論作品保留原文，A/B 資料按對象授權 | 線上重派、獨立歷史、匿名作品、私人 A/B、並行提交、課後查看 |
| 收尾問題 | 學生提示與題目依班級程度及教學語言，英語不沿用舊中文快取 | 實際處理函式的快取／語言回歸測試 |
| 投票、判斷、文字、貼文、畫面派送、標記等教師自訂活動 | 教師提供的材料不交給翻譯或自動改寫；共用介面按語言顯示 | 原文保護、共用標題、資料表與派送路徑檢查 |

驗證結果：`pnpm lint` 通過；`pnpm test:offline` 的 59 項通過；Python 來源／課綱／考試門檻／詞庫檢查通過；English、Huayu、SC 與共用學生頁建置成功。教師面板及聽說視窗的代表 HTML 版型使用真實 CSS，在 320、420、600px 共六種組合檢查水平溢出與可編輯區高度；這不等於每台裝置、每個真實畫面的人工驗收。

線上測試使用明確指定專案的獨立 UUID 課堂與憑證，在 `finally` 清除課堂；合成音檔透過正式 `delete_session` 一併清理。CLI 的資料庫測試必須依序執行，避免並行初始化登入角色超時。第一輪英語測試七型均生成並接收成功，閱讀驗證誤從 passage 取 question 的 `level_stretch` 而失敗；修正測試後用 `reading-audio` 範圍重新驗證閱讀與語音，再用 `quiz-grading` 驗證真實評分與繁中評語。

可重跑：`pnpm lint`、`pnpm test:offline`；線上測試需先明確設定 `LINGOACT_TEST_PROJECT`，再 `node --test --test-concurrency=1` 指定上述 live fixture 檔案。`test-english-live.mjs` 會使用真實 AI 與 TTS；`LINGOACT_TEST_SCOPE=reading-audio` 或 `quiz-grading` 可限縮範圍。不要把離線模擬回應當成語意品質驗收，也不宣稱所有級別的實際 AI 內容及口音均已人工聽辨。

2026-10-09 共用後端 12 函式已更新；共用學生頁發布於 `https://3cb22f8e.lingoact.pages.dev`，`lingo.ehuayu.org`、`lingoact.ehuayu.org` 的 HTML 與新版 JS 皆匿名 HTTP 200。教師 EXE、桌面安裝包及 GitHub release 尚未重包。

改版前英語軌只有 en108／GEPT／TOEIC，缺少 CEFR 和技高；這些開課選項與對應的後端限制現已補齊。

後端 `reading.ts` 多處依中文分詞、漢語拼音、TBCL／TOCFL 篇幅及語法表運作；英語閱讀必須走獨立語言策略。共用活動及資料格式應保留，華語規則不能帶進英語。

1. 補齊開課模式、CEFR Pre-A1、技高及 TOEIC 聽讀／說寫目標；維持既有課程代碼相容。
2. 將允許用於發行的參考資料整理成小型 runtime catalog；限制來源另處理授權，不把本機研究 DB 直接發行。
3. 依活動只取所需能力、詞彙、文法及規格。用詞形還原／搭配詞／多義詞處理英文，不拿中文分詞器或字數限制評判。
4. 英語閱讀、聽說、看圖說寫、字卡及寫作共用開課程度；每條 AI 生成及評量路徑都有目標語言和說明語言。
5. 英語字卡保留單詞、搭配、例句；非考試釋義可按需翻譯。發音模型、可選 IPA、評分保持同一口音策略。
6. 檢驗同一素材在學校、CEFR、GEPT、TOEIC 模式中產生不同且合宜的任務，並確認華語／簡體／國語版不受影響；再安排部署及打包。
