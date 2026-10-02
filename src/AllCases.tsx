import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileArchive,
  FileText,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import type { MatterSummary } from "../shared/types";
import "./all-cases.css";

export type DemoMatter = {
  id: string;
  title: string;
  files: { name: string; size: number }[];
};

const allowedExtensions = new Set(["tex", "pdf", "md", "txt", "zip"]);
const extension = (name: string) => name.split(".").pop()?.toLowerCase() || "";
const formatSize = (size: number) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function AllCases({
  matters,
  demoMatters,
  onOpenMatter,
  onImport,
}: {
  matters: MatterSummary[];
  demoMatters: DemoMatter[];
  onOpenMatter: (id: string) => void;
  onImport: () => void;
}) {
  return <div className="all-cases-page">
    <div className="all-cases-intro">
      <div>
        <span className="eyebrow">CASE WORKSPACE</span>
        <h2>All matters in one place</h2>
        <p>Open an existing matter, or stage a new file import for the demo.</p>
      </div>
      <span className="all-cases-total">{matters.length + demoMatters.length} {matters.length + demoMatters.length === 1 ? "matter" : "matters"}</span>
    </div>

    {!!matters.length && <div className="all-cases-grid">
      {matters.map((matter) => <article className="all-case-card" key={matter.id}>
        <div className="all-case-card-top">
          <span className="all-case-icon"><FolderOpen size={21} /></span>
          <span className={`all-case-origin ${matter.sourceMode}`}>{matter.sourceMode === "sample" ? "Sample data" : matter.sourceMode === "clio" ? "Clio · cached" : "Imported data"}</span>
        </div>
        <span className="all-case-number">{matter.number}</span>
        <h3>{matter.clientName}</h3>
        <div className="all-case-meta">
          <div><span>Current stage</span><strong>{matter.stage || "Not established"}</strong></div>
          <div><span>Open items</span><strong>{matter.blockers}</strong></div>
        </div>
        <button className="all-case-open" onClick={() => onOpenMatter(matter.id)}>Open case <ArrowRight size={16} /></button>
      </article>)}
    </div>}

    {!!demoMatters.length && <>
      <div className="all-cases-group-heading"><h2>New demo imports</h2><span>Files selected locally · content not processed</span></div>
      <div className="all-cases-grid">
        {demoMatters.map((matter) => <article className="all-case-card demo" key={matter.id}>
          <div className="all-case-card-top"><span className="all-case-icon demo"><FileArchive size={21} /></span><span className="all-case-origin demo">Demo import</span></div>
          <span className="all-case-number">READY FOR REVIEW</span>
          <h3>{matter.title}</h3>
          <div className="all-case-file-list">{matter.files.map((file) => <span key={file.name}>{file.name} <small>· {formatSize(file.size)}</small></span>)}</div>
          <p className="all-case-demo-note"><CheckCircle2 size={15} /> Added to this browser session. No file content was uploaded or analyzed.</p>
        </article>)}
      </div>
    </>}

    {!matters.length && !demoMatters.length && <div className="panel all-cases-empty"><FolderOpen size={28} /><h2>No matters yet</h2><p>Add a file to preview how a new matter would appear here.</p><button className="button primary" onClick={onImport}><Upload size={16} /> Import New Matters</button></div>}
  </div>;
}

export function ImportMatterDialog({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (matter: DemoMatter) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function chooseFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const next = Array.from(selected);
    if (next.some((file) => !allowedExtensions.has(extension(file.name)))) {
      setFiles([]);
      setError("Choose .tex, .pdf, .md, or .txt files, or one .zip archive.");
      return;
    }
    if (next.some((file) => extension(file.name) === "zip") && next.length !== 1) {
      setFiles([]);
      setError("Select one ZIP archive by itself, or select individual documents without a ZIP.");
      return;
    }
    setFiles(next);
    setError("");
    if (!title.trim()) setTitle(next[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFiles(event.dataTransfer.files);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !files.length) return;
    onAdd({
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      files: files.map((file) => ({ name: file.name, size: file.size })),
    });
    onClose();
  }

  return <div className="case-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="case-import-dialog" role="dialog" aria-modal="true" aria-labelledby="case-import-title" aria-describedby="case-import-description">
      <div className="case-import-header"><div><span className="eyebrow">NEW MATTER · DEMO</span><h2 id="case-import-title">Import New Matters</h2></div><button ref={closeRef} className="icon-button" aria-label="Close import" onClick={onClose}><X size={18} /></button></div>
      <form onSubmit={submit}>
        <p id="case-import-description" className="case-import-description">Add individual LaTeX, PDF, Markdown, or text files, or one ZIP containing them. This preview creates a case card from filenames only.</p>
        <label className="case-import-label" htmlFor="demo-matter-title">Matter name</label>
        <input id="demo-matter-title" className="case-import-title-input" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name this matter" />
        <input ref={inputRef} className="visually-hidden" type="file" multiple accept=".tex,.pdf,.md,.txt,.zip" aria-label="Choose matter files" onChange={(event) => chooseFiles(event.target.files)} />
        <div className={`case-import-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <span><Upload size={23} /></span>
          <strong>Drop files here</strong>
          <p>or choose files from your computer</p>
          <button type="button" className="button secondary" onClick={() => inputRef.current?.click()}>Choose files</button>
          <small>.tex · .pdf · .md · .txt · or one .zip</small>
        </div>
        {!!files.length && <div className="case-import-selected"><strong>{files.length} {files.length === 1 ? "file" : "files"} selected</strong>{files.map((file) => <div key={file.name}><FileText size={15} /><span>{file.name}</span><small>{formatSize(file.size)}</small></div>)}</div>}
        {error && <p className="case-import-error" role="alert"><CircleAlert size={16} /> {error}</p>}
        <p className="case-import-disclosure">Demo only. Files stay on your device and their contents are not read, uploaded, or added to case evidence.</p>
        <div className="case-import-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!title.trim() || !files.length}>Add demo matter <ArrowRight size={15} /></button></div>
      </form>
    </section>
  </div>;
}
