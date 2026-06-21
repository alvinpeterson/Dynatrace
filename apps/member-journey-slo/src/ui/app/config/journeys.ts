/**
 * Single source of truth for HealthEquity member-journey SLOs.
 *
 * Every artifact in this project derives from this list:
 *   - the app UI (src/ui/app/components/SloCard.tsx)
 *   - the DQL builders (src/ui/app/queries/slo.ts)
 *   - the Platform dashboard (Dynatrace_Dashboards repo)
 *
 * The SLI signal is distributed traces (spans). Each journey is identified by
 * the span's `endpoint.name`:
 *   availability = ratio of non-failed requests (request.is_failed == false)
 *   latency      = % of spans completing within the threshold (span `duration`)
 *
 * To add a journey, find its endpoint with a Notebook query like:
 *   fetch spans, from: -24h
 *   | summarize count(), by: { endpoint = endpoint.name }
 *   | sort `count()` desc
 * then add an entry below with that endpoint.name.
 */

/** Rolling evaluation window for SLO compliance (DQL `from:` syntax). */
export const EVALUATION_WINDOW = '-28d';

/** Shorter window used for the burn-rate / trend timeseries tiles. */
export const TREND_WINDOW = '-7d';

export type SloType = 'availability' | 'latency';

export type JourneyTier = 'critical' | 'high' | 'standard';

export interface JourneySlo {
  /** availability = success ratio; latency = % of requests under threshold. */
  type: SloType;
  /** Objective target in percent, e.g. 99.9. */
  target: number;
  /** Latency threshold in milliseconds (required when type === 'latency'). */
  thresholdMs?: number;
}

export interface Journey {
  /** Stable id used as the journey key in queries and UI. */
  id: string;
  /** Human-readable name shown in the UI and dashboards. */
  name: string;
  /** What the journey represents in HealthEquity's product. */
  description: string;
  /** Span `endpoint.name` that identifies this journey's requests. */
  endpoint: string;
  /** Business criticality — drives sort order and alert severity. */
  tier: JourneyTier;
  /** One or more objectives evaluated against the journey. */
  slos: JourneySlo[];
}

export const JOURNEYS: Journey[] = [
  {
    id: 'member.login',
    name: 'Member Authentication',
    description: 'Member sign-in to the Member Portal (/ClientLogin.aspx).',
    endpoint: '/ClientLogin.aspx',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.9 },
      { type: 'latency', target: 99.0, thresholdMs: 1500 },
    ],
  },
  {
    id: 'member.balance',
    name: 'Member Balance Inquiry',
    description: 'Member account balance lookup (GetBalanceDetails).',
    endpoint: 'GetBalanceDetails',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 2000 },
    ],
  },
  // ── Pending endpoint confirmation — add the real endpoint.name, then enable ──
  // Card authorization:      BalanceAuditHandler.Handle / Hqy.Card.BalanceAudit.*
  // Open enrollment signup:  /hqy/enrollment/v1/Partners/... , GetCustomEnrollmentConfigurationByUrl
  // HSA contribution:        HSAInterfaces.Finance.Events:VoidedCashInOutEvent
  // Claims / reimbursement:  <to be identified>
];

const TIER_ORDER: Record<JourneyTier, number> = {
  critical: 0,
  high: 1,
  standard: 2,
};

/** Journeys sorted by business criticality, then name. */
export function journeysByTier(): Journey[] {
  return [...JOURNEYS].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name),
  );
}
