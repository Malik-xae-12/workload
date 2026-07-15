  import type { Stats } from "../../shared/types";

  interface Props {
    stats: Stats;
  }

  function Ring({ pct, color }: { pct: number; color: string }) {
    const r = 34;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;

    return (
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--track)" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="49" textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="700">
          {pct}%
        </text>
      </svg>
    );
  }

  export function StatsDashboard({ stats }: Props) {
    // DEFENSIVE: never crash on undefined stats or nested properties
    const safeStats = stats;
    const matched = safeStats.matched ?? 0;
    const unmatched = safeStats.unmatched ?? 0;
    const totalTemplates = safeStats.total_templates ?? matched + unmatched;
    const templateTables = safeStats.template_tables ?? 0;
    const rawMatchRate = safeStats.match_rate ?? 0;
    const matchRatePct = rawMatchRate > 0 && rawMatchRate <= 1 ? rawMatchRate * 100 : rawMatchRate;
    const scoreDist = safeStats.score_distribution || { high: 0, medium: 0 };

    return (
      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-ring">
            <Ring pct={Math.round(matchRatePct)} color="var(--accent)" />
          </div>
          <div className="stat-info">
            <span className="stat-label">Match Rate</span>
            <span className="stat-sub">{matched} of {totalTemplates} template columns</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-num">{matched}</span>
          <span className="stat-label">Matched</span>
          <span className="stat-badge green">✓</span>
        </div>

        <div className="stat-card">
          <span className="stat-num">{safeStats.unmatched ?? 0}</span>
          <span className="stat-label">Unmatched</span>
          <span className="stat-badge red">✗</span>
        </div>

        <div className="stat-card">
          <span className="stat-num">{safeStats.avg_score ?? "—"}</span>
          <span className="stat-label">Avg Score</span>
          <span className="stat-badge blue">≈</span>
        </div>

        <div className="stat-card">
          <span className="stat-num">{templateTables}</span>
          <span className="stat-label">Template Tables</span>
          <span className="stat-badge purple">⊞</span>
        </div>

        <div className="stat-card score-dist">
          <span className="stat-label">Score Breakdown</span>
          <div className="dist-bars">
            <div className="dist-row">
              <span>High ≥ 0.85</span>
              <div className="dist-bar-wrap">
                <div
                  className="dist-bar high"
                  style={{ width: `${matched ? ((scoreDist.high ?? 0) / matched) * 100 : 0}%` }}
                />
              </div>
              <span className="dist-count">{scoreDist.high ?? 0}</span>
            </div>
            <div className="dist-row">
              <span>Med 0.72–0.85</span>
              <div className="dist-bar-wrap">
                <div
                  className="dist-bar medium"
                  style={{ width: `${matched ? ((scoreDist.medium ?? 0) / matched) * 100 : 0}%` }}
                />
              </div>
              <span className="dist-count">{scoreDist.medium ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }