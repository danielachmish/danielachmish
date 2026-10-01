import { FileUp } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PledgeImport } from "@/components/gabbai/csv-tools";

export default function PledgeImportPage() {
  return (
    <>
      <PageHeader title="ייבוא נדרים מקובץ CSV" icon={FileUp} subtitle="כל שורה משויכת לכרטיס לפי מזהה חיצוני או טלפון – אף פעם לא לפי שם. קובץ שכבר יובא נחסם." />
      <PledgeImport />
    </>
  );
}
