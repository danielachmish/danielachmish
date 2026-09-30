# מיפוי תנאי קבלה לבדיקות

מקרא: ✅ עובר · 🟡 עובר עם ספק דמה בלבד (לא נבדק מול sandbox) · I = integration (PostgreSQL אמיתי), U = unit, E = e2e (דפדפן + worker אמיתי).
כל הבדיקות הכספיות רצות מול PostgreSQL אמיתי עם תפקיד הריצה המוגבל – לא mocks.

| תרחיש | בדיקה | מצב |
|---|---|---|
| חוב 300 ותשלום מאומת 300 → יתרה 0, הקצאה מלאה, אין תזכורת | I `ledger.test.ts` "debt 300, verified payment 300"; I `portal-messaging` "paid between scheduling and sending" | ✅ |
| חוב 300 ותשלום 100 → יתרה 200 | I `ledger.test.ts` "debt 300, payment 100"; I `payments` "partial amount"; E `portal.spec` | ✅ 🟡 |
| נדרים 180+120, תשלום 200 → 180/20, יתרה 100; ואז 100 → 0 | I `ledger.test.ts` "pledges 180 + 120…" | ✅ |
| callback חוזר 10 פעמים וגם במקביל | I `ledger.test.ts` replay ×10; I `payments` "same callback 10 times sequentially and concurrently" | ✅ 🟡 |
| כשל / אישור מסגרת / בדיקת כרטיס → אין הפחתה | I `payments` "failure or authorisation only" | ✅ 🟡 |
| עמוד תודה מזויף / חזרה בלבד → אין הפחתה | I `payments` "forged callback … fake thank you"; דף `/pay/return` קורא סטטוס בלבד | ✅ |
| סגירת דפדפן אחרי חיוב | I `payments` "browser closed and callback lost → poller" | ✅ 🟡 |
| קריסה אחרי קבלת אירוע לפני רישום | I `payments` "crash after storing the event… retry completes once" (כולל עיבוד מקביל) | ✅ |
| סכום/מטבע/חשבון/בקשה שגויים → חריג, אין שיוך | I `payments` "amount mismatch", "unknown account", "charge that does not exist" | ✅ 🟡 |
| שני חיובים שונים של 300 לחוב 300 → חוב 0 זכות 300 | I `ledger.test.ts` "two different verified charges" | ✅ |
| תשלום 300 והחזר 100 → נפתח חוב 100 | I `ledger.test.ts` refunds; I `payments` "refund via provider callback" | ✅ 🟡 |
| החזר כפול / מקביל → פעם אחת, לא מעבר למקור | I `ledger.test.ts` "duplicate and concurrent refunds" | ✅ |
| החזר לפני אירוע החיוב | I `payments` "refund that arrives before the charge is held" | ✅ 🟡 |
| אירוע כשל ישן אחרי הצלחה | I `payments` "late failure event after success" | ✅ 🟡 |
| שני בתי כנסת עם אותו טלפון | I `isolation` "same phone…"; I `portal-messaging` "same phone in two synagogues…", "routes by the synagogue's WhatsApp account"; E `whatsapp.spec` | ✅ |
| שני מתפללים באותו בית כנסת | I `isolation` "portal context limits to the authorised card"; I `portal-messaging` "congregant sees only their card"; I `payments` "cannot create a request for another card" | ✅ |
| גישה ללקוח אחר דרך URL / שרת / SQL / cache / job | E `gabbai.spec` "not reachable by URL"; I `isolation` (SQL עם תפקיד הריצה, הכנסה/עדכון חוצי-לקוח, FK מורכב, 40 בקשות מקבילות, pool); exports רצים בהקשר tenant (I `billing-import` "export … only the tenant's own data"); jobs רצים ב-`systemCtx(tenantId)`; אין מטמון משותף (no-store) | ✅ |
| דיווח מזומן/צ׳ק ממתין → חוב לא יורד, תזכורות נעצרות | I `ledger` "cash reported…", "rejected check"; I `portal-messaging` reminders; E `gabbai.spec` "pending check" | ✅ |
| בירור / opt-out / אין הסכמה → אין משלוח יזום | I `portal-messaging` reminders + bot | ✅ |
| לחיצה כפולה על שמירת נדר | I `ledger` clientOpId; E `gabbai.spec` dblclick → נדר יחיד | ✅ |
| תזכורת נקבעה ואז שולם → בדיקה לפני משלוח | I `portal-messaging` "paid between scheduling and sending"; הקישור מחשב יתרה בזמן אמת | ✅ |
| timeout לא ידוע במשלוח הודעה | I `portal-messaging` "unknown send outcome … never resent" | ✅ 🟡 |
| תשלום אחרי שינוי יתרה או ביטול/השעיית מנוי | I `payments` "payment after the pledge was reduced", "suspended subscription … pending charge still completes" | ✅ |
| ספק/OTP דמה במצב ייצור → חסימה | U `money.test` "configuration guards"; `registry.ts`; `/dev` מחזיר 404 בייצור (נבדק עם `next start`) | ✅ |
| ייצוא ושחזור גיבוי | I `billing-import` export; `scripts/restore-check.sh` – טביעת אצבע תואמת | ✅ |

