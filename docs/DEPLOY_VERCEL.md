# העלאה ל-Vercel (אתר הדגמה)

אתר ההדגמה רץ עם **ספקי דמה בלבד** (`APP_ENV=demo`): אין כסף אמיתי ואין הודעות אמיתיות. יש פס עליון "אתר הדגמה" ותיבת הודעות (`/dev/inbox`) שבה רואים את קודי האימות וההודעות.

## מה הוכן בקוד
- `vercel.json` + `npm run vercel-build`: יוצר את תפקיד המסד המוגבל `synagogue_app`, מריץ migrations, מזריע נתוני דמו (רק במצב demo) ובונה.
- בלי worker קבוע: עיבוד תשלומים והודעות רץ מיד אחרי הבקשה (`after()`), ועבודות מתוזמנות רצות דרך `/api/cron/tick` (מוגן ב-`CRON_SECRET`).
- Vercel Cron פעם ביום (מגבלת התוכנית החינמית) + GitHub Actions כל 10 דקות (`.github/workflows/cron-tick.yml`).
- האפליקציה מתחברת תמיד בתפקיד `synagogue_app` (ללא עקיפת RLS), גם כש-Neon נותן חיבור בעלים.

## הדרך הקצרה – בלי משתני סביבה
פריסה ב-Vercel בלי `APP_ENV` עולה אוטומטית כאתר הדגמה: ספקי דמה, והסודות (סיסמת תפקיד המסד, סוד ההתחברות, מפתח ההצפנה, סוד ה-cron) נגזרים מכתובת המסד שמחובר לפרויקט – סודית ויציבה, וזמינה גם בבנייה וגם בריצה. משתנה שמוגדר במפורש תמיד גובר.
1. בפרויקט: **Storage → Create Database → Neon → Connect**.
2. **Deployments → ⋯ → Redeploy**.
3. כניסה: `gabbai1@example.test` / `demo-password-123` (לשינוי הסיסמה: להגדיר `DEMO_PASSWORD` לפני הבנייה הראשונה).

מגבלות הדרך הקצרה: אם סיסמת המסד מתחלפת, הסודות הנגזרים מתחלפים (משתמשים יתנתקו); ה-cron היומי של Vercel לא יאומת כי Vercel לא מכיר את הסוד הנגזר – להגדרת תזמון יש להגדיר `CRON_SECRET` במפורש. פריסת אמת חייבת `APP_ENV=production` וסודות מפורשים.

## צעדים עם הגדרה מלאה (אפשר מהטלפון)
1. להיכנס ל-https://vercel.com ולהירשם עם GitHub.
2. **Add New → Project** → לבחור `synagogue-saas` (לאשר ל-Vercel גישה לריפו).
3. לפני Deploy, ב-**Environment Variables** להוסיף:

   | שם | ערך |
   |---|---|
   | `APP_ENV` | `demo` |
   | `PROVIDER_MODE` | `fake` |
   | `OTP_CHANNEL` | `fake` |
   | `APP_DB_PASSWORD` | מחרוזת אקראית, 24+ תווים |
   | `BETTER_AUTH_SECRET` | מחרוזת אקראית, 32+ תווים |
   | `APP_ENCRYPTION_KEY` | 32 בתים ב-base64 (`openssl rand -base64 32`) |
   | `CRON_SECRET` | מחרוזת אקראית |
   | `DEMO_PASSWORD` | הסיסמה למשתמשי הדמו |

4. **Deploy**. הבנייה הראשונה תיכשל עם "No database connected" – זה צפוי.
5. בפרויקט: **Storage → Create Database → Neon (Postgres)** → Create → **Connect** לפרויקט (כל הסביבות).
6. **Deployments → ⋯ → Redeploy**.
7. לפתוח `https://<שם-הפרויקט>.vercel.app` ולהיכנס:
   - גבאי: `gabbai1@example.test` / `DEMO_PASSWORD`
   - מנהל השירות: `admin@example.test` / `DEMO_PASSWORD`
8. (רשות – תזכורות אוטומטיות ובדיקת תשלומים פתוחים כל 10 דקות) ב-GitHub: ריפו → Settings → Secrets and variables → Actions:
   - `TICK_URL` = `https://<שם-הפרויקט>.vercel.app/api/cron/tick?job=frequent`
   - `CRON_SECRET` = אותו ערך כמו ב-Vercel

## בדיקה שבוצעה לפני ההעלאה
סימולציה מקומית של הפריסה (`NODE_ENV=production`, `APP_ENV=demo`, ללא worker, מסד שבעליו אינו superuser כמו ב-Neon):
build הצליח (תפקיד, migrations, seed, next build) · כניסת גבאי · תזכורת ידנית · קישור אישי → קוד מתיבת ההודעות → תשלום 100 ₪ → אימות ורישום תוך ~5 שניות → יתרה ירדה מ-300 ל-200 · הודעת אישור נשלחה · `/api/cron/tick` בלי סוד → 401, עם סוד → רץ · חיבורי האפליקציה למסד בתפקיד `synagogue_app`.

## לא לעשות
- לא להגדיר `APP_ENV=demo` בפריסה שמקבלת כסף אמיתי. פריסת אמת = `APP_ENV=production`, `PROVIDER_MODE=live`, ערוץ OTP אמיתי – ואז ספקי הדמה ו-`/dev` חסומים.
