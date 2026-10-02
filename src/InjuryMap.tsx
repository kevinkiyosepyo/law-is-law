import { useId, useMemo, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { getInjuryRegions, type InjuryRegionId } from "../shared/injury-map";
import type { MatterSnapshot, SourceRecord } from "../shared/types";
import "./injury-map.css";

// Coordinates follow the patient's anatomy: their right is on the viewer's left.
const locations: Record<InjuryRegionId, [number, number]> = {
  head: [90, 28], neck: [90, 60], "upper-back": [90, 100],
  "lower-back": [90, 149], chest: [108, 107], abdomen: [90, 127], pelvis: [90, 173],
  "right-shoulder": [58, 78], "left-shoulder": [122, 78],
  "right-arm": [46, 109], "left-arm": [134, 109],
  "right-forearm": [33, 155], "left-forearm": [147, 155],
  "right-elbow": [38, 135], "left-elbow": [142, 135],
  "right-wrist": [27, 173], "left-wrist": [153, 173],
  "right-hand": [22, 190], "left-hand": [158, 190],
  "right-hip": [69, 174], "left-hip": [111, 174],
  "right-knee": [71, 244], "left-knee": [109, 244],
  "right-ankle": [68, 299], "left-ankle": [112, 299],
  "right-foot": [62, 317], "left-foot": [118, 317],
};

function BodyOutline() {
  return (
    <svg className="injury-body" viewBox="0 0 180 330" aria-hidden="true">
      <path className="injury-silhouette" d="M90 8 C78 8 72 16 73 29 L75 42 Q78 51 83 53 L82 65 Q76 68 60 72 Q49 74 46 85 L37 122 Q33 131 33 141 L25 172 L19 180 L13 192 Q12 195 15 195 L21 188 L19 203 Q20 207 23 203 L28 192 L29 199 Q32 201 34 194 L36 181 L38 174 L48 147 Q52 140 51 132 L61 101 L64 129 Q65 139 60 154 Q56 171 60 187 L63 228 Q60 241 63 253 L65 295 L63 307 L56 317 Q53 324 62 324 L72 322 Q78 320 77 314 L77 297 L81 257 Q83 247 80 238 L87 195 Q88 187 90 186 Q92 187 93 195 L100 238 Q97 247 99 257 L103 297 L103 314 Q102 320 108 322 L118 324 Q127 324 124 317 L117 307 L115 295 L117 253 Q120 241 117 228 L120 187 Q124 171 120 154 Q115 139 116 129 L119 101 L129 132 Q128 140 132 147 L142 174 L144 181 L146 194 Q148 201 151 199 L152 192 L157 203 Q160 207 161 203 L159 188 L165 195 Q168 195 167 192 L161 180 L155 172 L147 141 Q147 131 143 122 L134 85 Q131 74 120 72 Q104 68 98 65 L97 53 Q102 51 105 42 L107 29 C108 16 102 8 90 8 Z" />
      <g className="injury-anatomy">
        <path d="M82 66 Q85 76 90 79 Q95 76 98 66 M60 81 Q73 77 90 82 Q107 77 120 81 M90 80 V161" />
        <path d="M86 91 Q74 86 68 93 M94 91 Q106 86 112 93 M86 99 Q74 95 67 101 M94 99 Q106 95 113 101 M86 107 Q76 103 68 109 M94 107 Q104 103 112 109 M86 115 Q77 112 70 116 M94 115 Q103 112 110 116" />
        <path d="M65 153 Q75 149 85 160 L90 178 L95 160 Q105 149 115 153 M64 167 Q72 179 82 179 M116 167 Q108 179 98 179" />
        <path d="M58 88 L42 133 L29 172 M122 88 L138 133 L151 172 M71 184 L72 236 M109 184 L108 236 M71 253 L69 298 M109 253 L111 298" />
        <ellipse cx="71" cy="244" rx="5" ry="7" />
        <ellipse cx="109" cy="244" rx="5" ry="7" />
        <circle cx="58" cy="81" r="5" /><circle cx="122" cy="81" r="5" />
        <circle cx="39" cy="136" r="4" /><circle cx="141" cy="136" r="4" />
      </g>
      <text x="24" y="66" className="injury-side-label">R</text>
      <text x="150" y="66" className="injury-side-label">L</text>
    </svg>
  );
}

export function InjuryMap({ matter, onSource }: {
  matter: MatterSnapshot;
  onSource: (source: SourceRecord) => void;
}) {
  const regions = useMemo(() => getInjuryRegions(matter), [matter]);
  const [preview, setPreview] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const panelId = useId();
  const titleId = useId();
  const active = regions.find((region) => region.id === (preview ?? pinned));

  function dismiss() {
    setPreview(null);
    setPinned(null);
  }

  return (
    <section
      className="injury-map"
      aria-labelledby={titleId}
      onMouseLeave={() => setPreview(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && active) {
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <div className="injury-map-heading">
        <h2 id={titleId}>Injury Map: {matter.clientName}</h2>
        <span>{regions.length} {regions.length === 1 ? "area" : "areas"} recorded</span>
      </div>
      <div className="injury-map-content">
        <div className="injury-figure">
          <BodyOutline />
          {regions.map((region) => {
            const point = locations[region.id];
            if (!point) return null;
            return (
              <button
                key={region.id}
                type="button"
                className={`injury-hotspot ${active?.id === region.id ? "is-active" : ""}`}
                style={{ left: `${point[0] / 180 * 100}%`, top: `${point[1] / 330 * 100}%` }}
                aria-label={`${region.label} — view injury details`}
                aria-controls={panelId}
                aria-expanded={active?.id === region.id}
                aria-pressed={pinned === region.id}
                onMouseEnter={() => setPreview(region.id)}
                onFocus={() => setPreview(region.id)}
                onClick={() => {
                  setPinned(pinned === region.id ? null : region.id);
                  setPreview(region.id);
                }}
              ><span /></button>
            );
          })}
        </div>
        <div className="injury-map-guide">
          <p className="injury-map-hint">
            {regions.length ? "Hover or tap a marked area." : "No injury areas identified in these records."}
          </p>
          <div className="injury-region-list" aria-label="Recorded injury areas">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                className="injury-region-label"
                onMouseEnter={() => setPreview(region.id)}
                onFocus={() => setPreview(region.id)}
                onClick={() => { setPinned(region.id); setPreview(region.id); }}
                aria-controls={panelId}
                aria-expanded={active?.id === region.id}
              ><span />{region.label}</button>
            ))}
          </div>
          <span className="injury-map-caption">Front view · patient’s R / L<br />Back areas shown on midline</span>
        </div>
        {active && (
          <div className="injury-detail" id={panelId} role="region" aria-label={`${active.label} injury details`}>
            <div className="injury-detail-heading">
              <span>FROM THE RECORDS</span>
              <button type="button" className="injury-detail-close" aria-label="Close injury details" onClick={dismiss}><X size={14} /></button>
            </div>
            <h3>{active.label}</h3>
            <p>{active.summary}</p>
            <div className="injury-detail-sources">
              {active.sourceIds.slice(0, 2).map((id, index) => {
                const source = matter.sources.find((item) => item.id === id);
                return source ? (
                  <button type="button" key={id} onClick={() => onSource(source)} title={source.title}>
                    {index === 0 ? "View supporting evidence" : "Additional source"}<ArrowUpRight size={13} />
                  </button>
                ) : null;
              })}
            </div>
            {pinned === active.id && <span className="injury-detail-pinned">Pinned · close or press Esc to dismiss</span>}
          </div>
        )}
      </div>
    </section>
  );
}
