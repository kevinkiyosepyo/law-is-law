# CaseHealth Component

A React component that visualizes case health information using the SAPINI framework. Displays critical case metrics, blockers, medical journey, and document status at a glance.

## Usage

```tsx
import CaseHealth from './components/CaseHealth';
import type { MatterSnapshot } from '../shared/types';

function App() {
  const matterData: MatterSnapshot = {
    // ... your matter snapshot data
  };

  return <CaseHealth matter={matterData} />;
}
```

## Component Features

### Case Health Card
- **Coverage**: Insurance/case coverage amount
- **Expenses**: Accumulated expenses
- **Last Contact**: Days since last client communication

### Needs Attention Section
Displays urgent blockers (high/medium priority) with indicators:
- 🔴 High priority (red)
- 🟠 Medium priority (orange)  
- 🔵 Low priority (blue)

### Since Your Last Visit
Shows count of meaningful changes to the case since last review.

### Medical Journey Timeline
Visual progression of medical events:
- 🚗 Accident → 🏥 ER → 🔬 MRI → 💪 PT → 👨‍⚕️ Specialist
- Highlights new diagnoses or key milestones

### Case Story
Recent timeline events with:
- Date of event
- Event title
- Link to source documentation

### Missing Pieces
Checklist of required documents:
- ✓ MRI report
- ✓ PT records
- ✕ Final bill
- ✕ Updated treatment notes

### Provider View
Secure portal for sharing case information with healthcare providers.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `matter` | `MatterSnapshot` | Complete case/matter data including facts, blockers, events, and sources |

## Data Requirements

The component extracts data from `MatterSnapshot`:
- **Facts**: Looks for "coverage" and "expense" facts
- **Sources**: Counts "communication" type sources to calculate last contact
- **Blockers**: Filters and prioritizes by status and priority level
- **Events**: Uses recent events for timeline and journey visualization
- **Asof**: Timestamp for relative date calculations

## Styling

Uses Tailwind CSS with:
- Slate color palette for neutrals
- Green accents for active status
- Red/orange/blue for priority levels
- Responsive grid layouts

## Component Structure

```
CaseHealth
├── Header (status, client name, matter number)
├── Case Health Card (metrics)
├── Needs Attention (blockers)
├── Since Your Last Visit (change count)
├── Medical Journey (timeline visualization)
├── Case Story (recent events)
├── Missing Pieces (document checklist)
└── Provider View (CTA)
```

## Example Integration

Add to your main App.tsx or a dashboard view:

```tsx
import CaseHealth from './components/CaseHealth';

// In your component render:
<CaseHealth matter={selectedMatter} />
```

The component automatically extracts and formats all necessary information from the `MatterSnapshot` type, making it easy to display case health for any matter in your system.
