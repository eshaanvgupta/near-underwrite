import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDeterministicClaims,
  calculateModel,
  compareResearch,
  publicationDigests,
  type AIRoleResult,
  type ModelAssumptions,
  type ResearchBundle,
  type Snapshot,
} from "@near-underwrite/shared";
import { discoverModels, latestSnapshot, listSnapshots, runRole, savePublication, saveWorkspace, getWorkspace } from "./api.js";
import { assumptionsFor, cases, download, evidenceCsv, falsificationRows, makeBundle, reportHtml } from "./research.js";
import { forgetKey, hasRememberedKey, rememberKey, unlockKey } from "./vault.js";
import { setupTestnetWallet, viewRegistry, type WalletConnection } from "./wallet.js";

type Screen = "evidence" | "workbench" | "ai" | "history" | "report" | "publication" | "settings";
type Role = "bull" | "bear" | "synthesis";

const navigation: Array<{ id: Screen; label: string }> = [
  { id: "evidence", label: "Evidence board" },
  { id: "workbench", label: "Scenario workbench" },
  { id: "ai", label: "Bull / Bear room" },
  { id: "history", label: "Historical comparison" },
  { id: "report", label: "Report & export" },
  { id: "publication", label: "Publication registry" },
  { id: "settings", label: "AI settings" },
];

function formatNearAtomic(value: string) {
  const whole = value.padStart(25, "0").slice(0, -24).replace(/^0+(?=\d)/, "");
  const decimal = value.padStart(25, "0").slice(-24, -20);
  return `${whole}.${decimal}`;
}

function ageLabel(sourceTime: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(sourceTime)) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  return `${Math.floor(seconds / 3600)}h old`;
}