## תנאים נוספים מהשלבים
| תנאי | בדיקה | מצב |
|---|---|---|
| תפקיד הריצה אינו superuser / owner / BYPASSRLS | I `isolation` "runtime database role" | ✅ |
| היעדר הקשר → אין נתונים | I `isolation` "without context sees nothing"; I `ledger` "no context" | ✅ |
| הקשר לא דולף בין חיבורי pool | I `ledger` + `isolation` pool hygiene | ✅ |
| אין עדכון סכום נדר / מחיקת עסקה | I `ledger` corrections | ✅ |
| OTP: תפוגה, ניסיונות, תדירות | I `portal-messaging` OTP | ✅ |
| קישור פג/מבוטל/מועבר לא חושף | I `portal-messaging`; E `portal.spec` | ✅ |
| שינוי טלפון מבטל סשנים וקישורים | I `portal-messaging` | ✅ |
| הרשאת משפחה מפורשת בלבד | I `portal-messaging` "family card" | ✅ |
| חלון שליחה, חגים, מעבר שעון | U `calendar.test` | ✅ |
| מכסה / מנוי מושעה | I `portal-messaging` "quota exhausted or suspended" | ✅ |
| מנוי: ניסיון → חשבונית → חיוב → פעיל; כשל → חסד → השעיה; ידני → פעיל | I `billing-import` | ✅ 🟡 |
| כשל חיוב מנוי לא משנה יתרות מתפללים | I `billing-import` | ✅ |
| החלפת גבאי מתועדת, גבאי ראשי אחד | I `billing-import`; אינדקס ייחודי חלקי | ✅ |
| מסך מנהל ללא נתוני מתפללים | I `billing-import`; E `admin.spec` | ✅ |
| ייבוא CSV: תצוגה מקדימה, שגיאות שורה, מניעת ייבוא חוזר, ללא מיזוג לפי שם | I `billing-import` | ✅ |
| ייצוא מנטרל נוסחאות | U `money.test` csv; I `billing-import` | ✅ |
| מסכים ב-360/768/1440 ללא גלילה אופקית, RTL | E `visual.spec` (צילומים ב-`test-results/screens`) | ✅ |
| תשלום מקצה לקצה בנייד 360px כולל worker | E `portal.spec` | ✅ 🟡 |
| יעד פיילוט: 30 נדרים ב-5 דקות | **טרם נמדד** – דורש בדיקה אנושית | ⏳ |
| מול sandbox אמיתי של PayPlus / WhatsApp | **לא בוצע** – אין גישה לתיעוד/הרשאות | ⛔ |
