# CaseHealth Component - Visual Layout

This document describes the visual structure and layout of the CaseHealth component based on your SAPINI framework.

## Component Layout

```
┌────────────────────────────────────────────────────────┐
│                    HEADER SECTION                      │
│                                                        │
│ 🟢 Active Personal Injury                             │
│ SAPINI                                                │
│ Matter 2024-PI-001234                                 │
│ "Catch me up in 90 seconds"                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│              CASE HEALTH METRICS                       │
│                                                        │
│ Coverage      Expenses      Last Contact              │
│ $300K         $12.4K        8 days ago                │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│            🚨 NEEDS ATTENTION                           │
│                                                        │
│ 🔴 Medical records missing                            │
│    Final diagnostic report from specialist...         │
│                                                        │
│ 🟠 Client hasn't been contacted in 8 days            │
│    Last communication was 8 days ago...               │
│                                                        │
│ 🟠 Deadline approaching                               │
│    Medical records deadline in 5 days...              │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│         ✨ SINCE YOUR LAST VISIT                        │
│                                                        │
│ 3 meaningful changes                                  │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│             🩺 MEDICAL JOURNEY                          │
│                                                        │
│ 🚗 Accident → 🏥 ER → 🔬 MRI → 💪 PT → 👨‍⚕️ Specialist │
│                         ↑                              │
│                    New diagnosis                       │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                📅 CASE STORY                            │
│                                                        │
│ Sep 28  MRI received                 [Source →]       │
│ Sep 25  Client contacted             [Source →]       │
│ Sep 20  Treatment completed          [Source →]       │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│              📂 MISSING PIECES                          │
│                                                        │
│ ✓ MRI report           ✕ Final bill                   │
│ ✓ PT records           ✕ Treatment notes              │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│        [🔐 Provider View 🔐]                           │
│    Secure sharing portal for healthcare providers     │
└────────────────────────────────────────────────────────┘
```

## Visual Styling

### Colors
- **Background**: Gradient from slate-50 to slate-100
- **Cards**: White with subtle shadow and slate-200 border
- **Text**: slate-900 (dark), slate-600 (medium), slate-500 (light)
- **Accents**:
  - 🟢 Green: Active status (text-green-700)
  - 🔴 Red: High priority blockers (text-red-600)
  - 🟠 Orange: Medium priority blockers (text-orange-600)
  - 🔵 Blue: Low priority blockers (text-blue-600)

### Typography
- **Header H1**: 3xl font-bold, slate-900
- **Section Headers H2**: lg font-semibold, slate-900
- **Metric Labels**: xs font-semibold, uppercase, slate-500
- **Metric Values**: 2xl font-bold, slate-900
- **Body Text**: text-sm, slate-600
- **Helper Text**: text-xs, slate-500

### Spacing
- **Card Padding**: 6 units (p-6)
- **Section Gap**: 6 units (mb-6)
- **Internal Gaps**: 3-4 units (gap-3, gap-4)
- **Grid Columns**: 3 for metrics, 2 for documents

### Interactive Elements
- **Provider View Button**: Full width, slate-900 background, hover:slate-800
- **Source Links**: Blue text with hover effect

## Responsive Behavior

- **Max Width**: 4xl container for readability
- **Centering**: Flex center with margin auto
- **Overflow**: Medical journey has horizontal scroll on small screens
- **Grid**: Adapts from 2 columns (mobile) to 3 columns (metrics) to 2 columns (documents)

## Data Extraction Logic

### Case Metrics
- **Coverage**: Searches facts for "coverage" label
- **Expenses**: Searches facts for "expense" label  
- **Last Contact**: Finds latest "communication" source, calculates days ago
- **Priority**: Based on blocker count (high >3, medium >1, low)

### Blockers
- Filtered by priority (high & medium only shown)
- Limited to 3 most urgent items
- Shows title and description
- Includes priority icon (🔴🟠🔵)

### Timeline
- Recent 3 events displayed in reverse chronological order
- Shows date (Mon DD format) and title
- Links to source documentation

### Medical Journey
- Fixed sequence: Accident → ER → MRI → PT → Specialist
- Icons (emoji) for each stage
- Highlights "MRI" step with full opacity
- Shows "↑ New diagnosis" indicator

### Missing Pieces
- Checks for documents: "MRI report", "PT records", "Final bill", "Treatment notes"
- Shows ✓ (green) or ✕ (gray) based on source documents
- Case-insensitive matching on document titles

## Integration Points

### With App.tsx
Add to your main application:

```tsx
import CaseHealth from './components/CaseHealth';

// In your render:
<CaseHealth matter={selectedMatterSnapshot} />
```

### With Backend
Component receives `MatterSnapshot` from your backend/store, which includes:
- Sources (documents, communications, notes, etc.)
- Facts (structured data points)
- Blockers (items needing attention)
- Events (timeline events)
- Providers (healthcare providers involved)

## Accessibility Features

- Semantic HTML with proper heading hierarchy
- High contrast text colors (WCAG AA compliant)
- Icon + text labels for visual indicators
- Clear call-to-action buttons
- Readable font sizes (min 12px)

## Browser Support

- Modern browsers with CSS Grid and Flexbox support
- Tailwind CSS for styling (requires Tailwind setup)
- React 18+ for JSX and hooks
- TypeScript for type safety
