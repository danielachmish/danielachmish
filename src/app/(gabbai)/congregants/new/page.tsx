import { UserPlus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { CongregantForm } from "@/components/gabbai/congregant-form";

export default function NewCongregant() {
  return (
    <>
      <PageHeader title="מתפלל חדש" icon={UserPlus} subtitle="אחרי השמירה אפשר לרשום נדרים, לשלוח תזכורות ולהזמין לאפליקציה." />
      <Card>
        <CongregantForm />
      </Card>
    </>
  );
}
