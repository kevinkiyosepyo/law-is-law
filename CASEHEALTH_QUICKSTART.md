/**
 * QUICK START: CaseHealth Component Integration
 * 
 * This guide shows how to quickly integrate the CaseHealth component
 * into your existing application.
 */

// ============================================================
// STEP 1: Import the component
// ============================================================

import CaseHealth from './components/CaseHealth';
import type { MatterSnapshot } from '../shared/types';

// ============================================================
// STEP 2: Use it in your application
// ============================================================

function YourCaseView() {
  // Get your matter data from your store/API
  const matter: MatterSnapshot = {
    // ... your matter data with:
    // - facts (coverage, expenses)
    // - sources (documents, communications)
    // - blockers (items needing attention)
    // - events (timeline events)
    // - providers (involved providers)
  };

  return (
    <div>
      <CaseHealth matter={matter} />
    </div>
  );
}

// ============================================================
// STEP 3: Test with sample data (optional)
// ============================================================

// Option A: Use the provided demo component
import CaseHealthDemo from './components/CaseHealthDemo';

function TestPage() {
  return <CaseHealthDemo />;
}

// Option B: Provide your own test data
const testMatter: MatterSnapshot = {
  id: "case-001",
  number: "2024-PI-001",
  clientName: "John Doe",
  description: "Personal injury case",
  status: "Active",
  stage: "Personal Injury",
  sourceMode: "sample",
  importedAt: new Date().toISOString(),
  asOf: new Date().toISOString(),
  sources: [
    {
      id: "1",
      type: "document",
      title: "MRI report",
      date: "2024-09-28",
      text: "MRI results",
      locator: "doc-123",
      url: "#",
    },
    {
      id: "2",
      type: "communication",
      title: "Client call",
      date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      text: "Discussed case progress",
      url: "#",
    },
  ],
  facts: [
    {
      id: "f1",
      label: "Coverage Limit",
      value: "$300K",
      category: "coverage",
      certainty: "recorded",
      sourceIds: ["1"],
    },
    {
      id: "f2",
      label: "Accumulated Expenses",
      value: "$12.4K",
      category: "financial",
      certainty: "recorded",
      sourceIds: ["2"],
    },
  ],
  blockers: [
    {
      id: "b1",
      title: "Medical records missing",
      description: "Final report not received",
      status: "awaiting_response",
      priority: "high",
      owner: "Records Dept",
      nextAction: "Follow up",
      sourceIds: ["1"],
    },
    {
      id: "b2",
      title: "Client contact needed",
      description: "No contact in 8 days",
      status: "not_requested",
      priority: "medium",
      owner: "Case Manager",
      nextAction: "Schedule call",
      sourceIds: ["2"],
    },
  ],
  events: [
    {
      id: "e1",
      title: "MRI received",
      date: "2024-09-28",
      category: "medical",
      sourceIds: ["1"],
    },
    {
      id: "e2",
      title: "Client contacted",
      date: "2024-09-25",
      category: "communication",
      sourceIds: ["2"],
    },
  ],
  providers: [
    { id: "p1", name: "Dr. Smith" },
  ],
  warnings: [],
};

// ============================================================
// COMPONENT FEATURES AT A GLANCE
// ============================================================

/**
 * The CaseHealth component displays:
 * 
 * 1. HEADER
 *    - Case status (🟢 Active Personal Injury)
 *    - Client name
 *    - Matter number
 *    - Tagline
 * 
 * 2. CASE HEALTH METRICS
 *    - Coverage amount ($300K)
 *    - Total expenses ($12.4K)
 *    - Last contact (8 days ago)
 * 
 * 3. NEEDS ATTENTION SECTION
 *    - High priority blockers (🔴)
 *    - Medium priority blockers (🟠)
 *    - Blocker title + description
 *    - Limited to 3 most urgent items
 * 
 * 4. RECENT CHANGES
 *    - Count of meaningful changes since last visit
 * 
 * 5. MEDICAL JOURNEY
 *    - Visual timeline: 🚗 → 🏥 → 🔬 → 💪 → 👨‍⚕️
 *    - Highlights key milestones
 *    - Shows new diagnoses
 * 
 * 6. CASE STORY
 *    - Recent events with dates
 *    - Links to source documentation
 *    - Most recent 3 events displayed
 * 
 * 7. MISSING PIECES
 *    - Document checklist:
 *      ✓ MRI report
 *      ✓ PT records
 *      ✕ Final bill
 *      ✕ Treatment notes
 * 
 * 8. PROVIDER VIEW CTA
 *    - Secure sharing portal button
 *    - Compliance/accessibility note
 */

