export type Severity = "critical" | "high" | "moderate" | "low" | "unknown" | (string & {});

export interface Advisory {
  ghsa_id: string;
  package: string;
  severity: Severity;
  summary: string;
  vulnerableRange: string;
  firstPatchedVersion?: string | null;
  publishedAt?: string;
  source?: "cron" | "simulate";
  action?: "remediate" | "report";
  cve?: string;
  impactedReposCount?: number;
  dispatchStatus?: "merged" | "pushed" | "queued" | "simulated" | "pending";
  prNumber?: number;
}

export interface Repo {
  repo: string;
  defaultBranch?: string;
  private?: boolean;
  archived?: boolean;
  excluded?: boolean;
  lastSeenAt?: number;
  manifestEngines?: string[];
  dependencyCount?: number;
  status?: "monitored" | "excluded";
  description?: string;
}

export type JobStatus = "queued" | "patched" | "failed" | "conflict" | "blocked";
export type CiStatus = "passing" | "pending" | "failing" | "unknown" | "conflict";

export interface Job {
  jobId: string;
  ghsaId: string;
  repo: string;
  package: string;
  fromRange?: string;
  toVersion?: string | null;
  status: JobStatus;
  prNumber?: number | null;
  prUrl?: string;
  error?: string;
  updatedAt?: number;
  ciStatus?: CiStatus;
  ciDetails?: string;
  prState?: string;
  merged?: boolean;
  branch?: string;
  manifest?: string;
  isSimulated?: boolean;
}

export interface StateStats {
  advisoriesSeen: number;
  reposMonitored: number;
  prsOpened: number;
  prsMerged?: number;
  acceptanceRate?: number;
  cleanRepos?: number;
  pendingPatchRepos?: number;
  criticalHighCount?: number;
}

export interface State {
  advisories: Advisory[];
  repos: Repo[];
  jobs: Job[];
  stats: StateStats;
  tokenConfigured?: boolean;
  tokenAgeDays?: number | null;
}

export interface SimulatePayload {
  ghsa_id: string;
  package: string;
  severity: string;
  summary: string;
  vulnerable_range: string;
  first_patched_version?: string | null;
  cve?: string | null;
  target_org_scope?: string;
  resolve_transitive?: boolean;
  atomic_fanout?: boolean;
}

export interface SimulationPreset {
  id: string;
  name: string;
  payload: SimulatePayload;
  cvss: string;
  affectedCount: number;
  affectedSample: {
    repo: string;
    path: string;
    fromVersion: string;
    toVersion: string;
    status: "PATCHING" | "READY";
  }[];
}

export interface PipelineStep {
  id: number;
  title: string;
  tag: string;
  status: "completed" | "in_progress" | "queued" | "failed";
  statusText: string;
  description: string;
  progressPercent?: number;
  progressLabel?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "INIT" | "SQS" | "VALIDATE" | "SCAN" | "SQS:BATCH" | "WORKER-01" | "WORKER-02" | "WORKER-03" | "CI" | "INFO";
  message: string;
}
