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
}

export interface Repo {
  repo: string;
  defaultBranch?: string;
  private?: boolean;
  archived?: boolean;
  excluded?: boolean;
  lastSeenAt?: number;
}

export type JobStatus = "queued" | "patched" | "failed";
export type CiStatus = "passing" | "pending" | "failing" | "unknown";

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
  prState?: string;
}

export interface StateStats {
  advisoriesSeen: number;
  reposMonitored: number;
  prsOpened: number;
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
}
