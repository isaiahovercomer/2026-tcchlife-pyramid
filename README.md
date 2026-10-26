# 2026-tcchlife-pyramid

台中市召會聚會人數年度統計互動網頁。

- `index.html`：互動式人口金字塔（年份 2023–2026 實際、2027／2030／2035／2040 趨勢延續預估；範圍含台中市召會總數、10 個照顧區合計、41 大區；大區依十個照顧區順序排列；金字塔一屏完整顯示，橫軸附刻度與對比增強切換）
- `forecast.js`：趨勢延續推估模型（年齡推移＋2023→2025 各段實際變化率＋台中市粗出生率推估出生；方法詳見網頁「預估方法與假設」）
- `pyramid-data.json`：年齡 × 性別數據（來源：召會生活人數統計 chlife-stat.org 報表 → 年齡結構匯出；主日、常聚會 ≥2 相異週、身分全部含福音朋友；製表 2026-10-26）

開啟方式：GitHub Pages（Settings → Pages → Deploy from a branch → main → /(root) → Save），網址為 https://isaiahovercomer.github.io/2026-tcchlife-pyramid/
