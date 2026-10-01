# העלאה לאוויר – גרסת אמת (פיילוט)

גרסת האמת היא **פרויקט נפרד ב-Vercel עם מסד נתונים נפרד**. אתר ההדגמה נשאר כמו שהוא.
בגרסת האמת אין נתוני דמו, אין תיבת בדיקה, הכניסה בטלפון מוסתרת, וקודי אימות נשלחים בדוא״ל.
אפשר לעבוד בלי חברת סליקה: נדרים, מזומן/העברה/צ׳ק, תזכורות מהוואטסאפ של הגבאי, חשבונות מתפללים, דוחות.

## 1. דוא״ל (Resend) – חובה
1. resend.com → Domains → `nedarim.danielachmish.com` → הרשומות ב-box → **Verified**.
2. API Keys → Create → הרשאת **Sending access** → מעתיקים את המפתח (מוצג פעם אחת; לא שולחים אותו בצ׳אט).

## 2. פרויקט חדש ב-Vercel
1. Add New → Project → אותו ריפו (`synagogue-saas`) → שם, למשל `nedarim`.
2. **לפני Deploy** – Environment Variables:

| משתנה | ערך |
|---|---|
| `APP_ENV` | `production` |
| `APP_SECRET` | 40+ תווים אקראיים (מנהל סיסמאות / הקלדה אקראית). **לשמור עותק במקום בטוח** – ממנו נגזר מפתח ההצפנה |
| `CRON_SECRET` | עוד 40 תווים אקראיים (להפעלת המשימות היומיות) |
| `ADMIN_EMAIL` | הדוא״ל שלך – ייפתח לך חשבון מנהל המערכת |
| `RESEND_API_KEY` | המפתח מ-Resend |
| `EMAIL_FROM` | `נדרים <no-reply@nedarim.danielachmish.com>` |
| `APP_BASE_URL` | `https://nedarim.danielachmish.com` |
| `SUPPORT_EMAIL` | (רשות) כתובת לפניות, מוצגת בתנאי השימוש |

3. Storage → Create Database → **Neon** → Connect לפרויקט (כל קידומת).
4. Deploy. בלוג הבנייה אמורות להופיע השורות `✓ configuration valid`, `✓ runtime role ready` ו-`✓ admin account created`.

## 3. כתובת האתר
1. בפרויקט: Settings → Domains → `nedarim.danielachmish.com` → Vercel מציג רשומת CNAME.
2. ב-box: רשומת CNAME → Hostname: `nedarim` → Target: הערך מ-Vercel.
3. אחרי שהדומיין פעיל: Deployments → Redeploy.

## 4. כניסה ראשונה
- יגיע אליך דוא״ל "איפוס סיסמה" → בוחרים סיסמה → נכנסים ב-`/login` → עמדת הניהול.
- לא הגיע? `/forgot-password` עם `ADMIN_EMAIL`.
- עמדת הניהול → "הצטרפות בית כנסת חדש" → הגבאי מקבל קישור לבחירת סיסמה.

## מה המערכת בודקת לבד
- בנייה נכשלת (במקום אתר תקול) אם ההגדרות מסוכנות: ספקי דמה בייצור, כתובת מקומית, סודות חסרים.
- בלי דוא״ל מוגדר – עמדת הניהול מציגה אזהרה ולא מוסיפה גבאים.
- `/dev/*` מחזיר 404, ואין שום חשבון דמו.

## לפני גבייה מלקוחות
- עורך דין: תנאי שימוש ומדיניות פרטיות (`/terms`, `/privacy` – טיוטה), חוק הגנת הפרטיות.
- חברת סליקה לכל בית כנסת (PROVIDER_SETUP.md).
