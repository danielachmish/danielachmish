# הגדרת ספקים

אין כאן סודות. מפתחות של כל בית כנסת נשמרים מוצפנים (AES-256-GCM) בטבלת IntegrationAccount; מפתח ההצפנה `APP_ENCRYPTION_KEY` נשמר מחוץ למסד (מנהל סודות של סביבת הריצה).

## מצב ספק
`PROVIDER_MODE` = `fake` | `sandbox` | `live`. חשבון מחובר חייב להתאים למצב. בייצור (`NODE_ENV=production`) ההפעלה נכשלת אם `PROVIDER_MODE` אינו `live` או `OTP_CHANNEL=fake`, וכלי `/dev` מחזירים 404.

| ממשק | מימוש | מצב |
|---|---|---|
| PaymentProvider | `fake` (`src/server/providers/fake-payment.ts`) | מומש ונבדק (unit+integration+e2e) |
| PaymentProvider | `payplus` (`src/server/providers/payplus.ts`) | **שלד – לא אומת מול התיעוד, כבוי** (`PAYPLUS_CONTRACT_VERIFIED`) |
| MessagingProvider | `fake` | מומש ונבדק |
| MessagingProvider | `whatsapp_cloud` | מומש לפי מבנה Cloud API הציבורי, **כבוי** (`WHATSAPP_LIVE_ENABLED`), לא נבדק מול Meta |
| IdentityDeliveryProvider (OTP) | `fake` | מומש ונבדק; ערוץ מסחרי – החלטה פתוחה |
| ReceiptProvider | `fake` | מומש; שירות קבלות אמיתי – החלטה פתוחה |
| SaaSBillingProvider | `fake` + תשלום ידני מתועד | מומש; גבייה אוטומטית אמיתית – לא קיימת |
| דוא"ל (אימות/איפוס) | תיבת פיתוח | ספק דוא"ל לייצור – לא מחובר |

## PayPlus – פריטים לאימות לפני הפעלה
סביבת הפיתוח לא הצליחה לגשת ל-docs.payplus.co.il (חסימת רשת), לכן **לא** בוצעה קריאה של התיעוד ולא הוכחת חיבור. יש לעבור על:
1. [Website or app integration](https://docs.payplus.co.il/reference/website-or-app) – נתיב `PaymentPages/generateLink`, שדות חובה, שם שדה המזהה שלנו (`more_info`?), שדות customer, `refURL_callback`.
2. [Validate Requests Received from PayPlus](https://docs.payplus.co.il/reference/validate-requests-received-from-payplus) – שם הכותרת (הנחה: `hash`), אלגוריתם (הנחה: HMAC-SHA256 base64 עם secret key), **על איזה תוכן** מחושב (גוף גולמי?). לוודא שחל על callback ולא רק על תגובת API.
3. [Callback response](https://docs.payplus.co.il/reference/get_yourdomain-yourendpoint) – שדות: מזהה עסקה, מזהה page request, terminal/חשבון מקבל, סכום, מטבע, סוג (charge / approval J5 / check / refund), status_code.
4. שאילתת סטטוס שרת-לשרת (IPN / Transaction report) – הנתיב והשדות; זו האמת שעליה נשען `fetchTransaction`.
5. החזרים – איך מזוהה החזר ומה המזהה של העסקה המקורית.
6. API לרשימת עסקאות לתאריך (להתאמה יומית). אם אין – `listTransactions` מחזיר null ונפתחת תקלת "נדרש ייבוא דוח ידני".
7. סביבת sandbox, כרטיסי בדיקה, ותהליך הצטרפות נפרד לכל בית כנסת (חשבון מקבל של בית הכנסת).
8. הפקת קבלה (אם דרך PayPlus או שירות מסמכים חיצוני).

לאחר האימות: לעדכן את `payplus.ts` (כל `TODO(verify)`), להוסיף בדיקות חוזה מול דוגמאות אמיתיות, להריץ את תרחישי `tests/integration/payments.test.ts` מול sandbox (כולל סגירת דפדפן ו-callback חוזר), ורק אז להגדיר `PAYPLUS_CONTRACT_VERIFIED=true`.

### משתנים
- `PAYPLUS_API_BASE` – כתובת sandbox/live (ברמת הפלטפורמה).
- לכל בית כנסת (מוצפן, מוזן במסך ההגדרות): `apiKey`, `secretKey`, `paymentPageUid`, ומזהה מסוף כ-`externalAccountId` (משמש לניתוב callbacks).
- כתובת callback: `https://<domain>/api/providers/payment/payplus/callback`.

## WhatsApp Business (Cloud API)
- כתובת webhook: `https://<domain>/api/providers/messaging/whatsapp_cloud/webhook` (GET לאימות עם `WHATSAPP_VERIFY_TOKEN`, POST עם חתימת `X-Hub-Signature-256` ו-`WHATSAPP_APP_SECRET`).
- לכל בית כנסת: מספר משלו (`phone_number_id` = `externalAccountId`) ו-access token מוצפן.
- **החלטה פתוחה:** התאמת תזכורות נדרים למדיניות Meta (תבנית utility מאושרת), הסכמות וה-opt-in. אין להפעיל `WHATSAPP_LIVE_ENABLED` לפני הכרעה.
- ה-API אינו מספק מפתח idempotency; בתוצאה לא ידועה ההודעה מסומנת "unknown" ונפתחת משימה – אין שליחה חוזרת עיוורת.
- [WhatsApp Business policy](https://whatsappbusiness.com/policy/) · [Utility conversations](https://whatsappbusiness.com/products/conversation-categories/utility/)

## OTP
`OTP_CHANNEL=fake` בפיתוח בלבד. ערוץ מסחרי (WhatsApp authentication template / SMS) – החלטה לפני השקה; מימוש חדש של `IdentityDeliveryProvider` ב-`registry.ts`.
