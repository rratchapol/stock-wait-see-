# US Stock Wait & See Agent MVP

ระบบ MVP สำหรับคัดกรองหุ้นอเมริการายตัวตามแนวคิด Wait & See:

- ดึงข้อมูลราคาจาก Yahoo Finance chart API
- ใช้ Agent 1 คัดหุ้นจาก universe ด้วย liquidity, pullback, trend durability และ volatility
- คำนวณ MA, RSI, ATR, volume ratio และ OBV
- ให้คะแนนตาม checklist V2
- สร้างรายงาน daily brief เป็น Markdown

## วิธีรัน

ต้องใช้ Node.js 18 ขึ้นไป

```powershell
npm run report
```

รายงานจะถูกสร้างในโฟลเดอร์:

```text
reports/
```

หากต้องการทดสอบโดยไม่ดึงข้อมูลจริง:

```powershell
npm run report:sample
```

หากต้องการรันเฉพาะ Agent 1 screener:

```powershell
npm run screen
```

หากต้องการเปิด Agent Office UI:

```powershell
npm run ui
```

จากนั้นเปิด:

```text
http://localhost:4173
```

API ที่ UI ใช้:

```text
GET /api/dashboard
```

หน้า UI แยก path แล้ว:

```text
/dashboard
/office
/watchlist
/positions
/events
```

## ตั้งค่า Watchlist

แก้ไฟล์:

```text
config/watchlist.json
```

ตัวอย่าง:

```json
{
  "portfolioThb": 100000,
  "riskPerTradePct": 2,
  "maxAllocationPctPerStock": 35,
  "tickers": ["AAPL", "MSFT", "NVDA"],
  "positions": []
}
```

## ตั้งค่า Universe สำหรับ Agent 1

แก้ไฟล์:

```text
config/universe.json
```

Agent 1 จะสแกน ticker ในไฟล์นี้ก่อน แล้วเลือก candidate ที่ผ่าน `selection.minSelectionScore` และ `selection.maxCandidates` ใน `config/watchlist.json`

## Fundamental Scoring

ส่วน fundamental scoring ถูกพักไว้ก่อนชั่วคราว เพื่อไปทำส่วนอื่นของระบบให้ครบก่อน ตอนนี้ Agent 1 ใช้เฉพาะ:

- liquidity
- pullback
- trend durability
- volatility

TODO สำหรับกลับมาทำภายหลัง:

- revenue growth
- margin quality
- free cash flow
- debt
- valuation
- earnings revisions
- reliable data provider แทน Yahoo `quoteSummary`

## Action

ระบบใช้ action หลัก:

- `BUY FIRST TRANCHE`
- `BUY ZONE / WAIT FOR CONFIRMATION`
- `WATCH`
- `NO TRADE`
- `DATA ERROR`

## Current Positions

หากเริ่มซื้อหุ้นแล้ว ให้เพิ่มใน `positions` ของ `config/watchlist.json`:

```json
{
  "positions": [
    {
      "ticker": "NVDA",
      "avgCost": 210,
      "shares": 2,
      "entryDate": "2026-06-01",
      "thesis": "Quality growth pullback",
      "stopLoss": 195,
      "takeProfit1": 245,
      "takeProfit2": 280,
      "riskNotes": []
    }
  ]
}
```

Agent 3 จะประเมิน:

- P/L
- ระยะห่างจาก stop loss
- ระยะห่างจาก target
- สถานะ `HOLD`, `WATCH CLOSELY`, `TAKE PARTIAL PROFIT`, `REDUCE RISK`, `EXIT`
- เหตุผลที่ควรถือ/ลด/ขาย/ทบทวน thesis

เพิ่มผ่านเว็บได้ที่:

```text
http://localhost:4173/positions
```

ฟอร์ม `Add Position` จะบันทึกลง `config/watchlist.json` ผ่าน API:

```text
POST /api/positions
DELETE /api/positions/:ticker
```

## News & Earnings Watch

ตอนนี้ระบบรองรับ manual placeholder สำหรับข่าวและ earnings ใน `config/watchlist.json`:

```json
{
  "earnings": {
    "NVDA": {
      "nextDate": "2026-08-20",
      "holdThroughEarnings": false
    }
  },
  "newsNotes": {
    "NVDA": [
      {
        "date": "2026-06-05",
        "type": "manual",
        "impact": "medium",
        "note": "ใกล้ประกาศงบ ควรลดขนาดไม้แรกหรือรอหลังงบ"
      }
    ]
  }
}
```

Impact ที่ใช้ได้:

- `low`
- `medium`
- `high`

กติกาเบื้องต้น:

- earnings ภายใน 1-3 วัน และ `holdThroughEarnings=false` จะถูกมองเป็น high impact
- `medium` หรือ `high` note จะถูกส่งเข้า Agent 3 เป็น risk note
- position ที่มี risk note จะได้ action เป็น `REVIEW THESIS`

TODO ภายหลัง:

- ต่อ news provider หรือ RSS
- ใช้ Gemini API เพื่อสรุปข่าวและจัด impact อัตโนมัติ
- เพิ่ม earnings calendar จาก data provider จริง

## Agent Office UI

UI เป็น MVP แบบ zero-dependency ใช้ Node HTTP server และไฟล์ static ใน `public/`

โครงสร้าง:

```text
public/
  index.html
  app.js
  styles.css
src/
  server.js
  dashboard-data.js
```

จุดประสงค์:

- แสดง dashboard จาก agent ทั้ง 4 ตัว
- แสดง Market Regime, Top Watchlist, Buy Zone, Positions, News & Earnings
- มี Agent Office 3D workspace ด้วย Three.js พร้อมตัวละคร low-poly ขยับเหมือนกำลังทำงาน
- แยก API JSON ออกจาก UI เพื่อให้ย้ายไป React/Vite หรือเพิ่ม Gemini/news API ได้ง่ายภายหลัง

## หมายเหตุเรื่องภาษาไทยใน PowerShell

ไฟล์รายงานเขียนเป็น UTF-8 หาก PowerShell แสดงภาษาไทยเพี้ยน ให้อ่านด้วย:

```powershell
Get-Content -Raw -Encoding utf8 reports\daily-brief-YYYY-MM-DD.md
```

## ข้อจำกัดของ MVP

- Agent 1 ยังใช้ price/liquidity proxy เป็นหลัก ส่วน fundamental scoring ถูกพักไว้ก่อน
- ยังสแกนจาก `config/universe.json` ไม่ใช่หุ้นอเมริกาทุกตัวทั้งตลาดแบบอัตโนมัติ
- ยังไม่ได้ดึงข่าว, earnings calendar หรือ analyst revision อัตโนมัติ มีเพียง manual placeholder
- ยังไม่ได้ตั้ง automation 09:00 น. ไทย
- Yahoo Finance endpoint อาจมี rate limit หรือเปลี่ยนรูปแบบในอนาคต
- ราคาจาก Yahoo chart endpoint ควรถูกตรวจสอบกับ data provider ที่เชื่อถือได้ก่อนใช้เงินจริง

## ขั้นต่อไป

1. เพิ่ม universe screener สำหรับหุ้นอเมริกาทุกตัวพร้อม liquidity filter
2. เพิ่มข่าวและ earnings date สำหรับ Agent 3
3. ตั้ง automation ให้สร้างและสรุปรายงานทุกวันเวลา 09:00 น. ไทย
4. กลับมาเพิ่มข้อมูลพื้นฐานบริษัทสำหรับ Agent 1 หลังเลือก data provider ได้
