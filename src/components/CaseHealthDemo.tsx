import React from "react";
import CaseHealth from "./CaseHealth";
import type { MatterSnapshot } from "../../shared/types";

const mockMatterSnapshot: MatterSnapshot = {
  id: "case-001",
  number: "2024-PI-001234",
  clientName: "SAPINI",
  description: "Personal injury case - Motor vehicle accident",
  status: "Active",
  stage: "Personal Injury",
  incidentDate: "2024-08-15",
  attorney: "Jane Smith",
  sourceMode: "sample",
  importedAt: new Date().toISOString(),
  asOf: new Date().toISOString(),
  sources: [
    {
      id: "doc-001",
      type: "document",
      title: "MRI report",
      date: "2024-09-28",
      text: "MRI results show cervical spine injury",
      url: "#",
    },
    {
      id: "doc-002",
      type: "document",
      title: "PT records",
      date: "2024-09-20",
      text: "Physical therapy progress notes",
      url: "#",
    },
    {
      id: "comm-001",
      type: "communication",
      title: "Client phone call",
      date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Discussed treatment options and case timeline",
      url: "#",
    },
    {
      id: "note-001",
      type: "note",
      title: "Treatment follow-up",
      date: "2024-09-20",
      text: "Client completed initial treatment phase",
      url: "#",
    },
    {
      id: "exp-001",
      type: "expense",
      title: "Medical expenses",
      date: "2024-09-15",
      text: "$12,400 in medical expenses recorded",
      url: "#",
    },
  ],
  facts: [
    {
      id: "fact-001",
      label: "Coverage Limit",
      value: "$300K",
      category: "coverage",
      certainty: "recorded",
      sourceIds: ["exp-001"],
    },
    {
      id: "fact-002",
      label: "Accumulated Expenses",
      value: "$12.4K",
      category: "financial",
      certainty: "recorded",
      sourceIds: ["exp-001"],
    },
    {
      id: "fact-003",
      label: "Treatment Status",
      value: "In Progress",
      category: "treatment",
      certainty: "recorded",
      sourceIds: ["note-001"],
    },
  ],
  blockers: [
    {
      id: "block-001",
      title: "Medical records missing",
      description: "Final diagnostic report from specialist not yet received",
      status: "awaiting_response",
      priority: "high",
      owner: "Medical Records Dept",
      nextAction: "Follow up with specialist office",
      sourceIds: ["doc-001"],
      lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "block-002",
      title: "Client hasn't been contacted in 8 days",
      description: "Last communication was 8 days ago, schedule status check",
      status: "not_requested",
      priority: "medium",
      owner: "Case Manager",
      nextAction: "Schedule client check-in call",
      sourceIds: ["comm-001"],
      dueAt: new Date().toISOString(),
    },
    {
      id: "block-003",
      title: "Deadline approaching",
      description: "Medical records deadline in 5 days",
      status: "not_requested",
      priority: "medium",
      owner: "Attorney",
      nextAction: "Prepare deadline extension request if needed",
      sourceIds: [],
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  events: [
    {
      id: "event-001",
      title: "MRI received",
      date: "2024-09-28",
      category: "medical",
      sourceIds: ["doc-001"],
    },
    {
      id: "event-002",
      title: "Client contacted",
      date: "2024-09-25",
      category: "communication",
      sourceIds: ["comm-001"],
    },
    {
      id: "event-003",
      title: "Treatment completed",
      date: "2024-09-20",
      category: "treatment",
      sourceIds: ["note-001"],
    },
  ],
  providers: [
    {
      id: "prov-001",
      name: "Dr. Smith, MD",
    },
    {
      id: "prov-002",
      name: "PT Associates",
    },
  ],
  warnings: [],
};

export function CaseHealthDemo() {
  return (
    <div style={{ width: "100%" }}>
      <CaseHealth matter={mockMatterSnapshot} />
    </div>
  );
}

export default CaseHealthDemo;
