export interface DBCredentials {
  server: string;
  client_id: string;
  client_secret: string;
  tenant_id: string;
  template_db: string;
  source_db: string;
  template_table: string;
  source_table: string;
  min_confidence: number;
  gap_threshold: number;
  name_weight: number;
  context_weight: number;
}

/** Same mapping params as DBCredentials, minus everything secret — used when
 * running Finin against the logged-in user's own Fabric project, where the
 * server resolves the service-principal credentials itself. connection_name
 * tells it which connection's SourceInformationSchema to read column metadata
 * from, instead of connecting to a live source system. */
export interface ProjectMappingParams {
  project_id: string;
  connection_name?: string;
  min_confidence: number;
  gap_threshold: number;
  name_weight: number;
  context_weight: number;
}

// types.ts
export interface MappingRow {
  template_table: string;
  template_column: string;
  mapped_source_table: string;
  mapped_source_column: string;
  mapped_source_datatype: string;
  mapping_score: number;
  name_similarity: number;
  context_similarity: number;
  gap: number;
  status: "matched" | "unmatched";
  reason: string;
  [key: string]: any; // for extra source columns
}

export interface Stats {
  total_templates: number;
  matched: number;
  unmatched: number;
  match_rate: number;
  avg_score: number;
  template_tables: number;
  score_distribution: {
    high: number;
    medium: number;
  };
}

export interface JobResult {
  stats: Stats;
  rows: MappingRow[];
  source_columns_by_table?: Record<string, string[]>;
}

export interface Job {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  total: number;
  message: string;
  result: JobResult | null;
}