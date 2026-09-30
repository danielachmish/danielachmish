import { PledgeImport } from "@/components/gabbai/csv-tools";

export default function PledgeImportPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">ייבוא נדרים מקובץ CSV</h1>
      <p className="text-sm text-slate-600">כל שורה משויכת לכרטיס לפי מזהה חיצוני או טלפון – אף פעם לא לפי שם. קובץ שכבר יובא נחסם.</p>
      <PledgeImport />
    </>
  );
}
