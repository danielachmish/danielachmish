# מערכת נדרים וסליקה לבתי כנסת

מערכת SaaS בעברית (RTL) לניהול נדרים, תשלומים ותזכורות בבתי כנסת: גבאי מנהל מתפללים ונדרים, מתפלל משלם מהנייד בעמוד אישי מאובטח או מדווח על תשלום אחר, תשלום מאומת מפחית את החוב אוטומטית, ותזכורות נשלחות בוואטסאפ לפי כללים.

> מצב נוכחי: פועל מקצה לקצה עם **ספקי דמה** (סליקה, וואטסאפ, OTP, קבלות, גביית מנוי). חיבורי ספקים אמיתיים טרם נבדקו – ראו `docs/PROVIDER_SETUP.md` ו-`docs/FINAL_REPORT.md`.

## דרישות
- Node.js 22.12+
- PostgreSQL 16 (מקומי או `docker compose up -d`)

## התקנה והפעלה
```bash
# 1. מסד נתונים (אחת משתי האפשרויות)
docker compose up -d                      # יוצר תפקידים ומסדי synagogue / synagogue_test
# או ידנית עם psql כמשתמש-על:
psql -f scripts/db/init-roles.sql && createdb -O synagogue_owner synagogue && createdb -O synagogue_owner synagogue_test
#   ובכל אחד: REVOKE ALL ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO synagogue_owner; GRANT USAGE ON SCHEMA public TO synagogue_app;

# 2. תצורה
cp .env.example .env        # מלאו APP_ENCRYPTION_KEY (32 בתים base64) ו-BETTER_AUTH_SECRET
sed -e "s|/synagogue$|/synagogue_test|" .env > .env.test

# 3. התקנה, migrations ונתוני דמו
npm ci
npm run db:migrate          # Prisma migrations + סכמת התור (pg-boss) + הרשאות
npm run db:seed

# 4. הפעלה (שני תהליכים)
npm run dev                 # http://localhost:3000
npm run worker              # עבודות רקע: callbacks, תזכורות, התאמות, מנויים
```

### כניסה עם נתוני דמו (סיסמה `demo-password-123`)
| משתמש | תפקיד |
|---|---|
| `gabbai1@example.test` | גבאי ראשי – בית כנסת אוהל יעקב (דמו) |
| `gabbai2@example.test` | גבאי ראשי – בית כנסת היכל שלמה (דמו) |
| `admin@example.test` | מנהל השירות |

כלי פיתוח: `/dev/inbox` – הודעות וואטסאפ יוצאות, קודי OTP, מיילים, סימולציית הודעה נכנסת והחזר. דף סליקה מדומה נפתח אוטומטית בתשלום. הכלים חסומים (404) בייצור.

## פקודות
| פקודה | תיאור |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | שרת ווב |
| `npm run worker` | תהליך עבודות רקע (חובה לריצה) |
| `npm run db:migrate` | migrations (בתפקיד הבעלים) + post-migrate |
| `npm run db:seed` / `npm run db:reset` | נתוני דמו / ריקון (פיתוח בלבד) |
| `npm run lint` / `npm run typecheck` | בדיקות סטטיות |
| `npm run test:unit` | בדיקות לוגיקה |
| `npm run test:integration` | בדיקות מול PostgreSQL אמיתי (מסד `_test`) |
| `npm run test:e2e` | Playwright (מאפס את מסד הפיתוח ומזריע) |
| `scripts/backup.sh` / `scripts/restore-check.sh <dump>` | גיבוי והוכחת שחזור |

## מבנה
```
prisma/            schema, migrations (כולל RLS והרשאות), seed
src/server/        לוגיקה: ledger, payments, providers, portal, messaging, reminders, billing, admin, auth
src/worker/        תהליך ה-worker ועבודות מתוזמנות
src/app/           מסכים ונתיבי שרת (Next.js App Router)
tests/             unit / integration / e2e
docs/              איפיון, תוכנית, התקדמות, החלטות, ספקים, קבלה, תפעול, דוח סופי
```
