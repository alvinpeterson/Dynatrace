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

/** Rolling evaluation window for SLO compliance, in days. */
export const EVALUATION_WINDOW_DAYS = 28;

/** Same window in DQL `from:` syntax, for display. */
export const EVALUATION_WINDOW = `-${EVALUATION_WINDOW_DAYS}d`;

/** Shorter window used for the burn-rate / trend timeseries tiles. */
export const TREND_WINDOW = '-7d';

export type SloType = 'availability' | 'latency';

export type JourneyTier = 'critical' | 'high' | 'standard';

/** Product domain a journey belongs to — used to group cards in the UI. */
export type JourneyGroup = 'Access' | 'Card' | 'Account';

/** Order the groups are displayed in. */
export const GROUP_ORDER: JourneyGroup[] = ['Access', 'Card', 'Account'];

/** OpenTelemetry span kinds, as stored in Grail's `span.kind`. */
export type SpanKind = 'SERVER' | 'CLIENT' | 'INTERNAL' | 'CONSUMER' | 'PRODUCER';

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
  /** Product domain this journey belongs to (groups cards in the UI). */
  group: JourneyGroup;
  /**
   * Span kinds to scope this journey to. Omit for web requests — the default
   * is service-entry spans (SERVER or root). Set explicitly for messaging /
   * internal flows, e.g. ['INTERNAL'] for an event handler or ['CONSUMER']
   * for a queue consumer.
   */
  spanKinds?: SpanKind[];
  /** Business criticality — drives sort order and alert severity. */
  tier: JourneyTier;
  /** One or more objectives evaluated against the journey. */
  slos: JourneySlo[];
}

export const JOURNEYS: Journey[] = [
  // ── Access ────────────────────────────────────────────────────────────────
  {
    id: 'member.login',
    name: 'Member Authentication',
    description: 'Member sign-in to the Member Portal (/ClientLogin.aspx).',
    endpoint: '/ClientLogin.aspx',
    group: 'Access',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.9 },
      { type: 'latency', target: 99.0, thresholdMs: 1500 },
    ],
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  {
    id: 'card.authorization',
    name: 'Card Transaction Authorization',
    description:
      'Real-time processing of a card transaction authorization (CardTransactionClassicHandler).',
    endpoint: 'CardTransactionClassicHandler.Handle',
    // Messaging-driven (Fiserv webhook → event → handler), so the auth decision
    // runs in an INTERNAL span, not a SERVER request.
    spanKinds: ['INTERNAL'],
    group: 'Card',
    tier: 'critical',
    slos: [
      { type: 'availability', target: 99.95 },
      { type: 'latency', target: 99.5, thresholdMs: 500 },
    ],
  },
  {
    id: 'card.activation',
    name: 'Card Activation',
    description: 'Member activates a new or replacement card (/api/card/v2/activate).',
    endpoint: '/api/card/v2/activate',
    group: 'Card',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 2000 },
    ],
  },
  {
    id: 'card.balance',
    name: 'Card Balance (Purse)',
    description:
      'Member checks available card/purse balance (/apps/memberaccountaggregationbefe/card/PurseBalance).',
    endpoint: '/apps/memberaccountaggregationbefe/card/PurseBalance',
    group: 'Card',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 2000 },
    ],
  },
  {
    id: 'card.transactions',
    name: 'Card Transaction History',
    description:
      'Member views posted card transactions (/apps/memberaccountaggregationbefe/card/transactions/postedV2).',
    endpoint: '/apps/memberaccountaggregationbefe/card/transactions/postedV2',
    group: 'Card',
    tier: 'standard',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 2500 },
    ],
  },
  {
    id: 'card.lost',
    name: 'Report Lost Card',
    description:
      'Member reports a lost card (/apps/memberaccountaggregationbefe/card/LostCard).',
    endpoint: '/apps/memberaccountaggregationbefe/card/LostCard',
    group: 'Card',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 3000 },
    ],
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    id: 'member.balance',
    name: 'Member Balance Inquiry',
    description: 'Member account balance lookup (GetBalanceDetails).',
    endpoint: 'GetBalanceDetails',
    group: 'Account',
    tier: 'high',
    slos: [
      { type: 'availability', target: 99.5 },
      { type: 'latency', target: 99.0, thresholdMs: 2000 },
    ],
  },
  // ── Pending endpoint confirmation — add the real endpoint.name, then enable ──
  // Open enrollment signup:  /hqy/enrollment/v1/Partners/... , GetCustomEnrollmentConfigurationByUrl
  // HSA contribution:        HSAInterfaces.Finance.Events:VoidedCashInOutEvent
  // Claims / reimbursement:  <to be identified>
];

const TIER_ORDER: Record<JourneyTier, number> = {
  critical: 0,
  high: 1,
  standard: 2,
};

/** Journeys for one group, sorted by business criticality, then name. */
function sortByTier(journeys: Journey[]): Journey[] {
  return [...journeys].sort(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name),
  );
}

/** All journeys, flat, sorted by business criticality, then name. */
export function journeysByTier(): Journey[] {
  return sortByTier(JOURNEYS);
}

/** Journeys bucketed by product domain, in display order. Empty groups drop out. */
export function journeysByGroup(): { group: JourneyGroup; journeys: Journey[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    journeys: sortByTier(JOURNEYS.filter((j) => j.group === group)),
  })).filter((g) => g.journeys.length > 0);
}
