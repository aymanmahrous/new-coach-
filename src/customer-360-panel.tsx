import { useState } from "react";

type Customer360Lead = {
  id: string;
  name: string;
  phone?: string | null;
  channel?: string | null;
  stage: string;
  score?: number | null;
  intent?: string | null;
  nextFollowUpAt?: string | null;
};

type Props = {
  leads: Customer360Lead[];
  language: "ar" | "en";
  stageLabels: Record<string, string>;
};

export default function Customer360Panel({ leads, language, stageLabels }: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0];
  const date = selectedLead.nextFollowUpAt ? new Date(selectedLead.nextFollowUpAt) : null;
  const followUp = date && Number.isFinite(date.getTime()) ? date.toLocaleString(language === "ar" ? "ar-AE" : "en-AE") : "—";
  const noPhone = language === "ar" ? "لا يوجد هاتف" : "No phone";
  const unknownChannel = language === "ar" ? "قناة غير معروفة" : "Unknown channel";
  const unclassified = language === "ar" ? "غير مصنف" : "Unclassified";
  return <section className="customer-360" aria-labelledby="customer-360-heading"><div className="customer-360__header"><div><span className="eyebrow">{language === "ar" ? "ملف العميل" : "CUSTOMER PROFILE"}</span><h2 id="customer-360-heading">Customer 360</h2><p>{language === "ar" ? "بيانات CRM الحقيقية فقط؛ لا سجل غير متاح." : "Real CRM data only; unavailable history is not shown."}</p></div><select aria-label={language === "ar" ? "اختيار العميل" : "Select customer"} value={selectedLead.id} onChange={(event) => setSelectedLeadId(event.target.value)}>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></div><dl className="customer-360__facts"><div><dt>{language === "ar" ? "المرحلة" : "Stage"}</dt><dd>{stageLabels[selectedLead.stage]}</dd></div><div><dt>{language === "ar" ? "القناة" : "Channel"}</dt><dd>{selectedLead.channel ?? unknownChannel}</dd></div><div><dt>{language === "ar" ? "الهاتف" : "Phone"}</dt><dd>{selectedLead.phone ?? noPhone}</dd></div><div><dt>{language === "ar" ? "النية" : "Intent"}</dt><dd>{selectedLead.intent ?? unclassified}</dd></div><div><dt>{language === "ar" ? "الدرجة" : "Score"}</dt><dd>{selectedLead.score ?? "—"}</dd></div><div><dt>{language === "ar" ? "المتابعة التالية" : "Next follow-up"}</dt><dd>{followUp}</dd></div></dl><div className="customer-360__boundary"><strong>{language === "ar" ? "البيانات غير المتاحة" : "Unavailable data"}</strong><span>{language === "ar" ? "لا يعرض الملف رسائل أو حجوزات غير مرتبطة بعقد CRM." : "Messages and bookings are not shown without a CRM contract link."}</span></div></section>;
}
