export type WorkflowStatus = "Ready" | "Needs Approval" | "Completed" | "Blocked" | "No Data";
export type WorkflowArea = "today" | "action" | "content" | "inbox" | "bookings" | "crm" | "media" | "brain";

export type WorkflowAction = {
  id: string;
  area: WorkflowArea;
  status: WorkflowStatus;
  title: string;
  detail: string;
  next: string;
  requiresOwnerApproval: boolean;
};

type WorkflowSummary = {
  leads: { total: number; hot: number };
  conversations: { humanRequired: number };
  bookings: { pending: number };
  content: { review: number; published: number };
  radar: { hot: number };
};

export function deriveWorkflowActions(summary: WorkflowSummary, language: "ar" | "en"): WorkflowAction[] {
  const ar = language === "ar";
  const actions: WorkflowAction[] = [];
  if (summary.conversations.humanRequired > 0) actions.push({ id: "inbox-human-review", area: "inbox", status: "Ready", title: ar ? "مراجعة المحادثات البشرية" : "Review human conversations", detail: `${summary.conversations.humanRequired}`, next: ar ? "افتح Inbox ورد يدويًا" : "Open Inbox and reply manually", requiresOwnerApproval: true });
  if (summary.content.review > 0) actions.push({ id: "content-owner-review", area: "content", status: "Needs Approval", title: ar ? "اعتماد المحتوى" : "Approve content", detail: `${summary.content.review}`, next: ar ? "راجع ثم اعتمد أو ارفض" : "Review, then approve or reject", requiresOwnerApproval: true });
  if (summary.bookings.pending > 0) actions.push({ id: "booking-follow-up", area: "bookings", status: "Ready", title: ar ? "متابعة الحجوزات" : "Follow up bookings", detail: `${summary.bookings.pending}`, next: ar ? "افتح الحجوزات" : "Open bookings", requiresOwnerApproval: false });
  if (summary.leads.total > 0) actions.push({ id: "crm-follow-up", area: "crm", status: "Ready", title: ar ? "متابعة العملاء المحتملين" : "Follow up leads", detail: `${summary.leads.total}`, next: ar ? "افتح CRM" : "Open CRM", requiresOwnerApproval: false });
  if (summary.radar.hot > 0) actions.push({ id: "radar-review", area: "crm", status: "Needs Approval", title: ar ? "مراجعة الفرص الساخنة" : "Review hot opportunities", detail: `${summary.radar.hot}`, next: ar ? "راجع قبل أي تواصل خارجي" : "Review before external contact", requiresOwnerApproval: true });
  if (summary.content.published > 0) actions.push({ id: "content-published", area: "content", status: "Completed", title: ar ? "المحتوى المنشور" : "Published content", detail: `${summary.content.published}`, next: ar ? "لا يوجد إجراء مطلوب" : "No action required", requiresOwnerApproval: false });
  if (actions.length === 0) actions.push({ id: "system-no-data", area: "today", status: "No Data", title: ar ? "لا توجد بيانات تشغيلية" : "No operational data", detail: "0", next: ar ? "مصادر البيانات غير متصلة" : "Data sources are not connected", requiresOwnerApproval: false });
  return dedupeWorkflowActions(actions);
}

export function dedupeWorkflowActions(actions: WorkflowAction[]): WorkflowAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}