// ============================================================
// STYLING & DEPENDENCIES
// ============================================================

/**
 * REQUIRED:
 * - React 18+
 * - TypeScript
 * - Tailwind CSS
 * - lucide-react (for icons)
 * 
 * ALREADY INCLUDED IN YOUR PROJECT:
 * - react@^19.1.1
 * - lucide-react@^0.468.0
 * - TypeScript@^5.9.2
 * - Tailwind CSS (via Vite/build setup)
 */

// ============================================================
// CUSTOMIZATION OPTIONS
// ============================================================

/**
 * The component automatically extracts data from MatterSnapshot.
 * To customize, you can:
 * 
 * 1. Modify the facts extraction logic in getCaseMetrics()
 *    - Currently looks for facts with "coverage" and "expense"
 *    - Change the filter logic to match your data structure
 * 
 * 2. Change the medical journey steps in getMedicalJourney()
 *    - Currently: Accident → ER → MRI → PT → Specialist
 *    - Customize based on your use cases
 * 
 * 3. Modify the document checklist in getDocumentStatus()
 *    - Currently: MRI report, PT records, Final bill, Treatment notes
 *    - Add/remove documents based on your requirements
 * 
 * 4. Adjust colors in getPriorityColor() / getPriorityIcon()
 *    - Customize priority level indicators
 * 
 * 5. Update styling with Tailwind classes
 *    - All styles use Tailwind utilities
 *    - Modify className props for colors, spacing, typography
 */

// ============================================================
// COMMON USE CASES
// ============================================================

/**
 * Use Case 1: Display in a dashboard
 * ─────────────────────────────────────
 * Show case health overview for multiple matters:
 * 
 *   {matters.map(matter => (
 *     <CaseHealth key={matter.id} matter={matter} />
 *   ))}
 * 
 * 
 * Use Case 2: Modal/Sidebar view
 * ──────────────────────────────
 * Display when user selects a case:
 * 
 *   {selectedMatter && (
 *     <Modal>
 *       <CaseHealth matter={selectedMatter} />
 *     </Modal>
 *   )}
 * 
 * 
 * Use Case 3: Case detail page
 * ─────────────────────────────
 * Show full case health on matter details page:
 * 
 *   function CaseDetailPage({ matterId }) {
 *     const matter = useMatter(matterId);
 *     return <CaseHealth matter={matter} />;
 *   }
 */

// ============================================================
// DATA REQUIREMENTS CHECKLIST
// ============================================================

/**
 * Ensure your MatterSnapshot includes:
 * 
 * ✓ sources array with:
 *   - type: "document", "communication", etc.
 *   - title: string
 *   - date: ISO date string
 *   - text: description
 * 
 * ✓ facts array with:
 *   - label: string (e.g., "Coverage Limit")
 *   - value: string (e.g., "$300K")
 *   - category: "coverage" | "treatment" | "financial" | "matter"
 * 
 * ✓ blockers array with:
 *   - title: string
 *   - description: string
 *   - priority: "high" | "medium" | "low"
 *   - status: blocker status string
 * 
 * ✓ events array with:
 *   - title: string
 *   - date: ISO date string
 *   - category: string
 * 
 * ✓ Basic fields:
 *   - id: string
 *   - clientName: string
 *   - number: string
 *   - stage: string
 *   - asOf: ISO date string
 */

// ============================================================
// FILE LOCATIONS
// ============================================================

/**
 * Component file: /src/components/CaseHealth.tsx
 * Demo file:      /src/components/CaseHealthDemo.tsx
 * Documentation:  /CASEHEALTH_COMPONENT.md
 * Visual guide:   /CASEHEALTH_VISUAL_GUIDE.md
 * Quick start:    This file (CASEHEALTH_QUICKSTART.md)
 */

export {};
