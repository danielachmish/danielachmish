# התקדמות

עודכן: 30.09.2026

## הושלם
- שלבים 0–12 במימוש עם ספקי דמה (פירוט ב-IMPLEMENTATION_PLAN.md, מיפוי בדיקות ב-ACCEPTANCE.md).
- סכמה + 5 migrations (כולל RLS, הרשאות עמודה, FKs מורכבים, פונקציות ניתוב).
- מנוע כספי, סליקה (inbox + אימות שרת), החזרים, התאמה, פורטל + OTP, בוט, תזכורות, outbox, מנויים, מסכי גבאי/מנהל, ייבוא/ייצוא, worker, seed.
- גיבוי ושחזור הוכחו (`scripts/restore-check.sh`).

## בדיקות שבוצעו (30.09.2026)
| פקודה | תוצאה |
|---|---|
| `npm run lint` | נקי |
| `npm run typecheck` | נקי |
| `npm run test:unit` | 33/33 |
| `npm run test:integration` | 77/77 (PostgreSQL 16 אמיתי, תפקיד ריצה מוגבל) |
| `npm run test:e2e` | 21/21 (Chromium, שרת dev + worker אמיתי) |
| `npm run build` | הצליח |
| `scripts/restore-check.sh` | טביעת אצבע זהה |
| `next start` (ייצור) | `/dev/*` → 404, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer` |

## שלב נוכחי
מסירה – ממתין להחלטות בעלים ולגישה לספקים.

## הפעולה הבאה
1. להעביר את הקוד לריפו ייעודי `synagogue-saas` (יצירת ריפו נחסמה בסשן – ראו FINAL_REPORT).
2. לאמת את חוזה PayPlus מול התיעוד (docs/PROVIDER_SETUP.md §PayPlus) ולהריץ מול sandbox.

## חסימות
- אין גישה לתיעוד PayPlus מסביבת הפיתוח (חסימת רשת) ואין הרשאות sandbox.
- אין הרשאות WhatsApp Business / החלטת מדיניות Meta.
- יצירת ריפו GitHub חדש נחסמה (403) – הקוד בענף `ccr-7f24bd8c-svswzs` של `danielachmish/danielachmish`.
