import { ImportWizard } from "@/components/gabbai/import-wizard";

export default function ImportPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">ייבוא מתפללים מקובץ CSV</h1>
      <p className="text-sm text-slate-600">
        בוחרים קובץ, ממפים עמודות, בודקים תצוגה מקדימה ורק אז מייבאים. שורות לא נמזגות לפי שם; מזהה חיצוני מונע ייבוא כפול. יתרת פתיחה נרשמת כתנועה.
      </p>
      <ImportWizard />
    </>
  );
}
