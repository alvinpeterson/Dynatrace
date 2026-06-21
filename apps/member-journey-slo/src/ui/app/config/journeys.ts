/**
 * Single source of truth for HealthEquity member-journey SLOs.
 *
 * Every artifact in this project derives from this list:
 *   - the app UI (src/ui/app/components/SloCard.tsx)
 *   - the DQL builders (src/ui/app/queries/slo.ts)
 *   - the Platform dashboard (Dynatrace_Dashboards repo)
 *
 * The SLI signal is carried by business events the applications emit with a
 * common shape:
 *   event.provider == "com.healthequity"
 *   journey        == "<journey id>"   e.g. "account.funding"
 *   outcome        == "success" | "failure"
 *   duration       == end-to-end journey latency in milliseconds
 *
 * Adjust `bizEventProvider` / field names below to match your instrumentation.
 */

export const BIZEVENT_PROVIDER = 'com.healthequity';

/** Rolling evaluation window for SLO compliance (DQL `from:` syntax). */
export const EVALUATION_WINDOW = '-28d';

/** Shorter window used for the burn-rate / trend timeseries tiles. */
export const TREND_WINDOW = '-7d';

export type SloType = 'availability' | 'latency';

export type JourneyTier = 'critical' | 'high' | 'standard';

export interface JourneySlo {
  /** availability = success ratio; latency = % of journeys under threshold. */
  type: SloType;
  /** Objective target in percent, e.g. 99.9. */
  target: number;
  /** Latency threshold in milliseconds (required when type === 'latency'). */
  thresholdMs?: number;
}

export interface Journey {
  /** Stable id; matches the `journey` field on the business event. */
  id: string;
  /** Human-readable name shown in the UI and dashboards. */
  name: string;
  /** What the journey represents in HealthEquity's product. */
  description: string;
  /** Business criticality — drives sort order and alert severity. */
  tier: JourneyTier;
  /** One or more objectives evaluated against the journey. */
  slos: JourneySlo[];
}

export const JOURNEYS: Journey[] = [
  {
    id: 'member.login',
    name: 'Member Authentication',
    description: 'Member sign-in to the web and mobile portals.',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.9 },
      { type: 'latency', target: 99.0, thresholdMs: 1500 },
    ],
  },
  {
    id: 'account.funding',
    name: 'HSA Contribution (Money-In)',
    description: 'Member or employer contribution posted to an HSA.',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.9 },
      { type: 'latency', target: 99.0, thresholdMs: 2000 },
    ],
  },
  {
    id: 'card.authorization',
    name: 'Card Transaction Authorization',
    description: 'Real-time debit-card authorization at point of sale.',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.95 },
      { type: 'latency', target: 99.5, thresholdMs: 800 },
    ],
  },
  {
    id: 'claim.submission',
    name: 'Claims & Reimbursement Submission',
    description: 'Member submits a claim or reimbursement request.',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 3000 },
    ],
  },
  {
    id: 'reimbursement.payout',
    name: 'Reimbursement Disbursement',
    description: 'Approved reimbursement disbursed to the member.',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 5000 },
    ],
  },
  {
    id: 'enrollment.signup',
    name: 'Open Enrollment Signup',
    description: 'Member enrolls or elects benefits during open enrollment.',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.9 },
      { type: 'latency', target: 99.0, thresholdMs: 2500 },
    ],
  },
  {
    id: 'employer.file.ingestion',
    name: 'Employer Enrollment File Ingestion',
    description: 'Batch enrollment / contribution file processed from an employer.',
    tier: 'standard',
    slos: [{ type: 'availability', target: 99.0 }],
  },
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
