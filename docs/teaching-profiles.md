# LingoAct 教學版本

LingoAct 的完整版、華語教學版、英語教學版與國語文教學版共用同一份程式碼。
建置時以 `VITE_APP_PROFILE` 選擇教學介面，以 `APP_PROFILE` 選擇 Windows
封裝名稱與 app id；沒有設定時一律是原本的完整版。

| profile | 教學軌 | 預設活動頁 | Windows 執行檔 |
|---|---|---|---|
| `full` | 全部 | 說與寫 | `LingoAct.exe` |
| `huayu` | 華語文 | 聽與朗讀 | `LingoAct-Huayu.exe` |
| `english` | 英語 | Listen & read aloud | `LingoAct-English.exe` |
| `guoyu` | 國語文 | 閱讀與詞彙 | `LingoAct-Guoyu.exe` |

專門版不顯示不適用的教學語言選擇，但場次、題目、學生頁與後端資料格式都不分叉。
AI 題目難度、標音、語音與評量規則仍由場次的 `teaching_language`、
`level_framework`、`level_code` 與 `reading_annotation` 決定。

完整版保留原本的 app id、產品名稱及 `lingoact_course_presets_v1`，因此升級後不會失去
原有設定。三個專門版各有自己的 app id、Windows 使用者資料目錄與課程預設 key，能在
同一台電腦並存。

英語選單使用同一套活動元件，但在 `locale-en` 下改成圖示與文字並排的橫列，並允許標題
正常換行；這個修正也適用於完整版中選擇英語教學軌的課程。

## 本機資料夾建置

```powershell
pnpm desktop:folder
pnpm desktop:folder:huayu
pnpm desktop:folder:english
pnpm desktop:folder:guoyu
```

輸出分別位於 `LingoAct/`、`LingoAct-Huayu/`、`LingoAct-English/` 與
`LingoAct-Guoyu/`。這些資料夾會包含本機 `.env`，只供開發測試。

## 發行封裝

```powershell
pnpm desktop:package
pnpm desktop:package:huayu
pnpm desktop:package:english
pnpm desktop:package:guoyu
```

GitHub Release 工作流程會一次產生四版的 zip 與 portable exe；發行建置不含 `.env`。