function Field({ label, value, onChange, suffix, nullable = false }: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  suffix?: string;
  nullable?: boolean;
}) {
  return <label className="field">
    <span>{label}</span>
    <span className="input-shell">
      <input
        inputMode="decimal"
        value={value ?? ""}
        placeholder={nullable ? "Unavailable" : "0"}
        onChange={(event) => onChange(nullable && event.target.value === "" ? null : event.target.value)}
      />
      {suffix && <small>{suffix}</small>}
    </span>
  </label>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("evidence");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotOrigin, setSnapshotOrigin] = useState<"api" | "bundled">("api");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [caseName, setCaseName] = useState<keyof typeof cases>("base");
  const [assumptions, setAssumptions] = useState<ModelAssumptions | null>(null);
  const [claimOpen, setClaimOpen] = useState("claim.monetary-balance");
  const [inspectedMetricId, setInspectedMetricId] = useState("");
  const [notes, setNotes] = useState("");
  const [workspaceId] = useState(() => {
    const existing = localStorage.getItem("near-underwrite.workspace-id");
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem("near-underwrite.workspace-id", created);
    return created;
  });
  const [workspaceStatus, setWorkspaceStatus] = useState("Not saved");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [comparisonSnapshot, setComparisonSnapshot] = useState<Snapshot | null>(null);
  const [savedScenario, setSavedScenario] = useState<{ snapshot: Snapshot; assumptions: ModelAssumptions } | null>(null);
  const [aiResults, setAiResults] = useState<AIRoleResult[]>([]);
  const analysisRef = useRef<{ id: string; bundle: Record<string, unknown> } | null>(null);
  const [provider, setProvider] = useState<"near-ai" | "openai-compatible" | "local">("near-ai");
  const [endpoint, setEndpoint] = useState("https://cloud-api.near.ai/v1");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("");
  const [modelsStatus, setModelsStatus] = useState("Not tested");
  const [maxOutput, setMaxOutput] = useState(1200);
  const [maxCalls, setMaxCalls] = useState(3);
  const [dailyBudget, setDailyBudget] = useState(3);
  const [confirmThreshold, setConfirmThreshold] = useState(1);
  const [roleState, setRoleState] = useState<Record<Role, string>>({ bull: "Not run", bear: "Not run", synthesis: "Not run" });
  const abortRef = useRef<AbortController | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [vaultStatus, setVaultStatus] = useState(hasRememberedKey() ? "Encrypted key saved; locked" : "No key saved");
  const [prepared, setPrepared] = useState<ResearchBundle | null>(null);
  const [digests, setDigests] = useState<{ report_digest: string; evidence_digest: string; model_digest: string } | null>(null);
  const [parentId, setParentId] = useState("");
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [accountId, setAccountId] = useState("");
  const [publicationStatus, setPublicationStatus] = useState("No transaction requested");
  const [registryRecord, setRegistryRecord] = useState<Record<string, unknown> | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("Upload a bundle and enter a publication ID");
  const [verifyFile, setVerifyFile] = useState<ResearchBundle | null>(null);
  const [recordedPublications, setRecordedPublications] = useState<Array<{ publication_id: string; parent_id: string | null }>>([]);
  const [contractId, setContractId] = useState(import.meta.env.VITE_REGISTRY_CONTRACT_ID ?? "");
  useEffect(() => {
    void fetch("./evidence/deployment.json").then(response => response.ok ? response.json() : null).then((deployment: { network?: string; contract_id?: string; publications?: Array<{ publication_id: string; parent_id: string | null }> } | null) => {
      if (deployment?.network === "testnet" && deployment.contract_id?.endsWith(".testnet")) setContractId(deployment.contract_id);
      setRecordedPublications(deployment?.publications ?? []);
    }).catch(() => {});
  }, [contractId]);

  useEffect(() => {
    if (!contractId || !accountId || !prepared) return;
    const query = new URLSearchParams(window.location.search);
    if (query.has("errorCode")) { setPublicationStatus("Wallet rejected the transaction: " + (query.get("errorMessage") ?? query.get("errorCode"))); return; }
    if (!query.has("transactionHashes")) return;
    setScreen("publication"); setPublicationStatus("Checking wallet callback against final testnet state…");
    void viewRegistry(contractId, "get_author_count", { author: accountId }).then(async count => {
      const history = await viewRegistry(contractId, "get_author_history", { author: accountId, from_index: Math.max(0, Number(count) - 20), limit: 20 }) as Array<Record<string, unknown>>;
      const record = history.find(item => item.report_digest === digests?.report_digest);
      if (record) { setRegistryRecord(record); setPublicationStatus("Confirmed in final testnet registry state"); }
      else setPublicationStatus("Transaction pending or absent from final state; reload to check again");
    }).catch(() => setPublicationStatus("Finality check unavailable; saved report and wallet callback remain available for retry"));
  }, [contractId, accountId, prepared, digests]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await latestSnapshot();
      setSnapshot(loaded.snapshot);
      setSnapshotOrigin(loaded.origin);
      setAssumptions((current) => current ? { ...current, starting_supply_yocto: loaded.snapshot.finalized_block.total_supply_yocto } : assumptionsFor(loaded.snapshot, "base"));
      try {
        const list = await listSnapshots();
        setSnapshots(list.snapshots);
      } catch {
        setSnapshots([loaded.snapshot]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    void getWorkspace(workspaceId).then(workspace => {
      setAssumptions(workspace.assumptions); setNotes(workspace.notes); setWorkspaceStatus("Restored saved workspace");
    }).catch(() => { /* A visitor has no saved workspace yet. */ });
    const stored = localStorage.getItem("near-underwrite.publication-draft");
    if (stored) {
      try { const draft = JSON.parse(stored) as { prepared: ResearchBundle; digests: NonNullable<typeof digests> }; setPrepared(draft.prepared); setDigests(draft.digests); setParentId(draft.prepared.parent_publication_id ?? ""); } catch { /* Ignore an invalid local draft. */ }
    }
  }, [workspaceId]);

  useEffect(() => {
    const stored = localStorage.getItem("near-underwrite.scenario-a");
    if (stored) {
      try { setSavedScenario(JSON.parse(stored) as { snapshot: Snapshot; assumptions: ModelAssumptions }); } catch { localStorage.removeItem("near-underwrite.scenario-a"); }
    }
  }, []);

  useEffect(() => {
    if (!contractId) return;
    let active = true;
    void setupTestnetWallet(contractId).then((connection) => {
      if (!active) return;
      setWallet(connection);
      const accounts = connection.selector.store.getState().accounts;
      setAccountId(accounts[0]?.accountId ?? "");
      connection.selector.store.observable.subscribe((state) => setAccountId(state.accounts[0]?.accountId ?? ""));
    }).catch((cause) => setPublicationStatus(`Wallet setup unavailable: ${cause instanceof Error ? cause.message : String(cause)}`));
    return () => { active = false; };
  }, [contractId]);

  useEffect(() => {
    if (!apiKey) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setApiKey("");
        setVaultStatus((current) => current.includes("saved") ? "Encrypted key saved; locked after inactivity" : "Key cleared after inactivity");
      }, 15 * 60_000);
    };
    ["pointerdown", "keydown"].forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      ["pointerdown", "keydown"].forEach((name) => window.removeEventListener(name, reset));
    };
  }, [apiKey]);

  const modelResult = useMemo(() => {
    if (!snapshot || !assumptions) return { value: null, error: "" };
    try { return { value: calculateModel(snapshot, assumptions), error: "" }; } catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [snapshot, assumptions]);

  const claims = useMemo(() => snapshot && assumptions && modelResult.value
    ? buildDeterministicClaims(snapshot, assumptions, modelResult.value)
    : [], [snapshot, assumptions, modelResult.value]);

  const setAssumption = (key: keyof ModelAssumptions, value: string | null) => {
    analysisRef.current = null; setAiResults([]);
    setAssumptions((current) => current ? { ...current, [key]: value } : current);
    setPrepared(null);
    setDigests(null);
  };

  const selectCase = (name: keyof typeof cases) => {
    if (!snapshot) return;
    analysisRef.current = null; setAiResults([]);
    setCaseName(name);
    setAssumptions(assumptionsFor(snapshot, name));
    setPrepared(null);
    setDigests(null);
  };

  const persistWorkspace = async () => {
    if (!snapshot || !assumptions) return;
    setWorkspaceStatus("Saving…");
    try {
      await saveWorkspace({
        id: workspaceId,
        name: "NEAR token-demand underwriting",
        snapshot_ids: [snapshot.id, comparisonSnapshot?.id].filter(Boolean),
        assumptions,
        notes,
        updated_at: new Date().toISOString(),
      });
      setWorkspaceStatus(`Saved ${new Date().toLocaleTimeString()}`);
    } catch (cause) {
      setWorkspaceStatus(`Save unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const runAnalysis = async (role: Role) => {
    if (!snapshot || !assumptions || !modelResult.value || !apiKey || !model) return;
    if (aiResults.length >= Math.min(maxCalls, dailyBudget)) {
      setRoleState((current) => ({ ...current, [role]: "Local call budget reached" }));
      return;
    }
    if (aiResults.length + 1 >= confirmThreshold && !window.confirm(`Send one bounded ${role} request to ${provider} using your transient key? The provider may charge for a request even if you later cancel.`)) return;
    if (!analysisRef.current) analysisRef.current = { id: crypto.randomUUID(), bundle: structuredClone({ snapshot: { ...snapshot, raw_responses: [] }, assumptions, result: modelResult.value, claims }) };
    const evidenceBundle = analysisRef.current.bundle;
    const controller = new AbortController();
    abortRef.current = controller;
    setRoleState((current) => ({ ...current, [role]: "Request in progress…" }));
    try {
      const result = await runRole({
        provider,
        endpoint,
        api_key: apiKey,
        model,
        role,
        evidence_bundle: evidenceBundle,
        max_output_tokens: maxOutput,
        workspace_id: workspaceId,
        confirmation_id: crypto.randomUUID(),
        analysis_id: analysisRef.current.id,
        daily_call_budget: dailyBudget,
        max_calls_per_analysis: maxCalls,
      }, controller.signal);
      setAiResults((current) => [...current.filter((item) => item.role !== role), result]);
      setRoleState((current) => ({ ...current, [role]: `Complete · ${result.reported_usage.total_tokens ?? "usage unreported"} tokens` }));
      setPrepared(null);
    } catch (cause) {
      setRoleState((current) => ({ ...current, [role]: cause instanceof DOMException && cause.name === "AbortError"
        ? "Cancelled locally; provider charges may still apply"
        : `Failed: ${cause instanceof Error ? cause.message : String(cause)}` }));
    } finally {
      abortRef.current = null;
    }
  };

  const prepareReport = async () => {
    if (!snapshot || !assumptions || !modelResult.value) return;
    const bundle = makeBundle(snapshot, assumptions, aiResults, notes, parentId || null);
    const evidenceManifest = {
      snapshot_id: snapshot.id,
      source_digests: snapshot.source_digests,
      observations: snapshot.observations.map((item) => ({ metric_id: item.metric_id, raw_response_digest: item.raw_response_digest })),
    };
    const descriptor = { formula_version: bundle.formula_version, assumptions };
    setPrepared(bundle);
    const computed = await publicationDigests(bundle, evidenceManifest, descriptor);
    setDigests(computed);
    localStorage.setItem("near-underwrite.publication-draft", JSON.stringify({ prepared: bundle, digests: computed }));
  };

  const publish = async () => {
    if (!wallet || !accountId || !prepared || !digests || !contractId) return;
    setPublicationStatus("Waiting for wallet approval…");
    try {
      const signer = await wallet.selector.wallet();
      const outcome = await (signer as unknown as {
        signAndSendTransaction(input: unknown): Promise<unknown>;
      }).signAndSendTransaction({
        receiverId: contractId,
        actions: [{
          type: "FunctionCall",
          params: {
            methodName: "publish",
            args: { ...digests, schema_version: prepared.schema_version, parent_id: parentId || null },
            gas: "60000000000000",
            deposit: "100000000000000000000000",
          },
        }],
      });
      const transactionHash = (outcome as { transaction_outcome?: { id?: string } } | undefined)?.transaction_outcome?.id;
      setPublicationStatus(transactionHash ? `Submitted ${transactionHash}; checking final state…` : "Wallet redirected or returned no final outcome; checking chain state after finality");
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const history = await viewRegistry(contractId, "get_author_history", { author: accountId, from_index: 0, limit: 100 }) as Array<Record<string, unknown>>;
      const record = [...history].reverse().find((item) => item.report_digest === digests.report_digest);
      if (!record) {
        setPublicationStatus("Transaction pending or not found in final registry state; refresh before retrying");
        return;
      }
      setRegistryRecord(record);
      setPublicationStatus("Confirmed in final testnet registry state");
      if (transactionHash) {
        await savePublication({
          ...record,
          transaction_hash: transactionHash,
        });
      }
    } catch (cause) {
      setPublicationStatus(`Rejected or failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const verifyUploaded = async (publicationId: string) => {
    if (!verifyFile || !contractId || !publicationId) return;
    setVerifyStatus("Recomputing bundle and reading final testnet state…");
    try {
      const evidenceManifest = {
        snapshot_id: verifyFile.snapshot.id,
        source_digests: verifyFile.snapshot.source_digests,
        observations: verifyFile.snapshot.observations.map((item) => ({ metric_id: item.metric_id, raw_response_digest: item.raw_response_digest })),
      };
      const computed = await publicationDigests(verifyFile, evidenceManifest, { formula_version: verifyFile.formula_version, assumptions: verifyFile.assumptions });
      const record = await viewRegistry(contractId, "get_publication", { publication_id: publicationId }) as Record<string, unknown> | null;
      if (!record) setVerifyStatus("Mismatching: publication ID is absent from final contract state");
      else if (record.report_digest === computed.report_digest && record.evidence_digest === computed.evidence_digest && record.model_digest === computed.model_digest) setVerifyStatus("Matching: downloaded bundle reproduces all three on-chain digests");
      else setVerifyStatus("Mismatching: one or more recomputed digests differ from the registry");
    } catch (cause) {
      setVerifyStatus(`Unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  if (loading) return <main className="loading-state"><div className="mark">NU</div><h1>Loading public evidence</h1><p>The app is requesting the cached finalized mainnet snapshot. No wallet or AI key is required.</p></main>;
  if (!snapshot || !assumptions) return <main className="loading-state"><h1>Evidence unavailable</h1><p>{error}</p><button onClick={() => void refresh()}>Retry public sources</button></main>;

  return <div className="app-shell">
    <header className="masthead">
      <a className="brand" href="#" onClick={() => setScreen("evidence")}><span className="mark">NU</span><span><b>NEAR UNDERWRITE</b><small>Token-demand research control room</small></span></a>
      <div className="header-state">
        <StatusPill tone={snapshot.completeness.status === "complete" ? "good" : "warn"}>{snapshot.completeness.status}</StatusPill>
        <span>Mainnet evidence · block {snapshot.finalized_block.height}</span>
        <button className="text-button" onClick={() => void refresh()}>Refresh</button>
      </div>
    </header>
    <aside className="sidebar" aria-label="Research screens">
      <p className="eyebrow">Research workflow</p>
      <nav>{navigation.map((item) => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)}>{item.label}</button>)}</nav>
      <div className="sidebar-note">
        <b>{modelResult.value?.conclusion ?? "invalid"}</b>
        <span>under current assumptions</span>
        <small>This can turn bearish, neutral, or bullish. It is not investment advice.</small>
      </div>
    </aside>
    <main id="main" className="workspace">
      <section className="context-strip" aria-label="Evidence context">
        <div><span>Finality</span><b>Final RPC block</b></div>
        <div><span>Source time</span><b>{ageLabel(snapshot.finalized_block.timestamp_iso)}</b></div>
        <div><span>Delivery</span><b>{snapshotOrigin === "api" ? "Hosted API cache" : "Bundled verified snapshot"}</b></div>
        <div><span>Data quality</span><b>{snapshot.completeness.problems.length} flagged issue{snapshot.completeness.problems.length === 1 ? "" : "s"}</b></div>
      </section>

      {screen === "evidence" && <section aria-labelledby="evidence-title">
        <div className="page-heading"><div><p className="eyebrow">Live evidence board</p><h1 id="evidence-title">Usage is visible. Value capture still has to be proved.</h1><p>Every claim below opens into its measurements, assumptions, formula, uncertainty, counterargument, and falsification condition.</p></div><button onClick={() => setScreen("workbench")}>Stress the assumptions →</button></div>
        <div className="metric-grid">
          <article><span>Finalized supply</span><strong>{formatNearAtomic(snapshot.finalized_block.total_supply_yocto)}</strong><small>NEAR · measured at block {snapshot.finalized_block.height}</small></article>
          <article><span>Current validator accounts</span><strong>{snapshot.epoch.validator_accounts.length}</strong><small>accounts, not verified beneficial operators</small></article>
          <article><span>Sampled outcomes</span><strong>{snapshot.activity.outcomes_processed}</strong><small>{snapshot.activity.from_height}–{snapshot.activity.to_height} · bounded, deduplicated</small></article>
          <article><span>Historical range</span><strong>{snapshot.history.length}</strong><small>genuine daily observations · powered by NearBlocks APIs</small></article>
        </div>
        <div className="claim-stack">
          {claims.map((claim) => <article className="claim-card" key={claim.id}>
            <button className="claim-summary" onClick={() => setClaimOpen(claimOpen === claim.id ? "" : claim.id)} aria-expanded={claimOpen === claim.id}>
              <span><StatusPill tone={claim.conclusion === "bullish" ? "good" : claim.conclusion === "bearish" ? "bad" : "neutral"}>{claim.conclusion}</StatusPill><b>{claim.title}</b></span><span>{claimOpen === claim.id ? "−" : "+"}</span>
            </button>
            {claimOpen === claim.id && <div className="claim-detail">
              <p className="claim-statement">{claim.statement}</p>
              <dl>
                <div><dt>Evidence</dt><dd>{claim.metric_ids.map((id) => <button className="metric-link" key={id} onClick={() => setInspectedMetricId(id)}>{id}</button>)}</dd></div>
                <div><dt>Assumptions</dt><dd>{claim.assumption_ids.map((id) => <button className="metric-link" key={id} onClick={() => setScreen("workbench")}>{id}</button>)}</dd></div>
                <div><dt>Formula</dt><dd>{claim.formula}</dd></div>
                <div><dt>Uncertainty</dt><dd>{claim.uncertainty}</dd></div>
                <div><dt>Counterargument</dt><dd>{claim.counterargument}</dd></div>
                <div><dt>Would falsify</dt><dd>{claim.falsification_condition}</dd></div>
              </dl>
            </div>}
          </article>)}
        </div>
        {inspectedMetricId && <section className="measurement-detail" aria-label="Measurement detail">
          <div className="button-row"><h2>{inspectedMetricId}</h2><button onClick={() => setInspectedMetricId("")}>Close measurement</button></div>
          {(() => {
            const metric = snapshot.observations.find(item => item.metric_id === inspectedMetricId);
            if (metric) return <><StatusPill tone={metric.status === "unavailable" ? "warn" : "good"}>{metric.status}</StatusPill><p>Unit: {metric.unit} · Retrieved: {metric.retrieved_at} · Source time: {metric.source_time ?? "unavailable"}</p><p><code>{metric.source.method} {metric.source.url}</code></p><pre>{JSON.stringify({ value: metric.value, request: metric.source.parameters, block_height: metric.block_height, block_hash: metric.block_hash, epoch_id: metric.epoch_id, transformation_version: metric.transformation_version, digest: metric.raw_response_digest, quality_flags: metric.quality_flags }, null, 2)}</pre></>;
            const historyField = inspectedMetricId === "nearblocks.daily.total_supply" ? "total_supply_yocto" : inspectedMetricId === "nearblocks.daily.transaction_volume_near" ? "transaction_volume_near" : null;
            if (historyField) return <><StatusPill>derived view of archived history</StatusPill><p>This older cached snapshot stores daily metrics inside its history observation. Values below are selected directly from those recorded dates.</p><pre>{JSON.stringify(snapshot.history.map(day => ({ date: day.date, value: day[historyField], source_digest: day.source_digest })), null, 2)}</pre></>;
            return <p>This metric is unavailable in this snapshot. Export the bundle to inspect the available source records.</p>;
          })()}
        </section>}
        <article className="quality-panel">
          <div><p className="eyebrow">Lineage & quality</p><h2>No missing value is replaced with zero.</h2></div>
          <ul>{snapshot.completeness.problems.length ? snapshot.completeness.problems.map((problem) => <li key={problem.code}><StatusPill tone={problem.severity === "error" ? "bad" : "warn"}>{problem.severity}</StatusPill><span><b>{problem.code}</b> — {problem.detail}</span></li>) : <li><StatusPill tone="good">complete</StatusPill><span>All configured adapters returned a usable result for this snapshot.</span></li>}</ul>
          <details><summary>Inspect source identities and raw-response digests</summary><div className="digest-list">{snapshot.observations.map((item) => <div key={item.metric_id}><b>{item.metric_id}</b><code>{item.source.method} {item.source.url}</code><code>{item.raw_response_digest}</code></div>)}</div></details>
        </article>
      </section>}

      {screen === "workbench" && <section aria-labelledby="workbench-title">
        <div className="page-heading"><div><p className="eyebrow">Scenario workbench</p><h1 id="workbench-title">Change one bridge. See what survives.</h1><p>The engine uses decimal arithmetic and integer atomic supply. These are explicit scenarios, not forecasts.</p></div><button onClick={() => void persistWorkspace()}>Save workspace</button></div>
        <div className="case-tabs">{(["bear", "base", "bull"] as const).map((name) => <button key={name} className={caseName === name ? "active" : ""} onClick={() => selectCase(name)}>{name} case</button>)}</div>
        <div className="workbench-grid">
          <form className="assumption-panel" onSubmit={(event) => event.preventDefault()}>
            <h2>Explicit assumptions</h2>
            <Field label="Annual gross issuance" value={assumptions.annual_gross_issuance_near} onChange={(value) => setAssumption("annual_gross_issuance_near", value)} suffix="NEAR / year" />
            <Field label="Annual actual protocol burn" value={assumptions.annual_actual_protocol_burn_near} onChange={(value) => setAssumption("annual_actual_protocol_burn_near", value)} suffix="NEAR / year" />
            <Field label="Relevant settlement activity" value={assumptions.daily_relevant_settlement_usd} onChange={(value) => setAssumption("daily_relevant_settlement_usd", value)} suffix="USD / day" />
            <Field label="NEAR-held fraction" value={assumptions.near_held_fraction} onChange={(value) => setAssumption("near_held_fraction", value)} suffix="0–1" />
            <Field label="Inventory holding duration" value={assumptions.holding_duration_days} onChange={(value) => setAssumption("holding_duration_days", value)} suffix="days" />
            <Field label="Scenario NEAR price" value={assumptions.near_price_usd} onChange={(value) => setAssumption("near_price_usd", value)} suffix="USD" nullable />
            <Field label="Stake concentration threshold" value={assumptions.stake_threshold_fraction} onChange={(value) => setAssumption("stake_threshold_fraction", value)} suffix="0–1" />
            <p className="form-status">{workspaceStatus}</p>
          </form>
          <div className="result-panel">
            <p className="eyebrow">Deterministic result</p>
            {modelResult.error && <div className="error-box">{modelResult.error}</div>}
            {modelResult.value && <>
              <div className="conclusion"><span>Conclusion</span><strong>{modelResult.value.conclusion}</strong></div>
              <dl className="result-list">
                <div><dt>Annual net monetary change</dt><dd>{modelResult.value.annual_net_monetary_change_near} NEAR</dd></div>
                <div><dt>Projected year-end supply</dt><dd>{modelResult.value.projected_year_end_supply_near} NEAR</dd></div>
                <div><dt>Burn break-even</dt><dd>{modelResult.value.burn_break_even_near} NEAR / year</dd></div>
                <div><dt>Working-capital inventory</dt><dd>{modelResult.value.working_capital_near === null ? "Unavailable — add price" : `${modelResult.value.working_capital_near} NEAR`}</dd></div>
                <div><dt>Accounts reaching stake threshold</dt><dd>{modelResult.value.stake_concentration.minimum_accounts_for_threshold ?? "Unavailable"}</dd></div>
                <div><dt>Observed net supply change</dt><dd>{modelResult.value.observed_supply_change_near ?? "Unavailable"} {modelResult.value.observed_supply_change_near !== null && "NEAR"}</dd></div>
              </dl>
              <div className="causal-chain"><span>Activity</span><i>× capture</i><span>Inventory</span><i>× duration</i><span>Demand</span><em>Short duration, subsidies, alternate assets, negligible capture, or dilution can break this chain.</em></div>
              <details open><summary>Model limits</summary><ul>{modelResult.value.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul></details>
            </>}
          </div>
        </div>
        <section className="sensitivity"><h2>Sensitivity: held fraction × duration</h2><div className="heatmap">{["0.001", "0.01", "0.04"].flatMap((fraction) => ["0.25", "2", "5"].map((duration) => {
          let inventory: string | null = null;
          try { inventory = calculateModel(snapshot, { ...assumptions, near_held_fraction: fraction, holding_duration_days: duration }).working_capital_near; } catch { /* Invalid inputs remain unavailable. */ }
          return <div key={fraction + duration} style={{ "--heat": Math.min(1, Number(fraction) * Number(duration) * 5) } as React.CSSProperties}><b>{inventory === null ? "Unavailable" : inventory + " NEAR"}</b><small>{fraction} held · {duration}d</small></div>;
        }))}</div></section>
      </section>}

      {screen === "ai" && <section aria-labelledby="ai-title">
        <div className="page-heading"><div><p className="eyebrow">Adversarial AI room</p><h1 id="ai-title">Same evidence. Three bounded requests.</h1><p>AI explains and challenges; the deterministic engine owns arithmetic. No key means no generated analysis.</p></div><button onClick={() => setScreen("settings")}>{apiKey ? "AI configured" : "Configure your key"}</button></div>
        <button onClick={() => { analysisRef.current = null; setAiResults([]); setRoleState({ bull: "Not run", bear: "Not run", synthesis: "Not run" }); }}>Start new analysis with current evidence</button>
        {aiResults.length > 1 && <div className="setup-message"><b>Disagreements</b>{aiResults.flatMap(result => result.disagreements.map((item, index) => <span key={result.role + index}>{result.role}: {item}</span>))}</div>}
        {!apiKey && <div className="setup-message"><b>No AI credential is in browser memory.</b><span>Public research, scenarios, comparisons, and exports remain fully available. Add your own provider key in Settings to enable these requests.</span></div>}
        <div className="role-grid">{(["bull", "bear", "synthesis"] as const).map((role) => {
          const result = aiResults.find((item) => item.role === role);
          return <article key={role}>
            <p className="eyebrow">{role} analyst</p>
            <h2>{role === "bull" ? "What could strengthen?" : role === "bear" ? "What breaks first?" : "What survives both?"}</h2>
            <p className="role-status">{roleState[role]}</p>
            <button disabled={!apiKey || !model || roleState[role].includes("progress")} onClick={() => void runAnalysis(role)}>Run one visible request</button>
            {result && <div className="ai-output">{result.claims.map((claim) => <details key={claim.id} open><summary>{claim.text}</summary><p><b>References:</b> {claim.evidence_ids.join(", ")}</p><p><b>Counterargument:</b> {claim.counterargument}</p><p><b>Confidence explanation:</b> {claim.confidence_explanation}</p>{claim.numerical_claims.map((number) => <p key={number.text} className="number-check">Numeric claim: {number.text}<br /><small>{number.evidence_ids.join(", ")}</small></p>)}</details>)}<small>Provider-reported usage: {result.reported_usage.total_tokens ?? "unreported"} · Estimated upper input bound: {result.estimated_usage.input_tokens_upper_bound}</small></div>}
          </article>;
        })}</div>
        {abortRef.current && <button className="danger-button" onClick={() => abortRef.current?.abort()}>Cancel browser wait — charges may already exist</button>}
        <p className="fine-print">No hidden fallback, retry, or background analysis. A retry is a new potential spend. App limits do not control use of the same key in other products.</p>
      </section>}

      {screen === "history" && <section aria-labelledby="history-title">
        <div className="page-heading"><div><p className="eyebrow">Historical comparison</p><h1 id="history-title">Separate new observations from changed assumptions.</h1><p>The source returned {snapshot.history.length} genuine daily observations. Dates come from the source's daily boundaries; no block interval is assumed.</p></div><button onClick={() => {
          const scenario = { snapshot, assumptions };
          localStorage.setItem("near-underwrite.scenario-a", JSON.stringify(scenario));
          setSavedScenario(scenario);
        }}>Save current as Scenario A</button></div>
        <div className="compare-controls">
          <label>Compare cached snapshot<select value={comparisonSnapshot?.id ?? ""} onChange={(event) => setComparisonSnapshot(snapshots.find((item) => item.id === event.target.value) ?? null)}><option value="">Choose snapshot</option>{snapshots.map((item) => <option key={item.id} value={item.id}>{item.created_at} · block {item.finalized_block.height}</option>)}</select></label>
          <span>{savedScenario ? `Scenario A saved at block ${savedScenario.snapshot.finalized_block.height}` : "No local Scenario A saved"}</span>
        </div>
        {savedScenario && <div className="change-grid">{(() => {
          const comparison = compareResearch(savedScenario, { snapshot: comparisonSnapshot ?? snapshot, assumptions });
          return <>
            <article><h2>New observations</h2>{comparison.observation_changes.length ? comparison.observation_changes.map((item) => <p key={item.metric}><code>{item.metric}</code><span>{item.before} → {item.after}</span></p>) : <p>No measured field changed in this comparison.</p>}</article>
            <article><h2>Changed assumptions</h2>{comparison.assumption_changes.length ? comparison.assumption_changes.map((item) => <p key={item.assumption}><code>{item.assumption}</code><span>{item.before} → {item.after}</span></p>) : <p>No assumption changed in this comparison.</p>}</article>
          </>;
        })()}</div>}
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Total supply (yoctoNEAR)</th><th>Transactions</th><th>Receipts</th><th>Txn fee (NEAR)</th><th>Price (USD, reference)</th></tr></thead><tbody>{snapshot.history.map((day) => <tr key={day.date}><td>{day.date}</td><td><code>{day.total_supply_yocto ?? "unavailable"}</code></td><td>{day.transactions ?? "unavailable"}</td><td>{day.receipts ?? "unavailable"}</td><td>{day.transaction_fees_near ?? "unavailable"}</td><td>{day.price_usd ?? "unavailable"}</td></tr>)}</tbody></table></div>
      </section>}

      {screen === "report" && <section aria-labelledby="report-title">
        <div className="page-heading"><div><p className="eyebrow">Report editor & export</p><h1 id="report-title">A portable argument, not a screenshot.</h1><p>The bundle contains observations, source digests, assumptions, formulas, deterministic results, optional validated AI outputs, and verifier instructions—never credentials.</p></div><button onClick={() => void prepareReport()}>Freeze current report</button></div>
        <label className="editor-label">Research notes<textarea value={notes} onChange={(event) => { setNotes(event.target.value); setPrepared(null); }} placeholder="Add interpretation, caveats, or decisions. Do not add private or personal data to a report you intend to publish." /></label>
        <div className="falsification-grid">{falsificationRows().map((row) => <article key={row.id}><span>{row.id}</span><h3>{row.threshold}</h3><p><b>Window</b> {row.window}</p><p><b>Source</b> {row.source}</p><p><b>Insufficient data</b> {row.insufficient}</p></article>)}</div>
        <div className="export-bar">
          <button disabled={!prepared} onClick={() => prepared && download(`near-underwrite-${prepared.report_id}.json`, JSON.stringify(prepared, null, 2), "application/json")}>Export reproducibility JSON</button>
          <button onClick={() => download(`near-underwrite-evidence-${snapshot.id}.csv`, evidenceCsv(snapshot), "text/csv")}>Export evidence CSV</button>
          <button disabled={!prepared} onClick={() => prepared && download(`near-underwrite-${prepared.report_id}.html`, reportHtml(prepared), "text/html")}>Export research HTML</button>
          <button disabled={!prepared} onClick={() => { if (!prepared) return; const popup = window.open("", "_blank"); if (popup) { popup.document.write(reportHtml(prepared)); popup.document.close(); popup.print(); } }}>Print / save PDF</button>
        </div>
        <p className="form-status">{prepared ? `Frozen report ${prepared.report_id} · ${prepared.created_at}` : "Freeze the report before JSON, HTML, PDF, or publication. A new freeze creates a new immutable bundle ID."}</p>
      </section>}

      {screen === "publication" && <section aria-labelledby="publication-title">
        <div className="page-heading"><div><p className="eyebrow">Testnet publication registry</p><h1 id="publication-title">Commit the hashes. Keep the research portable.</h1><p>Mainnet supplies research evidence. Testnet records report commitments. A timestamped hash proves integrity and timing—not correctness.</p></div>{contractId ? <button onClick={() => wallet?.modal.show()}>{accountId ? accountId : "Connect testnet wallet"}</button> : <StatusPill tone="warn">contract not configured</StatusPill>}</div>
        <div className="publication-grid">
          <article>
            <h2>1. Preview public fields</h2>
            <label>Parent publication (optional)<input value={parentId} onChange={(event) => { setParentId(event.target.value.trim()); setPrepared(null); setDigests(null); }} placeholder="64-character publication ID" /></label>
            <button onClick={() => void prepareReport()}>Freeze & compute commitments</button>
            <dl className="public-preview">
              <div><dt>Author</dt><dd>{accountId || "Wallet not connected"}</dd></div>
              <div><dt>Report digest</dt><dd><code>{digests?.report_digest ?? "not computed"}</code></dd></div>
              <div><dt>Evidence digest</dt><dd><code>{digests?.evidence_digest ?? "not computed"}</code></dd></div>
              <div><dt>Model digest</dt><dd><code>{digests?.model_digest ?? "not computed"}</code></dd></div>
              <div><dt>Schema</dt><dd>{prepared?.schema_version ?? "not frozen"}</dd></div>
              <div><dt>Parent</dt><dd>{parentId || "none — new lineage"}</dd></div>
            </dl>
            <p className="fine-print">The transaction contains only these public hashes, schema, parent, caller account, block height, and chain timestamp. No API key, report body, private note, or personal data is sent.</p>
            <button disabled={!contractId || !accountId || !prepared || !digests} onClick={() => void publish()}>Publish commitment on testnet</button>
            <p className="form-status">{publicationStatus}</p>
            {registryRecord && <pre>{JSON.stringify(registryRecord, null, 2)}</pre>}
          </article>
          <article>
            <h2>2. Verify from another browser</h2>
            <label>Downloaded research bundle<input type="file" accept="application/json" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try { setVerifyFile(JSON.parse(await file.text()) as ResearchBundle); setVerifyStatus("Bundle loaded; enter its publication ID"); } catch { setVerifyStatus("Mismatching: file is not valid JSON"); }
            }} /></label>
            <label>Publication ID<input id="verify-publication-id" placeholder="64 lowercase hex characters" /></label>
            <button disabled={!verifyFile || !contractId} onClick={() => void verifyUploaded((document.getElementById("verify-publication-id") as HTMLInputElement).value.trim())}>Recompute & compare final state</button>
            <p className="verify-state">{verifyStatus}</p>
            <ol><li>Recompute canonical report, evidence, and model digests.</li><li>Read the immutable publication from the configured testnet contract at finality.</li><li>Return matching, mismatching, or unavailable—never a false success.</li></ol>
          </article>
        </div>
        {recordedPublications.length > 0 && <article className="quality-panel" style={{ marginTop: "1rem", display: "block" }}>
          <p className="eyebrow">Recorded testnet proof</p><h2>Two immutable reports, one revision history</h2>
          <p>Registry: <code>{contractId}</code>. The full-access deployment key is retained locally and can upgrade the account code. Verification checks the recorded code hash.</p>
          {recordedPublications.map((publication, index) => <p key={publication.publication_id}><a href={"./evidence/report" + (index === 1 ? "-v2" : "") + ".json"} download>Download report {index + 1}</a> · <code>{publication.publication_id}</code>{publication.parent_id && <small> · revises {publication.parent_id}</small>}</p>)}
          <a href="./evidence/deployment.json" target="_blank" rel="noreferrer">Inspect transaction hashes, code hash, access keys, and final records</a>
        </article>}
      </section>}

      {screen === "settings" && <section aria-labelledby="settings-title">
        <div className="page-heading"><div><p className="eyebrow">User-controlled AI</p><h1 id="settings-title">Your provider. Your key. One request at a time.</h1><p>The backend necessarily processes the key during a proxied HTTPS request, then discards it. It is not end-to-end secret from this application server.</p></div><StatusPill tone={apiKey ? "good" : "neutral"}>{apiKey ? "key in memory" : "locked"}</StatusPill></div>
        <div className="settings-grid">
          <form onSubmit={(event) => event.preventDefault()}>
            <h2>Provider connection</h2>
            <label>Provider<select value={provider} onChange={(event) => {
              const next = event.target.value as typeof provider;
              setProvider(next);
              setEndpoint(next === "near-ai" ? "https://cloud-api.near.ai/v1" : "");
              setModel("");
            }}><option value="near-ai">NEAR AI Cloud</option><option value="openai-compatible">Allowlisted OpenAI-compatible</option><option value="local">Operator-only local inference</option></select></label>
            <label>Base URL<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} readOnly={provider === "near-ai"} /></label>
            <label>API key<span className="password-row"><input aria-label="API key" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" /><button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? "Hide" : "Reveal"}</button></span></label>
            <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Discover or enter an available model" /></label>
            <div className="button-row"><button type="button" disabled={!apiKey || !endpoint} onClick={async () => {
              setModelsStatus("Testing connection and discovering models…");
              try {
                const result = await discoverModels({ provider, endpoint, api_key: apiKey });
                const data = (result as { data?: Array<{ id?: string }> }).data ?? [];
                if (!model && data[0]?.id) setModel(data[0].id);
                setModelsStatus(`Connection succeeded · ${data.length} model records returned`);
              } catch (cause) { setModelsStatus(`Connection failed: ${cause instanceof Error ? cause.message : String(cause)}`); }
            }}>Test & discover</button><button type="button" onClick={() => { setApiKey(""); setShowKey(false); setVaultStatus(hasRememberedKey() ? "Encrypted key saved; locked" : "Key cleared"); }}>Clear / lock</button></div>
            <p className="form-status">{modelsStatus}</p>
          </form>
          <form onSubmit={(event) => event.preventDefault()}>
            <h2>Encrypted device vault</h2>
            <p>Optional. AES-256-GCM with a fresh nonce and salt; PBKDF2-SHA-256 at 310,000 iterations. The passphrase and derived key are never stored.</p>
            <label>Vault passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" /></label>
            <div className="button-row">
              <button type="button" disabled={!apiKey || passphrase.length < 12} onClick={async () => { try { await rememberKey(apiKey, passphrase); setPassphrase(""); setVaultStatus("Encrypted key saved; currently unlocked in memory"); } catch (cause) { setVaultStatus(cause instanceof Error ? cause.message : String(cause)); } }}>Remember on this device</button>
              <button type="button" disabled={!hasRememberedKey() || !passphrase} onClick={async () => { try { setApiKey(await unlockKey(passphrase)); setPassphrase(""); setVaultStatus("Encrypted key unlocked into memory"); } catch { setVaultStatus("Unlock failed; passphrase or vault data is invalid"); } }}>Unlock</button>
              <button type="button" onClick={() => { forgetKey(); setApiKey(""); setPassphrase(""); setVaultStatus("Forgotten from this device"); }}>Forget this device</button>
            </div>
            <p className="form-status">{vaultStatus}</p>
          </form>
          <form onSubmit={(event) => event.preventDefault()}>
            <h2>Request boundaries</h2>
            <label>Output token limit<input type="number" min="128" max="4096" value={maxOutput} onChange={(event) => setMaxOutput(Number(event.target.value))} /></label>
            <label>Maximum calls per analysis<input type="number" min="1" max="3" value={maxCalls} onChange={(event) => setMaxCalls(Number(event.target.value))} /></label>
            <label>Daily application call budget<input type="number" min="1" max="24" value={dailyBudget} onChange={(event) => setDailyBudget(Number(event.target.value))} /></label>
            <label>Confirm before call number<input type="number" min="1" max="3" value={confirmThreshold} onChange={(event) => setConfirmThreshold(Number(event.target.value))} /></label>
            <div className="setup-message"><b>Dollar-budget mode is disabled.</b><span>No verified provider/model price table is configured, so the app will not mislabel call or token limits as a guaranteed spending cap.</span></div>
          </form>
        </div>
        <p className="fine-print">Hosted generic endpoints require an operator allowlist, HTTPS, public DNS resolution pinned for the request, and no redirects. Private, loopback, link-local, metadata, and reserved addresses are rejected. Local inference works only when the operator explicitly configures one fixed endpoint; a remote browser cannot assume it can reach localhost.</p>
      </section>}
    </main>
    <footer><span>NEAR UNDERWRITE · Research instrument, not personalized investment advice.</span><span>Mainnet evidence · Testnet publication · <a href="https://nearblocks.io" target="_blank" rel="noreferrer">Powered by NearBlocks APIs</a></span></footer>
  </div>;
}
