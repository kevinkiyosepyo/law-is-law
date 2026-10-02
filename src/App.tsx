import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type {
  Blocker,
  ClioStatus,
  Fact,
  MatterSnapshot,
  MatterSummary,
  ProviderShare,
  SourceRecord,
} from "../shared/types";

import { shortSummary } from "../shared/short-summary";
import { InjuryMap } from "./InjuryMap";
import { Finances } from "./Finances";
import { MyChart } from "./MyChart";
import { emptyChartSession, type ChartSession } from "../shared/mychart";
import { AllCases, ImportMatterDialog, type DemoMatter } from "./AllCases";
import {
  Integrations,
  StatusUpdatesPreview,
  UpdateDialog,
  sampleDemoEmail,
  sampleDemoEmails,
  type DemoConnection,
  type DemoEmail,
  type DemoOutcome,
  type DemoCheck,
} from "./Integrations";

type View =
  | "overview"
  | "cases"
  | "waiting"
  | "evidence"
  | "finances"
  | "mychart"
  | "sharing"
  | "integrations"
  | "connection";
const viewNames: Record<View, string> = {
  overview: "Matter overview",
  cases: "All Cases",
  waiting: "Waiting Room",
  evidence: "Evidence library",
  finances: "Matter finances",
  mychart: "MyChart",
  sharing: "Provider sharing",
  integrations: "Integrations",
  connection: "Import New Case",
};
const statusNames: Record<Blocker["status"], string> = {
  awaiting_response: "Awaiting response",
  not_requested: "Not requested",
  unavailable: "Unavailable",
  needs_review: "Needs review",
  received_incomplete: "Incomplete response",
};
const sourceNames: Record<string, string> = {
  note: "Note",
  communication: "Communication",
  task: "Task",
  calendar: "Calendar",
  document: "Document",
  field: "Matter field",
  expense: "Expense",
  contact: "Contact",
};
const originNames = {
  sample: "Sample data",
  clio: "Clio · cached",
  import: "Imported data",
};
const certaintyNames = {
  recorded: "Recorded",
  unknown: "Unknown",
  inferred: "Assumption",
};
const date = (value?: string, withYear = false) => {
  if (!value) return "Not recorded";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(withYear ? { year: "numeric" } : {}),
      });
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-dark" : ""}`}>
      <span className="brand-icon">
        <LayoutDashboard size={21} strokeWidth={2.2} />
      </span>
      <span>
        Dashboard<span className="brand-subtitle">ULTRA PRO MAX</span>
      </span>
    </div>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Busy({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={24} />
      <p>{label}</p>
    </div>
  );
}
function Empty({
  title,
  children,
  icon = <FolderOpen size={26} />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ErrorBanner({
  message,
  onClose,
}: {
  message: string;
  onClose?: () => void;
}) {
  return (
    <div role="alert" className="error-banner">
      <CircleAlert size={17} />
      <span>{message}</span>
      {onClose && (
        <button
          aria-label="Dismiss error"
          className="icon-button"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
function Sources({
  ids,
  sources,
  onOpen,
  compact = false,
}: {
  ids: string[];
  sources: SourceRecord[];
  onOpen: (source: SourceRecord) => void;
  compact?: boolean;
}) {
  const found = ids
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is SourceRecord => !!s);
  return found.length ? (
    <span className="source-links">
      {found.map((source, i) => (
        <button
          key={source.id}
          className="source-button"
          title={source.title}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(source);
          }}
        >
          <FileText size={12} />
          {compact
            ? `${i + 1}`
            : source.title.length > 28
              ? `${source.title.slice(0, 28)}…`
              : source.title}
        </button>
      ))}
    </span>
  ) : (
    <span className="no-source">No supporting source</span>
  );
}

export default function App() {
  const match = window.location.pathname.match(/^\/provider\/([^/]+)\/?$/);
  return match ? <ProviderView token={match[1]} /> : <AttorneyApp />;
}

let bootstrapPromise: Promise<unknown> | null = null;
function AttorneyApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("access");
      const existing = await api<{ authenticated: boolean }>("/api/session");
      if (existing.authenticated) {
        if (token)
          history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        if (active) setAuthenticated(true);
        return;
      }
      if (token && !bootstrapPromise) {
        history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        bootstrapPromise = api("/api/bootstrap", post({ token }));
      }
      if (bootstrapPromise) await bootstrapPromise;
      const session = await api<{ authenticated: boolean }>("/api/session");
      if (active) setAuthenticated(session.authenticated);
    })().catch((error) => {
      if (active) {
        setAuthError(error.message);
        setAuthenticated(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  if (authenticated === null)
    return (
      <main className="standalone">
        <Brand compact />
        <Busy />
      </main>
    );
  if (!authenticated)
    return (
      <Login initialError={authError} onLogin={() => setAuthenticated(true)} />
    );
  return (
    <Workspace
      onLogout={async () => {
        await api("/api/logout", post({}));
        bootstrapPromise = null;
        setAuthenticated(false);
      }}
    />
  );
}

function Login({
  initialError,
  onLogin,
}: {
  initialError: string;
  onLogin: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", post({ password }));
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-story">
        <Brand />
        <div className="login-headline">
          <span className="eyebrow light">PERSONAL INJURY CASES</span>
          <h1>
            See what's holding
            <br />up your case.
          </h1>
          <p>
            Track open requests and review the records behind each case.
          </p>
          <div className="login-signal">
            <span className="pulse-dot" /> Evidence behind every finding.
          </div>
        </div>
        <span className="login-footer">YOUR PERSONAL INJURY WORKSPACE</span>
      </div>
      <div className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <div className="small-icon">
            <LockKeyhole size={23} />
          </div>
          <h2>Welcome to your workspace</h2>
          <p>
            Open the private access link printed in your local server terminal,
            or enter your configured workspace password.
          </p>
          {error && <ErrorBanner message={error} />}
          <label className="field-label" htmlFor="password">
            Workspace password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoFocus
          />
          <button className="button primary full-width" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}
            Open workspace
          </button>
          <span className="login-note">
            <ShieldCheck size={15} /> Matter access is protected by a local
            session.
          </span>
        </form>
      </div>
    </main>
  );
}

function Workspace({ onLogout }: { onLogout: () => Promise<void> }) {
  const [view, setView] = useState<View>("overview");
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [matter, setMatter] = useState<MatterSnapshot | null>(null);
  const [clio, setClio] = useState<ClioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [demoConnections, setDemoConnections] = useState<
    Record<DemoConnection, boolean>
  >({
    chatgpt: false,
    gmail: false,
    slack: false,
  });
  const [demoEmail, setDemoEmail] = useState<DemoEmail>(sampleDemoEmail);
  const [demoOutcome, setDemoOutcome] = useState<DemoOutcome>("processing");
  const [demoCheck, setDemoCheck] = useState<DemoCheck>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [demoMatters, setDemoMatters] = useState<DemoMatter[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [chartSessions, setChartSessions] = useState<Record<string, ChartSession>>({});
  async function loadMatters(preferred?: string) {
    const result = await api<{ matters: MatterSummary[] }>("/api/matters");
    setMatters(result.matters);
    const saved =
      preferred || localStorage.getItem("dashboard-selected-matter");
    setSelected((old) =>
      result.matters.some((m) => m.id === (preferred || old || saved))
        ? (preferred || old || saved)!
        : result.matters[0]?.id || "",
    );
  }
  useEffect(() => {
    Promise.all([
      loadMatters(),
      api<ClioStatus>("/api/clio/status").then(setClio),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!selected) {
      setMatter(null);
      return;
    }
    let current = true;
    setLoading(true);
    setMatter(null);
    setSource(null);
    localStorage.setItem("dashboard-selected-matter", selected);
    api<MatterSnapshot>(`/api/matters/${encodeURIComponent(selected)}`)
      .then((data) => {
        if (current) setMatter(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selected, revision]);
  useEffect(() => {
    setDemoCheck(null);
    setShowUpdateDialog(false);
  }, [selected]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("clio");
    if (!outcome) return;
    setView("connection");
    if (outcome === "connected")
      setNotice(
        "Clio access authorized. Refresh case data to verify the connection and import records.",
      );
    else if (outcome === "cancelled")
      setNotice(
        "Clio authorization was cancelled. You can connect again when ready.",
      );
    else
      setError(
        "Clio authorization could not be completed. Check the server configuration and try connecting again.",
      );
    params.delete("clio");
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, selected]);
  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
  }
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const result = await api<{
        matters: MatterSummary[];
        warnings: string[];
      }>("/api/clio/refresh", post({}));
      await loadMatters();
      setClio(await api("/api/clio/status"));
      setRevision((v) => v + 1);
      setNotice(
        result.warnings.length
          ? `Refresh complete. ${result.warnings.join(" ")}`
          : "Clio records refreshed. Your cached matters are up to date.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  const nav = [
    { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
    { id: "waiting" as View, label: "Waiting Room", icon: Clock3 },
    { id: "evidence" as View, label: "Evidence", icon: FileText },
    { id: "finances" as View, label: "Finances", icon: Wallet },
    { id: "mychart" as View, label: "MyChart", icon: Activity },
    { id: "sharing" as View, label: "Provider sharing", icon: Users },
    { id: "integrations" as View, label: "Integrations", icon: Mail },
    { id: "cases" as View, label: "All Cases", icon: FolderOpen },
  ];
  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Brand />
        <div className="workspace-label">
          <span className="workspace-avatar">PI</span>
          <span>
            Personal Injury<span>Case workspace</span>
          </span>
          <ChevronDown size={13} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "waiting" && !!matter?.blockers.length && (
                <span className="nav-count">{matter.blockers.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div>
              <ShieldCheck size={17} />
              <span>Check the source</span>
            </div>
            <p>
              Open the records behind each finding.
              <br />
              Review them before acting.
            </p>
          </div>
          <button
            className={`nav-item ${view === "connection" ? "active" : ""}`}
            onClick={() => navigate("connection")}
          >
            <Settings2 size={18} />
            <span>Import New Case</span>
          </button>
          <div className="sidebar-profile">
            <span className="profile-avatar">AW</span>
            <span>
              Attorney workspace<small>Local & private</small>
            </span>
            <button
              aria-label="Sign out"
              className="sidebar-logout"
              onClick={() => onLogout().catch((e) => setError(e.message))}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="Search matter evidence"
                placeholder="Search evidence…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setView("evidence");
                }}
              />
            </div>
            <button type="button" className="readonly-label">
              <LockKeyhole size={13} /> Read-only case data
            </button>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <ErrorBanner message={error} onClose={() => setError("")} />
          )}
          {notice && (
            <div className="success-banner" role="status">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          <div
            className={`matter-intro ${view === "overview" && matter && !loading ? "has-injury-map" : ""} ${view === "cases" ? "cases-intro" : ""}`}
          >
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR CASES</div>
                <h1>{viewNames[view]}</h1>
                <p>
                  {view === "overview"
                    ? "Review open requests and see what needs attention."
                    : view === "cases"
                      ? "(Attorney / Lawyer view only)"
                    : view === "waiting"
                      ? "Know who you are waiting on, and what to do next."
                      : view === "evidence"
                        ? "The source material behind your case, all in one place."
                        : view === "finances"
                          ? "Review medical bills and payments."
                          : view === "mychart"
                            ? "Review patient records and preview what the attorney receives."
                          : view === "sharing"
                            ? "Give each provider a clear, attorney-approved view."
                            : view === "integrations"
                              ? "Preview a daily inbox check and case updates."
                              : "Import case records or connect Clio."}
                </p>
              </div>
              {view === "cases" && (
                <button className="button primary" onClick={() => setShowImportDialog(true)}>
                  <Upload size={16} /> Import New Matters
                </button>
              )}
            </div>
            {view !== "connection" && view !== "integrations" && view !== "cases" && (
              <div className="matter-bar">
                <div className="matter-select-wrap">
                  <div className="matter-avatar">
                    {matter ? (
                      initials(matter.clientName)
                    ) : (
                      <FolderOpen size={21} />
                    )}
                  </div>
                  <div className="matter-select-label">
                    <label htmlFor="matter-select">ACTIVE MATTER</label>
                    <div className="select-wrapper">
                      <select
                        id="matter-select"
                        aria-label="Select matter"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {!matters.length && (
                          <option value="">No matters imported</option>
                        )}
                        {matters.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.clientName} · {m.number}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} />
                    </div>
                  </div>
                </div>
                <div className="matter-meta">
                  {matter && (
                    <>
                      <Badge
                        tone={
                          matter.sourceMode === "sample" ? "sample" : "blue"
                        }
                      >
                        <span className="badge-dot" />
                        {originNames[matter.sourceMode]}
                      </Badge>
                      <span className="matter-asof">
                        Records as of {date(matter.asOf, true)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            {view === "overview" && matter && !loading && (
              <InjuryMap key={matter.id} matter={matter} onSource={setSource} />
            )}
          </div>
          {view === "cases" ? (
            <AllCases
              matters={matters}
              demoMatters={demoMatters}
              onOpenMatter={(id) => {
                setSelected(id);
                navigate("overview");
              }}
              onImport={() => setShowImportDialog(true)}
            />
          ) : view === "integrations" ? (
            <Integrations
              onOpenMyChart={() => navigate("mychart")}
              myChartLoaded={!!chartSessions[selected]?.connected}
              connections={demoConnections}
              onToggleConnection={(key) => {
                setDemoConnections((current) => ({
                  ...current,
                  [key]: !current[key],
                }));
                setDemoCheck(null);
              }}
              email={demoEmail}
              onEmailChange={(next) => {
                setDemoEmail(next);
                setDemoCheck(null);
              }}
              outcome={demoOutcome}
              onOutcomeChange={(next) => {
                setDemoOutcome(next);
                if (demoEmail.origin === "sample") setDemoEmail(sampleDemoEmails[next]);
                setDemoCheck(null);
              }}
              check={demoCheck}
              onPreviewUpdate={() => {
                setDemoCheck("update");
                setShowUpdateDialog(true);
              }}
              onPreviewEmpty={() => setDemoCheck("empty")}
              matter={matter}
            />
          ) : view === "connection" ? (
            <Connection
              clio={clio}
              refreshing={refreshing}
              onRefresh={refresh}
              onImported={async (data) => {
                await loadMatters(data.id);
                setRevision((v) => v + 1);
                navigate("overview");
                setNotice(
                  `Imported ${data.clientName}. Review the source-backed findings below.`,
                );
              }}
            />
          ) : loading ? (
            <Busy label="Reading matter records…" />
          ) : !matter ? (
            <div className="panel">
              <Empty title="Add a matter">
                Import a case export or connect Clio to view its records here.
              </Empty>
              <div className="center-action">
                <button
                  className="button primary"
                  onClick={() => navigate("connection")}
                >
                  <Upload size={16} />
                  Add a matter
                </button>
              </div>
            </div>
          ) : (
            <>
              {matter.sourceMode === "sample" && (
                <div className="sample-note">
                  <Sparkles size={14} />
                  <span>
                    Demo workspace · Findings below are based on the included
                    sample case records.
                  </span>
                </div>
              )}
              {view === "overview" && (
                <StatusUpdatesPreview
                  check={demoCheck}
                  email={demoEmail}
                  outcome={demoOutcome}
                  onOpenUpdate={() => setShowUpdateDialog(true)}
                  onOpenIntegrations={() => navigate("integrations")}
                />
              )}
              {view === "overview" && (
                <Overview
                  matter={matter}
                  onSource={setSource}
                  onNavigate={navigate}
                />
              )}
              {view === "waiting" && (
                <WaitingRoom matter={matter} onSource={setSource} />
              )}
              {view === "evidence" && (
                <Evidence
                  matter={matter}
                  onSource={setSource}
                  search={search}
                  setSearch={setSearch}
                />
              )}
              {view === "mychart" && (
                <MyChart
                  key={matter.id}
                  matter={matter}
                  session={chartSessions[matter.id] ?? emptyChartSession}
                  onChange={(update) => setChartSessions((current) => ({
                    ...current,
                    [matter.id]: update(current[matter.id] ?? emptyChartSession),
                  }))}
                  onSource={setSource}
                />
              )}
              {view === "sharing" && (
                <Sharing key={matter.id} matter={matter} onSource={setSource} />
              )}
              {view === "finances" && (
                <Finances
                  key={matter.id}
                  matter={matter}
                  onSource={setSource}
                  onImport={() => navigate("connection")}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Dashboard Ultra Pro Max</span>
            <span>
              <ShieldCheck size={12} /> Review findings against the source records.
            </span>
          </footer>
        </main>
      </div>
      {source && (
        <EvidenceDrawer source={source} onClose={() => setSource(null)} />
      )}
      {showUpdateDialog && demoCheck === "update" && (
        <UpdateDialog
          email={demoEmail}
          outcome={demoOutcome}
          matter={matter}
          onClose={() => setShowUpdateDialog(false)}
        />
      )}
      {showImportDialog && (
        <ImportMatterDialog
          onClose={() => setShowImportDialog(false)}
          onAdd={(next) => setDemoMatters((current) => [next, ...current])}
        />
      )}
    </div>
  );
}

function Overview({
  matter,
  onSource,
  onNavigate,
}: {
  matter: MatterSnapshot;
  onSource: (s: SourceRecord) => void;
  onNavigate: (v: View) => void;
}) {
  const blockers = [...matter.blockers].sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.priority] -
      { high: 0, medium: 1, low: 2 }[b.priority],
  );
  const waiting = matter.blockers.filter(
    (b) => b.status === "awaiting_response",
  ).length;
  const unknowns = matter.facts.filter((f) => f.certainty === "unknown");
  const recentEvents = [...matter.events]
    .filter((event) => event.date.slice(0, 10) <= matter.asOf.slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const metrics = [
    {
      label: "Bottlenecks",
      value: blockers.length,
      note: `${blockers.filter((b) => b.priority === "high").length} high priority`,
      icon: CircleAlert,
      tone: "coral",
      to: "waiting" as View,
    },
    {
      label: "Awaiting a response",
      value: waiting,
      note: waiting
        ? "Requests that need a follow-up"
        : "No pending responses recorded",
      icon: Clock3,
      tone: "amber",
      to: "waiting" as View,
    },
    {
      label: "Evidence sources",
      value: matter.sources.length,
      note: "Linked to original records",
      icon: FileCheck2,
      tone: "blue",
      to: "evidence" as View,
    },
    {
      label: "Open questions",
      value: unknowns.length,
      note: "Information still to establish",
      icon: HelpCircle,
      tone: "purple",
      to: "evidence" as View,
    },
  ];
  return (
    <>
      <div className="metric-grid">
        {metrics.map((m) => (
          <button
            key={m.label}
            className="metric-card"
            onClick={() => onNavigate(m.to)}
          >
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={`metric-icon ${m.tone}`}>
                <m.icon size={18} />
              </span>
            </div>
            <div className="metric-value">
              {m.value}
              <ArrowUpRight size={18} />
            </div>
            <span className="metric-note">{m.note}</span>
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <div className="overview-primary-stack">
          <section className="panel blocker-panel">
            <div className="panel-heading">
              <div>
                <h2>What's holding this case up?</h2>
                <p>Open requests, listed by priority.</p>
              </div>
              <Badge tone="neutral">{blockers.length} open</Badge>
            </div>
            {blockers.length ? (
              <div className="blocker-list">
                {blockers.slice(0, 3).map((blocker, i) => (
                  <article className="blocker-card" key={blocker.id}>
                    <div className="blocker-rank">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="blocker-content">
                      <div className="blocker-title-row">
                        <h3>{blocker.title}</h3>
                        <Badge
                          tone={
                            blocker.priority === "high"
                              ? "coral"
                              : blocker.priority === "medium"
                                ? "amber"
                                : "neutral"
                          }
                        >
                          {blocker.priority} priority
                        </Badge>
                      </div>
                      <p>{blocker.description}</p>
                      <div className="blocker-details">
                        <span className="status-dot" />
                        <span>{statusNames[blocker.status]}</span>
                        <span className="detail-divider">·</span>
                        <Users size={12} />
                        <span>{blocker.owner || "Owner not recorded"}</span>
                      </div>
                      <div className="next-action">
                        <ArrowRight size={14} />
                        <span>{blocker.nextAction}</span>
                      </div>
                      <Sources
                        ids={blocker.sourceIds}
                        sources={matter.sources}
                        onOpen={onSource}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="No blockers identified"
                icon={<CheckCircle2 size={26} />}
              >
                No open blockers were identified in the imported records. This
                does not confirm that the matter is complete.
              </Empty>
            )}
            <button
              className="panel-footer-link"
              onClick={() => onNavigate("waiting")}
            >
              Open Waiting Room
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent case activity</h2>
                <p>A timeline drawn from the source records.</p>
              </div>
              <Activity size={19} className="muted" />
            </div>
            <div className="timeline">
              {recentEvents.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <span className="timeline-marker">
                    <FileText size={14} />
                  </span>
                  <div>
                    <span className="timeline-date">
                      {date(event.date, true)}
                      <span>·</span>
                      {event.category.replaceAll("_", " ")}
                    </span>
                    <h3>{event.title}</h3>
                    <Sources
                      ids={event.sourceIds}
                      sources={matter.sources}
                      onOpen={onSource}
                      compact
                    />
                  </div>
                </div>
              ))}
              {!recentEvents.length && (
                <Empty title="No dated activity yet">
                  Dated events will appear here when they are available in the
                  case records.
                </Empty>
              )}
            </div>
          </section>
        </div>
        <div className="snapshot-stack">
          <section className="panel short-summary-panel">
            <div className="panel-heading">
              <h2>Case summary</h2>
            </div>
            <div className="short-summary-body">
              {shortSummary(matter.sources).map((line, index) => (
                <div key={index}>
                  <p>{line.text}</p>
                  <Sources
                    ids={line.sourceIds}
                    sources={matter.sources}
                    onOpen={onSource}
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="panel snapshot-panel">
            <div className="panel-heading">
              <div>
                <h2>Case details</h2>
                <p>Recorded facts and missing information.</p>
              </div>
              <FolderOpen size={19} className="muted" />
            </div>
            <div className="case-summary">
              <div className="case-stage">
                <span className="eyebrow">CURRENT STAGE</span>
                <Badge tone="blue">{matter.stage || "Not established"}</Badge>
              </div>
              <p>{matter.description}</p>
              <div className="case-summary-meta">
                <span>Incident date</span>
                <strong>{date(matter.incidentDate, true)}</strong>
              </div>
              <div className="case-summary-meta">
                <span>Responsible attorney</span>
                <strong>{matter.attorney || "Not recorded"}</strong>
              </div>
            </div>
            <div className="fact-groups">
              {(["coverage", "treatment", "financial"] as const).map(
                (category) => (
                  <div className="fact-group" key={category}>
                    <h3>
                      {category === "financial"
                        ? "Recorded financials"
                        : category}
                    </h3>
                    <CaseFacts
                      category={category}
                      matter={matter}
                      onSource={onSource}
                    />
                  </div>
                ),
              )}
            </div>
          </section>
          <section className="panel questions-panel">
            <div className="panel-heading">
              <div>
                <h2>Still to establish</h2>
                <p>Information still missing from the case records.</p>
              </div>
              <HelpCircle size={19} className="muted" />
            </div>
            <div className="unknown-list">
              {unknowns.length ? (
                unknowns.slice(0, 5).map((fact) => (
                  <div key={fact.id} className="unknown-item">
                    <span className="unknown-bullet">
                      <HelpCircle size={15} />
                    </span>
                    <div>
                      <h3>{fact.label}</h3>
                      <p>{fact.value}</p>
                      <Sources
                        ids={fact.sourceIds}
                        sources={matter.sources}
                        onOpen={onSource}
                        compact
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="subtle">
                  No unknown fields flagged by the current import. Review the
                  evidence for completeness.
                </p>
              )}
            </div>
            {matter.warnings.length > 0 && (
              <details className="data-notes">
                <summary>
                  <CircleAlert size={14} />
                  Data notes ({matter.warnings.length})<ChevronDown size={14} />
                </summary>
                <ul>
                  {matter.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function FactRow({
  fact,
  matter,
  onSource,
}: {
  fact: Fact;
  matter: MatterSnapshot;
  onSource: (s: SourceRecord) => void;
}) {
  return (
    <div className="fact-row">
      <div className="fact-label">
        <span>{fact.label}</span>
        {fact.certainty !== "recorded" && (
          <Badge tone={fact.certainty === "unknown" ? "neutral" : "amber"}>
            {certaintyNames[fact.certainty]}
          </Badge>
        )}
      </div>
      <div
        className={`fact-value ${fact.certainty === "unknown" ? "unknown-value" : ""}`}
      >
        {fact.value}
      </div>
      <Sources
        ids={fact.sourceIds}
        sources={matter.sources}
        onOpen={onSource}
        compact
      />
    </div>
  );
}

function CaseFacts({
  category,
  matter,
  onSource,
}: {
  category: Fact["category"];
  matter: MatterSnapshot;
  onSource: (source: SourceRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rank = (fact: Fact) => {
    const label = fact.label.toLowerCase();
    if (category === "coverage")
      return /limit/.test(label) ? 0 : /carrier|insurer/.test(label) ? 1 : 2;
    if (category === "financial")
      return /lien/.test(label)
        ? 0
        : /medical|specials/.test(label)
          ? 1
          : /expense|unbilled/.test(label)
            ? 2
            : /wage/.test(label)
              ? 3
              : 4;
    return 0;
  };
  const facts = matter.facts
    .filter((fact) => fact.category === category)
    .sort((a, b) => rank(a) - rank(b));
  return (
    <>
      {(expanded ? facts : facts.slice(0, 3)).map((fact) => (
        <FactRow
          key={fact.id}
          fact={fact}
          matter={matter}
          onSource={onSource}
        />
      ))}
      {!facts.length && (
        <span className="unknown-value">
          Not established in the available records
        </span>
      )}
      {facts.length > 3 && (
        <button className="facts-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all ${facts.length} fields`}
          <ChevronDown
            size={12}
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          />
        </button>
      )}
    </>
  );
}

function ShareSourcePreview({
  ids,
  sources,
}: {
  ids: string[];
  sources: SourceRecord[];
}) {
  const selectedSources = ids
    .map((id) => sources.find((source) => source.id === id))
    .filter((source): source is SourceRecord => !!source);
  return selectedSources.length ? (
    <details className="share-source-preview">
      <summary>
        <FileText size={12} />
        Included source text ({selectedSources.length})<ChevronDown size={12} />
      </summary>
      {selectedSources.map((source) => (
        <div key={source.id}>
          <h4>{source.title}</h4>
          {source.locator && <small>{source.locator}</small>}
          <pre>{source.text}</pre>
        </div>
      ))}
    </details>
  ) : (
    <span className="no-source">No supporting source excerpts available</span>
  );
}

function WaitingRoom({
  matter,
  onSource,
}: {
  matter: MatterSnapshot;
  onSource: (s: SourceRecord) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const blockers = [...matter.blockers]
    .filter(
      (b) =>
        (filter === "all" || b.status === filter) &&
        (owner === "all" || b.owner === owner) &&
        `${b.title} ${b.description} ${b.owner} ${b.nextAction}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
        { high: 0, medium: 1, low: 2 }[b.priority],
    );
  return (
    <section className="panel waiting-panel">
      <div className="panel-heading">
        <div>
          <h2>Outstanding requests & next actions</h2>
          <p>
            Statuses come from the imported records. Choose which requests to
            follow up on.
          </p>
        </div>
        <Badge tone="neutral">{matter.blockers.length} items</Badge>
      </div>
      <div className="filter-row">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search waiting room"
            placeholder="Find a request, owner, or next action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          aria-label="Filter requests by owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">All owners</option>
          {Array.from(new Set(matter.blockers.map((b) => b.owner))).map((o) => (
            <option value={o} key={o}>
              {o || "Not recorded"}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-tabs">
        <button
          onClick={() => setFilter("all")}
          className={filter === "all" ? "selected" : ""}
        >
          All items <span>{matter.blockers.length}</span>
        </button>
        {Object.entries(statusNames)
          .filter(([key]) => matter.blockers.some((b) => b.status === key))
          .map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={filter === key ? "selected" : ""}
            >
              {label}
              <span>
                {matter.blockers.filter((b) => b.status === key).length}
              </span>
            </button>
          ))}
      </div>
      <div className="waiting-table-wrap">
        <table className="waiting-table">
          <thead>
            <tr>
              <th>REQUEST / BLOCKER</th>
              <th>WAITING ON</th>
              <th>STATUS</th>
              <th>NEXT ACTION</th>
            </tr>
          </thead>
          <tbody>
            {blockers.map((blocker) => (
              <tr key={blocker.id}>
                <td>
                  <div className="request-title">
                    <span
                      className={`priority-indicator ${blocker.priority}`}
                    />
                    <h3>{blocker.title}</h3>
                  </div>
                  <p>{blocker.description}</p>
                  <Sources
                    ids={blocker.sourceIds}
                    sources={matter.sources}
                    onOpen={onSource}
                  />
                </td>
                <td>
                  <div className="owner-cell">
                    <span className="owner-avatar">
                      {initials(blocker.owner || "?")}
                    </span>
                    <strong>{blocker.owner || "Not recorded"}</strong>
                  </div>
                  <small>
                    Last activity {date(blocker.lastActivityAt, true)}
                  </small>
                </td>
                <td>
                  <Badge
                    tone={
                      blocker.status === "awaiting_response"
                        ? "amber"
                        : blocker.status === "unavailable" ||
                            blocker.status === "received_incomplete"
                          ? "coral"
                          : "neutral"
                    }
                  >
                    {statusNames[blocker.status]}
                  </Badge>
                  <small>Requested {date(blocker.requestedAt, true)}</small>
                  {blocker.dueAt && (
                    <small>Recorded due {date(blocker.dueAt, true)}</small>
                  )}
                </td>
                <td>
                  <div className="table-next-action">
                    <ArrowRight size={15} />
                    <span>{blocker.nextAction}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!blockers.length && (
        <Empty title="No requests match this view">
          Try a different status, owner, or search term.
        </Empty>
      )}
      <div className="table-note">
        <CircleAlert size={13} /> Priority is for review and coordination. Any
        displayed due date comes directly from a record.
      </div>
    </section>
  );
}

function Evidence({
  matter,
  onSource,
  search,
  setSearch,
}: {
  matter: MatterSnapshot;
  onSource: (s: SourceRecord) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const [type, setType] = useState("all");
  const sources = matter.sources.filter(
    (s) =>
      (type === "all" || s.type === type) &&
      `${s.title} ${s.text} ${s.locator || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel evidence-panel">
      <div className="panel-heading">
        <div>
          <h2>Source records</h2>
          <p>Open a source to inspect the text behind a finding.</p>
        </div>
        <Badge tone="neutral">{matter.sources.length} records</Badge>
      </div>
      <div className="filter-row">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search source records"
            placeholder="Search titles, record text, and references…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-button"
              aria-label="Clear evidence search"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <select
          className="filter-select"
          aria-label="Filter by source type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All record types</option>
          {Array.from(new Set(matter.sources.map((s) => s.type))).map((t) => (
            <option key={t} value={t}>
              {sourceNames[t] || t}
            </option>
          ))}
        </select>
      </div>
      <div className="evidence-grid">
        {sources.map((source) => (
          <button
            key={source.id}
            className="evidence-card"
            onClick={() => onSource(source)}
          >
            <div className="evidence-card-top">
              <span className="document-icon">
                <FileText size={20} />
              </span>
              <Badge tone="neutral">
                {sourceNames[source.type] || source.type}
              </Badge>
            </div>
            <h3>{source.title}</h3>
            <p>
              {source.text.slice(0, 190)}
              {source.text.length > 190 ? "…" : ""}
            </p>
            <div className="evidence-card-footer">
              <span>{date(source.date, true)}</span>
              <span>
                View record <ArrowUpRight size={14} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!sources.length && (
        <Empty title="No matching records">
          Try another search term or record type.
        </Empty>
      )}
      <div className="table-note">
        <FileCheck2 size={13} /> Showing {sources.length} of{" "}
        {matter.sources.length} source records from this matter.
      </div>
    </section>
  );
}

function EvidenceDrawer({
  source,
  onClose,
}: {
  source: SourceRecord;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const el = document.querySelector(".evidence-drawer");
        const items = el?.querySelectorAll<HTMLElement>("button, a[href]");
        if (items?.length) {
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);
  const safeUrl =
    source.url && /^https?:\/\//i.test(source.url) ? source.url : undefined;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <span>
            <FileText size={18} />
            Source evidence
          </span>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close evidence"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          <Badge tone="blue">{sourceNames[source.type] || source.type}</Badge>
          <h2 id="source-title">{source.title}</h2>
          <div className="source-meta">
            <div>
              <span>Record date</span>
              <strong>{date(source.date, true)}</strong>
            </div>
            <div>
              <span>Source reference</span>
              <strong>{source.locator || source.id}</strong>
            </div>
          </div>
          <div className="source-text-heading">
            <span>RECORDED SOURCE TEXT</span>
            <Badge tone="neutral">Verbatim</Badge>
          </div>
          <pre className="source-text">
            {source.text || "No text was included in this source record."}
          </pre>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noreferrer"
              className="button secondary full-width"
            >
              Open original record
              <ExternalLink size={15} />
            </a>
          )}
          <p className="source-footnote">
            <ShieldCheck size={14} />
            This is the imported record text. Review its context and
            completeness before relying on a finding.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Sharing({
  matter,
  onSource,
}: {
  matter: MatterSnapshot;
  onSource: (s: SourceRecord) => void;
}) {
  const [providerId, setProviderId] = useState(matter.providers[0]?.id || "");
  const [factIds, setFactIds] = useState<string[]>([]);
  const [blockerIds, setBlockerIds] = useState<string[]>([]);
  const [includeSources, setIncludeSources] = useState(false);
  const [shares, setShares] = useState<ProviderShare[]>([]);
  const [createdUrl, setCreatedUrl] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    api<{ shares: ProviderShare[] }>(
      `/api/matters/${encodeURIComponent(matter.id)}/shares`,
    )
      .then((r) => {
        if (current) setShares(r.shares);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [matter.id]);
  const provider = matter.providers.find((p) => p.id === providerId);
  const availableBlockers = matter.blockers.filter(
    (b) => b.providerId === providerId,
  );
  const count = factIds.length + blockerIds.length;
  function toggle(
    id: string,
    selected: string[],
    setSelected: (v: string[]) => void,
  ) {
    setSelected(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ share: ProviderShare; url: string }>(
        `/api/matters/${encodeURIComponent(matter.id)}/shares`,
        post({ providerId, factIds, blockerIds, includeSources }),
      );
      setShares((old) => [result.share, ...old]);
      setCreatedUrl(new URL(result.url, window.location.origin).href);
      setCreatedId(result.share.id);
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    try {
      await api(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
      setShares((old) =>
        old.map((s) =>
          s.id === id ? { ...s, revokedAt: new Date().toISOString() } : s,
        ),
      );
      if (id === createdId) setCreatedUrl("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {error && <ErrorBanner message={error} onClose={() => setError("")} />}
      <div className="sharing-layout">
        <section className="panel approval-panel">
          <div className="panel-heading">
            <div>
              <h2>Approve a provider view</h2>
              <p>Choose exactly what this provider can see.</p>
            </div>
            <ShieldCheck size={20} className="muted" />
          </div>
          {!matter.providers.length ? (
            <Empty title="No providers in this matter">
              Add provider records to the next matter import to create an
              approved view.
            </Empty>
          ) : (
            <>
              <div className="provider-select">
                <label className="field-label" htmlFor="provider">
                  SHARE WITH
                </label>
                <select
                  id="provider"
                  value={providerId}
                  onChange={(e) => {
                    setProviderId(e.target.value);
                    setFactIds([]);
                    setBlockerIds([]);
                    setCreatedUrl("");
                  }}
                >
                  {matter.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p>
                  <LockKeyhole size={13} /> Only checked items will appear in
                  the shared view.
                </p>
              </div>
              <div className="approval-section">
                <h3>
                  Case information <span>{factIds.length} selected</span>
                </h3>
                {matter.facts.map((fact) => (
                  <div
                    className={`approval-item ${factIds.includes(fact.id) ? "checked" : ""}`}
                    key={fact.id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={factIds.includes(fact.id)}
                        onChange={() => toggle(fact.id, factIds, setFactIds)}
                      />
                      <span>
                        <strong>
                          {fact.label}
                          <Badge
                            tone={
                              fact.certainty === "unknown"
                                ? "neutral"
                                : fact.certainty === "inferred"
                                  ? "amber"
                                  : "blue"
                            }
                          >
                            {certaintyNames[fact.certainty]}
                          </Badge>
                        </strong>
                        <span>{fact.value}</span>
                      </span>
                    </label>
                    <Sources
                      ids={fact.sourceIds}
                      sources={matter.sources}
                      onOpen={onSource}
                      compact
                    />
                  </div>
                ))}
              </div>
              <div className="approval-section">
                <h3>
                  Requests & next steps{" "}
                  <span>{blockerIds.length} selected</span>
                </h3>
                {availableBlockers.map((blocker) => (
                  <div
                    className={`approval-item ${blockerIds.includes(blocker.id) ? "checked" : ""}`}
                    key={blocker.id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={blockerIds.includes(blocker.id)}
                        onChange={() =>
                          toggle(blocker.id, blockerIds, setBlockerIds)
                        }
                      />
                      <span>
                        <strong>{blocker.title}</strong>
                        <span>{blocker.nextAction}</span>
                      </span>
                    </label>
                    <Sources
                      ids={blocker.sourceIds}
                      sources={matter.sources}
                      onOpen={onSource}
                      compact
                    />
                  </div>
                ))}
                {!availableBlockers.length && (
                  <p className="subtle">
                    No requests are associated with this provider.
                  </p>
                )}
              </div>
              <div className="source-approval">
                <label>
                  <input
                    type="checkbox"
                    checked={includeSources}
                    onChange={(e) => setIncludeSources(e.target.checked)}
                  />
                  <span>
                    <strong>Include supporting source excerpts</strong>
                    <small>
                      Shares the source text for the selected items. Review
                      those records before approving.
                    </small>
                  </span>
                </label>
              </div>
            </>
          )}
        </section>
        <div className="sharing-side">
          <section className="panel preview-panel">
            <div className="panel-heading">
              <div>
                <h2>Provider preview</h2>
                <p>Visible information after approval</p>
              </div>
              <Badge tone="blue">{count} items</Badge>
            </div>
            <div className="provider-preview">
              <span className="provider-preview-icon">
                <Users size={22} />
              </span>
              <span className="eyebrow">PREPARED FOR</span>
              <h3>{provider?.name || "Select a provider"}</h3>
              <p>
                {matter.clientName} · {matter.number}
              </p>
              <span className="shared-identity-note">
                The client name and matter number are included.
              </span>
              <div className="preview-items">
                {matter.facts
                  .filter((f) => factIds.includes(f.id))
                  .map((f) => (
                    <div key={f.id}>
                      <span>
                        {f.label} · {certaintyNames[f.certainty]}
                      </span>
                      <strong>{f.value}</strong>
                      {includeSources && (
                        <ShareSourcePreview
                          ids={f.sourceIds}
                          sources={matter.sources}
                        />
                      )}
                    </div>
                  ))}
                {matter.blockers
                  .filter((b) => blockerIds.includes(b.id))
                  .map((b) => (
                    <div key={b.id}>
                      <span>{b.title} · Suggested</span>
                      <strong>{`${b.description}\nSuggested next action: ${b.nextAction}`}</strong>
                      {includeSources && (
                        <ShareSourcePreview
                          ids={b.sourceIds}
                          sources={matter.sources}
                        />
                      )}
                    </div>
                  ))}
                {!count && (
                  <div className="preview-placeholder">
                    Select case information or requests to build this provider’s
                    view.
                  </div>
                )}
              </div>
              <p className="preview-disclosure">
                <ShieldCheck size={14} />
                {includeSources
                  ? "Source excerpts will be included."
                  : "Supporting source text is not included."}
              </p>
              <button
                className="button primary full-width"
                onClick={approve}
                disabled={!providerId || !count || busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Approve & create link
              </button>
              <p className="small-print">
                This creates a view-only link. Anyone with the link can access
                this approved snapshot until it expires or you revoke it.
              </p>
            </div>
          </section>
          {createdUrl && (
            <section className="created-link panel">
              <h3>
                <CheckCircle2 size={17} /> Approved view is ready
              </h3>
              <p>Copy this link now. It is only displayed when created.</p>
              <input
                aria-label="Provider view link"
                value={createdUrl}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <div className="link-actions">
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdUrl);
                      setCopied(true);
                    } catch {
                      setError(
                        "Clipboard unavailable. Select and copy the provider link above.",
                      );
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  className="button secondary"
                  href={createdUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open view
                  <ExternalLink size={14} />
                </a>
              </div>
            </section>
          )}
          <section className="panel shares-panel">
            <div className="panel-heading">
              <div>
                <h2>Approved views</h2>
                <p>Manage provider access.</p>
              </div>
            </div>
            {loading ? (
              <Busy label="Loading approved views…" />
            ) : !shares.length ? (
              <div className="small-empty">
                <Link2 size={21} />
                <p>No provider views approved yet.</p>
              </div>
            ) : (
              shares.map((share) => (
                <div className="share-item" key={share.id}>
                  <div>
                    <h3>{share.providerName}</h3>
                    <p>
                      {share.items.length} items · Created{" "}
                      {date(share.createdAt)}
                    </p>
                    <small>
                      {share.revokedAt
                        ? `Revoked ${date(share.revokedAt)}`
                        : new Date(share.expiresAt).getTime() < Date.now()
                          ? "Expired"
                          : `Expires ${date(share.expiresAt, true)} · ${share.openCount} opens`}
                    </small>
                  </div>
                  {share.revokedAt ? (
                    <Badge tone="neutral">Revoked</Badge>
                  ) : (
                    <button
                      className="text-button danger"
                      onClick={() => revoke(share.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Connection({
  clio,
  refreshing,
  onRefresh,
  onImported,
}: {
  clio: ClioStatus | null;
  refreshing: boolean;
  onRefresh: () => void;
  onImported: (m: MatterSnapshot) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("case-export.txt");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Please select a text or JSON file under 5 MB.");
      return;
    }
    if (!/\.(txt|json|md|csv)$/i.test(file.name)) {
      setError(
        "Use a .txt, .json, .md, or .csv export. Convert PDF or Word records to text before importing.",
      );
      return;
    }
    setText(await file.text());
    setFilename(file.name);
    setError("");
  }
  async function importMatter() {
    setBusy(true);
    setError("");
    try {
      const result = await api<MatterSnapshot>(
        "/api/import",
        post({ text, filename }),
      );
      await onImported(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connection-grid">
      <section className="panel connection-panel">
        <div className="panel-heading">
          <div>
            <h2>Clio Manage</h2>
            <p>Read-only access to your case records.</p>
          </div>
          <span className="clio-wordmark">clio</span>
        </div>
        <div className="connection-body">
          <div className="connection-status">
            <span
              className={`connection-status-icon ${clio?.connected ? "connected" : ""}`}
            >
              {clio?.connected ? (
                <CheckCircle2 size={23} />
              ) : (
                <Link2 size={23} />
              )}
            </span>
            <div>
              <h3>
                {clio?.connected
                  ? clio.lastSync
                    ? "Clio is connected"
                    : "Authorized · sync to verify"
                  : clio?.configured
                    ? "Ready to connect"
                    : "Connection setup needed"}
              </h3>
              <p>{clio?.message || "Connection status is unavailable."}</p>
            </div>
          </div>
          <div className="connection-info">
            <div>
              <span>Access</span>
              <strong>Read-only case records</strong>
            </div>
            <div>
              <span>Refresh</span>
              <strong>Manual, on request</strong>
            </div>
            <div>
              <span>Last synced</span>
              <strong>{date(clio?.lastSync, true)}</strong>
            </div>
            <div>
              <span>Region</span>
              <strong>{clio?.region?.toUpperCase() || "Not configured"}</strong>
            </div>
          </div>
          <p className="subtle">
            Imported records are cached locally. Refresh explicitly to bring in
            the latest available Clio records.
          </p>
          <div className="connection-actions">
            {clio?.configured && !clio.connected ? (
              <a className="button primary" href="/api/clio/connect">
                <Link2 size={16} />
                Connect Clio
              </a>
            ) : (
              <button
                className="button primary"
                disabled={!clio?.connected || refreshing}
                onClick={onRefresh}
              >
                <RefreshCw size={16} className={refreshing ? "spin" : ""} />
                {refreshing ? "Refreshing…" : "Refresh Clio data"}
              </button>
            )}
          </div>
          {!!clio?.missing.length && (
            <details className="connection-setup">
              <summary>
                Server setup details
                <ChevronDown size={15} />
              </summary>
              <p>
                Configure these server environment variables, then restart the
                local app:
              </p>
              <div className="missing-vars">
                {clio.missing.map((name) => (
                  <code key={name}>{name}</code>
                ))}
              </div>
              <p>
                Credentials stay on the server. The sample workspace remains
                available while the connection is being configured.
              </p>
            </details>
          )}
        </div>
      </section>
      <section className="panel import-panel">
        <div className="panel-heading">
          <div>
            <h2>Import a matter</h2>
            <p>Start with a case export or a structured JSON file.</p>
          </div>
          <Upload size={20} className="muted" />
        </div>
        <div className="import-body">
          {error && (
            <ErrorBanner message={error} onClose={() => setError("")} />
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.json,.md,.csv"
            className="visually-hidden"
            aria-label="Choose a case export file"
            onChange={(e) => {
              readFile(e.target.files?.[0]).catch((err) =>
                setError(err.message),
              );
            }}
          />
          <button
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files[0]).catch((err) =>
                setError(err.message),
              );
            }}
          >
            <span>
              <Upload size={23} />
            </span>
            <strong>{text ? filename : "Drop a case export here"}</strong>
            <small>
              {text
                ? "Choose another file, or edit the text below"
                : "or click to browse · TXT, JSON, MD, CSV · up to 5 MB"}
            </small>
          </button>
          <label className="field-label" htmlFor="import-text">
            OR PASTE CASE RECORDS
          </label>
          <textarea
            id="import-text"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a case export with matter details, dated notes, requests, treatment, coverage, or financial records…"
          />
          <div className="import-actions">
            <a
              href="/api/import-template"
              download="import-example.json"
              className="text-button"
            >
              <ArrowDownToLine size={15} />
              JSON template
            </a>
            <button
              className="button primary"
              disabled={!text.trim() || busy}
              onClick={importMatter}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              {busy ? "Importing…" : "Import matter"}
            </button>
          </div>
          <p className="small-print">
            Imported text is preserved as source evidence. Review extracted
            findings and unknowns before sharing. More structured inputs produce
            more complete results.
          </p>
        </div>
      </section>
      <div className="connection-bottom-note">
        <ShieldCheck size={18} />
        <div>
          <h3>Your records stay under your control</h3>
          <p>
            The app reads and caches records. Provider access is limited to the
            snapshot you explicitly approve.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderView({ token }: { token: string }) {
  const [share, setShare] = useState<ProviderShare | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    api<ProviderShare>(`/api/provider/${encodeURIComponent(token)}`)
      .then((data) => {
        if (current) setShare(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [token]);
  return (
    <div className="provider-page">
      <header className="provider-header">
        <Brand compact />
        <span>
          <ShieldCheck size={16} />
          Attorney-approved view
        </span>
      </header>
      <main className="provider-main">
        {loading ? (
          <Busy label="Opening your approved view…" />
        ) : error ? (
          <section className="panel">
            <Empty
              icon={<LockKeyhole size={28} />}
              title="This view is unavailable"
            >
              {error}
            </Empty>
          </section>
        ) : (
          share && (
            <>
              <div className="provider-intro">
                <span className="eyebrow">
                  PREPARED FOR {share.providerName.toUpperCase()}
                </span>
                <h1>{share.clientName}</h1>
                <p>{share.matterLabel}</p>
                <div className="provider-view-meta">
                  <Badge tone="blue">
                    <ShieldCheck size={12} />
                    Approved snapshot
                  </Badge>
                  <span>Approved {date(share.createdAt, true)}</span>
                  <span>Expires {date(share.expiresAt, true)}</span>
                </div>
              </div>
              <div className="provider-context">
                <ShieldCheck size={18} />
                <p>
                  This view contains only the information approved for{" "}
                  {share.providerName}. Contact the legal team to request
                  updates or additional context.
                </p>
              </div>
              <div className="provider-item-list">
                {share.items.map((item) => (
                  <article
                    className="panel provider-item"
                    key={`${item.kind}-${item.id}`}
                  >
                    <div className="provider-item-top">
                      <Badge tone={item.kind === "request" ? "amber" : "blue"}>
                        {item.kind === "request"
                          ? "Request / next step"
                          : "Case information"}
                      </Badge>
                      <span>
                        {certaintyNames[
                          item.certainty as keyof typeof certaintyNames
                        ] || item.certainty.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h2>{item.label}</h2>
                    <p>{item.value}</p>
                    {item.sources.length > 0 && (
                      <details className="provider-source">
                        <summary>
                          <FileText size={14} />
                          Approved source excerpts ({item.sources.length})
                          <ChevronDown size={14} />
                        </summary>
                        {item.sources.map((source, index) => (
                          <div key={index}>
                            <h3>{source.title}</h3>
                            {source.locator && <small>{source.locator}</small>}
                            <pre>{source.excerpt}</pre>
                          </div>
                        ))}
                      </details>
                    )}
                  </article>
                ))}
              </div>
              <p className="provider-end">
                <LockKeyhole size={14} />
                This is a view-only snapshot. Information may have changed since
                it was approved.
              </p>
            </>
          )
        )}
      </main>
    </div>
  );
}
