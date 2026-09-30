import { ReconcileReport } from "@/components/gabbai/csv-tools";

export default function ReconcilePage() {
  return (
    <>
      <h1 className="text-2xl font-bold">התאמה מול דוח חברת הסליקה</h1>
      <p className="text-sm text-slate-600">
        מורידים מממשק חברת הסליקה דוח עסקאות (CSV) לתקופה, מעלים אותו כאן, והמערכת משווה לעסקאות שנקלטו. הבדלים נפתחים כמשימה. היתרות אינן משתנות מהדוח.
      </p>
      <ReconcileReport />
    </>
  );
}
