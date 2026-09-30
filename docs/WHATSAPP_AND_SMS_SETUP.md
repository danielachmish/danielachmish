# הקמת וואטסאפ עסקי ו-SMS

## מה כבר עובד בלי שום חשבון
- **"שליחה מהוואטסאפ שלי"** – בכרטיס מתפלל ובמסך התזכורות. נפתח הוואטסאפ של הגבאי עם הודעה מוכנה וקישור אישי; הגבאי לוחץ "שלח". בחינם, בלי Meta.

## SMS לקודי אימות (Twilio)
1. להירשם ב-https://www.twilio.com (חשבון ניסיון נותן קרדיט; ל-SMS לישראל צריך בדרך כלל חשבון בתשלום).
2. ב-Console: להעתיק **Account SID** ו-**Auth Token**.
3. ליצור **Messaging Service** (Messaging → Services) ולהוסיף לו שולח:
   - מספר Twilio, או **Alphanumeric Sender ID** (למשל `Nedarim`) – לבדוק ב-Twilio אם נדרש רישום מוקדם לשולח אלפאנומרי לישראל.
4. ב-Vercel → Settings → Environment Variables:
   | משתנה | ערך |
   |---|---|
   | `OTP_CHANNEL` | `sms` |
   | `TWILIO_ACCOUNT_SID` | `AC…` |
   | `TWILIO_AUTH_TOKEN` | (Secret) |
   | `TWILIO_MESSAGING_SERVICE_SID` | `MG…` (או `TWILIO_FROM` במקומו) |
5. **באתר ההדגמה**: SMS אמיתי נשלח רק למספרים ב-`DEMO_SMS_ALLOW` (למשל המספר שלך, מופרד בפסיקים). שאר הקודים נשארים בתיבת ההדגמה – כי מספרי הדמו עלולים להיות של אנשים אמיתיים. כדי לבדוק: להוסיף את עצמך כמתפלל עם הטלפון שלך, להגדיר `DEMO_SMS_ALLOW=05X-XXXXXXX`, ולהיכנס ב-`/enter`.

## וואטסאפ עסקי (WhatsApp Cloud API) – חיבור בלחיצה לכל בית כנסת
המודל: אתה "Tech Provider" אחד; כל בית כנסת מחבר חשבון ומספר **שלו** בחלון של Meta. ההודעות יוצאות בשם בית הכנסת והחיוב על ההודעות אצלו.

### אצלך, פעם אחת
1. https://business.facebook.com – ליצור Business Portfolio ולהתחיל **Business Verification**.
2. https://developers.facebook.com → **Create App** → סוג **Business** → להוסיף מוצר **WhatsApp**.
   - מקבלים **מספר בדיקה** ו-**Access token זמני** – אפשר לבדוק מיד (ראו "בדיקה מהירה").
3. **Webhook** (WhatsApp → Configuration):
   - Callback URL: `https://synagogue-saas.vercel.app/api/providers/messaging/whatsapp_cloud/webhook`
   - Verify token: מחרוזת שתבחר – אותה לשים ב-`WHATSAPP_VERIFY_TOKEN`.
   - להירשם לשדה **messages**.
4. **Embedded Signup**: ב-App → Facebook Login for Business → Configurations → ליצור קונפיגורציה ל-WhatsApp Embedded Signup; להעתיק את ה-**Configuration ID**. להוסיף את הדומיין של האתר ל-Allowed Domains.
5. להגיש בקשה להיות **Tech Provider** (לאחר אימות העסק).
6. ב-Vercel:
   | משתנה | ערך |
   |---|---|
   | `META_APP_ID` | מזהה האפליקציה |
   | `META_APP_SECRET` | App Secret (Secret) |
   | `META_ES_CONFIG_ID` | Configuration ID |
   | `WHATSAPP_APP_SECRET` | אותו App Secret (לאימות חתימת webhooks) |
   | `WHATSAPP_VERIFY_TOKEN` | המחרוזת מסעיף 3 |
   | `WHATSAPP_API_BASE` | `https://graph.facebook.com/v23.0` (או הגרסה העדכנית) |
   | `MESSAGING_MODE` | `sandbox` לבדיקות; `live` רק בייצור |
   | `WHATSAPP_LIVE_ENABLED` | `true` רק כשמוכנים לשלוח למתפללים אמיתיים |

### אצל כל בית כנסת
- הגדרות → "חיבור וואטסאפ רשמי" → **"חיבור וואטסאפ עסקי בלחיצה"** (או מנהל השירות עושה זאת בעמוד בית הכנסת).
- בחלון של Meta: כניסה עם פייסבוק, שם העסק (בית הכנסת), מספר טלפון שאינו מחובר לאפליקציית וואטסאפ רגילה, אימות ב-SMS/שיחה.
- המערכת: מחליפה את הקוד למפתח, מחברת webhooks, רושמת את המספר, ויוצרת 3 תבניות לאישור Meta:
  `pledge_reminder` (תזכורת), `payment_confirmation` (אישור תשלום), `otp_code` (קוד אימות).
- אחרי שהתבניות מאושרות: תזכורות אוטומטיות, אישורי תשלום, בוט "1 – החובות שלי", וקודי אימות (`OTP_CHANNEL=whatsapp`).

### בדיקה מהירה עם מספר הבדיקה של Meta (לפני Tech Provider)
1. ב-Vercel: `MESSAGING_MODE=sandbox` + המשתנים מסעיף 6 (אפשר גם בלי `META_ES_CONFIG_ID`).
2. ב-Meta: להוסיף את הטלפון שלך כנמען מאומת של מספר הבדיקה.
3. באתר: הגדרות → חיבור וואטסאפ → ספק **WhatsApp Business (Cloud API)** → Phone number ID + Access token זמני.
4. להוסיף את עצמך כמתפלל עם הטלפון שלך, הסכמה להודעות, נדר → "שליחת תזכורת עכשיו" / לשלוח "1" למספר הבדיקה.
   הערה: תזכורות יזומות דורשות תבנית `pledge_reminder` מאושרת בחשבון הבדיקה (אפשר ליצור ידנית ב-WhatsApp Manager עם אותו נוסח).

## מה לא נבדק מכאן
סביבת הפיתוח לא יכולה לגשת ל-Meta או ל-Twilio. הקוד נבדק מול תשובות מדומות בפורמט התיעוד הציבורי; הבדיקה האמיתית נעשית מהאתר ב-Vercel. שמות שדות ו-endpoints של Meta משתנים בין גרסאות – לאמת מול התיעוד העדכני לפני שידור חי.
