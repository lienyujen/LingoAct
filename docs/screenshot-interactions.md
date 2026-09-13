# 截圖排序與配對

入口：截圖派題的「排序題／配對題」，以及主選單「閱讀與詞彙」同名按鈕。

依據 [InterAct ordering-matching-questions skill](https://github.com/lienyujen/InterAct/tree/main/skills/ordering-matching-questions)，沿用 LingoAct 自訂測驗的驗證、作答與新視窗結果展示，不另建第二套學生身分或課程資料。

- 排序：AI 產生、教師編輯／調整順序、派送時打散；可選語句排序或截圖切塊。切塊預設沒有標準答案。
- 配對：派送時才呼叫 AI；學生把答案放入固定題目格，取代答案時舊答案回到答案區。
- 原截圖預設不派送。切塊採亂序上傳、隨機檔名，避免檔名與上傳時間洩漏答案。
- 正確答案只存在既有私有 quiz_item_keys。學生錯誤回饋不公布完整排序。
- 無標準答案：繳交即完成，不扣分、不呼叫 AI 評分；教師看平均排名與一致／分歧。
- 教師可收合／展開修改答案，重新批改，或改回無標準答案。
- 「再練一次」沿用 teaching_repeat 建立新題目；保留上一輪的作答與成績。
- 拖曳使用 SortableJS，但先復原實際 DOM 再交 React 更新。資料簽章未變時不重建拖曳，避免其他學生的 Realtime 更新打斷草稿。另提供點選／箭頭操作。

## 驗證（2026-09-13）

- pnpm build、pnpm lint、Deno check 通過。
- scripts/test-ordering-results.mjs：平均排名、一致率、平手穩定性。
- scripts/test-screenshot-interactions.mjs：隔離測試場次驗證派送、私有答案、不完整拒收、無答案繳交、改答案重評、移除分數、新一輪與舊紀錄、配對、停止作答。選填 LINGOACT_TEST_IMAGE 時會增加一次付費 AI 配對出題測試；預設不呼叫 AI。
- 瀏覽器真實滑鼠拖曳：配對入格、詞塊入句子區、一般排序，以及內容相同的即時重繪保留作答。
- 尚未以實體手機／平板觸控測試；AI 自動切塊仍需教師檢視邊界與順序。
- Supabase security advisors：既有 bump_participant_presence 有 anon／authenticated 可執行 SECURITY DEFINER 的兩項警告；本次未變更該函式或權限，新功能未新增公開的高權限函式。

資料庫需套用 20260913040302_screenshot_interactions.sql，並部署 presenter-action 與 participant-action。新欄位預設 false，原測驗不改變操作方式。
