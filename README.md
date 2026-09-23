# Tools

自己用嘅小工具（PWA，純前端，無後端、無追蹤）。所有資料只存喺裝置嘅 `localStorage`。

- 🎲 **抽籤** — `random-list/` — 抽 N 個不重複／洗牌／逐個抽／隨機數字
- 👥 **分隊** — `team-maker/` — 名單 + 權重，硬性限制「唔可以同隊」／「必須同隊」，權重平均分配

## 加到主畫面

Android Chrome：開工具 → 右上三點 → 「加到主畫面」。

## 開發

```
cd projects/tools-site
./sync.sh          # 由 ../random-list 同 ../team-maker 同步過嚟（會重建 standalone.html）
```

分隊嘅演算法喺 `team-maker/solver.js`（純函數），測試：`node team-maker/test-solver.js`。
