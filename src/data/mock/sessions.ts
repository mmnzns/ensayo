import type { SessionSummary } from "../types";

export const sessions: SessionSummary[] = [
  { id: "s_today", when: "Today, 9:12 PM", group: "This week", mode: "drill", title: "Hiring manager · Kestrel Pay", headline: "38s → 9s", applicationId: "app_kestrel" },
  { id: "s_yesterday", when: "Yesterday", group: "This week", mode: "mock", title: "Leadership · Kestrel Pay", headline: "5 of 6 on point", applicationId: "app_kestrel" },
  { id: "s_oct19", when: "Mon, Oct 19", group: "This week", mode: "drill", title: "Recruiter · general questions", headline: "3 fixes stuck" },
  { id: "s_oct17", when: "Sat, Oct 17", group: "Last week", mode: "drill", title: "Story: Reactivation program", headline: "said 4.8% every time" },
  { id: "s_oct15", when: "Thu, Oct 15", group: "Last week", mode: "drill", title: "Technical · Northpine", headline: "2 fixes stuck", applicationId: "app_northpine" },
  { id: "s_oct13", when: "Tue, Oct 13", group: "Last week", mode: "mock", title: "Recruiter · Kestrel Pay", headline: "4 of 5 on point", applicationId: "app_kestrel" },
];
