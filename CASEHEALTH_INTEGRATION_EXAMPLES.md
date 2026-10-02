/**
 * INTEGRATION EXAMPLE: How to add CaseHealth to App.tsx
 * 
 * This shows the exact steps to integrate the new component
 * into your existing application.
 */

// ============================================================
// OPTION 1: Add as a new view in your existing App.tsx
// ============================================================

import CaseHealth from "./components/CaseHealth";
// ... your other imports ...

// In your App component, add this to your views:
const views = {
  // ... existing views ...
  caseHealth: {
    label: "Case Health",
    render: (selectedMatter: MatterSnapshot | null) =>
      selectedMatter ? (
        <CaseHealth matter={selectedMatter} />
      ) : (
        <div className="p-6 text-slate-600">Select a case to view health</div>
      ),
  },
};

// ============================================================
// OPTION 2: Add as a modal/side panel
// ============================================================

function App() {
  // ... existing state ...
  const [showCaseHealth, setShowCaseHealth] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<MatterSnapshot | null>(
    null
  );

  return (
    <div>
      {/* Your existing UI */}
      {/* ... */}

      {/* Add a button to show case health */}
      <button onClick={() => setShowCaseHealth(true)}>
        View Case Health
      </button>

      {/* Modal or panel */}
      {showCaseHealth && selectedMatter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg max-h-screen overflow-y-auto w-full max-w-4xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h2>Case Health Dashboard</h2>
              <button
                onClick={() => setShowCaseHealth(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <CaseHealth matter={selectedMatter} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// OPTION 3: Add to a matter detail page
// ============================================================

function MatterDetailPage({ matterId }: { matterId: string }) {
  const matter = /* fetch from your API/store */ null;

  if (!matter) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Your existing details */}
      <div>
        <h1>{matter.clientName}</h1>
        <p>{matter.description}</p>
      </div>

      {/* Add the case health component */}
      <CaseHealth matter={matter} />

      {/* Your other sections */}
    </div>
  );
}

// ============================================================
// OPTION 4: Add to matter list with quick preview
// ============================================================

function MattersList({ matters }: { matters: MatterSnapshot[] }) {
  const [selectedMatter, setSelectedMatter] = useState<MatterSnapshot | null>(
    null
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* List of matters */}
      <div className="lg:col-span-1 space-y-2">
        {matters.map((matter) => (
          <button
            key={matter.id}
            onClick={() => setSelectedMatter(matter)}
            className="w-full p-4 text-left border rounded hover:bg-slate-50"
          >
            <div className="font-medium">{matter.clientName}</div>
            <div className="text-sm text-slate-500">{matter.number}</div>
          </button>
        ))}
      </div>

      {/* Case health preview */}
      <div className="lg:col-span-2">
        {selectedMatter ? (
          <CaseHealth matter={selectedMatter} />
        ) : (
          <div className="p-6 text-center text-slate-500">
            Select a case to view health
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP-BY-STEP INTEGRATION CHECKLIST
// ============================================================

/**
 * To integrate CaseHealth into your App.tsx:
 * 
 * [ ] 1. Add import at the top:
 *       import CaseHealth from './components/CaseHealth';
 * 
 * [ ] 2. Verify you have MatterSnapshot data available
 *       (already typed in your existing code)
 * 
 * [ ] 3. Add a new view/section/modal to display it
 *       (choose one of the options above)
 * 
 * [ ] 4. Pass the matter prop:
 *       <CaseHealth matter={yourMatterSnapshot} />
 * 
 * [ ] 5. Test with your existing matter data
 *       (or use CaseHealthDemo.tsx for testing)
 * 
 * [ ] 6. Customize styling if needed
 *       (all styling is in Tailwind classes)
 * 
 * [ ] 7. Connect to navigation/routing
 *       (add route or navigation item if needed)
 */

// ============================================================
// MINIMAL WORKING EXAMPLE
// ============================================================

/**
 * The absolute minimum you need to do:
 * 
 * 1. Add this import to App.tsx:
 * 
 *    import CaseHealth from './components/CaseHealth';
 * 
 * 2. Add this somewhere in your JSX:
 * 
 *    {selectedMatter && <CaseHealth matter={selectedMatter} />}
 * 
 * That's it! The component does everything else.
 */

// ============================================================
// TESTING THE COMPONENT
// ============================================================

/**
 * To quickly test without modifying App.tsx:
 * 
 * 1. Import the demo component:
 *    import CaseHealthDemo from './components/CaseHealthDemo';
 * 
 * 2. Render it temporarily:
 *    <CaseHealthDemo />
 * 
 * 3. See the full component with sample data
 * 
 * 4. Verify it displays correctly
 * 
 * 5. Then integrate with real data
 */

// ============================================================
// COMPONENT INTERFACE
// ============================================================

/**
 * CaseHealth component expects one prop:
 * 
 * interface CaseHealthProps {
 *   matter: MatterSnapshot;
 * }
 * 
 * That's the only required prop. It internally extracts
 * all the data it needs from the MatterSnapshot object.
 */

// ============================================================
// IMPORTANT: No additional configuration needed!
// ============================================================

/**
 * The component:
 * - Works with your existing MatterSnapshot type
 * - Requires no additional props or setup
 * - Uses existing dependencies (React, lucide-react, Tailwind)
 * - Handles all data extraction internally
 * - Is fully typed with TypeScript
 * - Compiles successfully with your build
 * 
 * Just import it, pass a matter, and it works!
 */

export {};
