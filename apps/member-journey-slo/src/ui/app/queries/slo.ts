/**
 * DQL builders for member-journey SLIs, sourced from distributed traces (spans).
 *
 * These produce the exact queries used by the app's SLO cards. The same DQL is
 * mirrored in the Platform dashboard so the app and the dashboard evaluate an
 * identical signal.
 *
 * Span specifics handled here:
 *   - failures use the Davis-computed `request.is_failed` boolean
 *   - `duration` is a DQL duration type; thresholds are written as `<n>ms`
 */
import {
  EVALUATION_WINDOW,
  TREND_WINDOW,
  JOURNEYS,
  type Journey,
  type JourneySlo,
} from '../config/journeys';

/**
 * Scopes a query to one journey's service-entry spans. Restricting to SERVER /
 * root spans excludes the high-volume internal and client hops, which keeps the
 * scan fast and makes availability/latency reflect the request as the member
 * experiences it.
 */
function journeyFilter(journey: Journey): string {
  return `filter (span.kind == "SERVER" or request.is_root_span == true) and endpoint.name == "${journey.endpoint}"`;
}

/**
 * Availability SLI: non-failed request ratio over the evaluation window, with
 * the error budget burned expressed as a percentage of the total budget
 * (0% = pristine, 100% = budget exhausted).
 */
export function availabilityQuery(journey: Journey, slo: JourneySlo): string {
  return [
    `fetch spans`,
    `| ${journeyFilter(journey)}`,
    `| summarize total = count(), failed = countIf(request.is_failed == true)`,
    `| fieldsAdd sli = if(total == 0, 100.0, else: (toDouble(total - failed) / total) * 100)`,
    `| fieldsAdd target = ${slo.target}`,
    `| fieldsAdd errorBudgetBurnedPct = if(sli >= target, 0.0, else: ((target - sli) / (100 - target)) * 100)`,
    `| fields journey = "${journey.id}", sli, target, total, failed, errorBudgetBurnedPct`,
  ].join('\n');
}

/**
 * Latency SLI: percentage of requests completing at or under the configured
 * threshold over the evaluation window.
 */
export function latencyQuery(journey: Journey, slo: JourneySlo): string {
  const threshold = slo.thresholdMs ?? 0;
  return [
    `fetch spans`,
    `| ${journeyFilter(journey)}`,
    `| summarize total = count(), withinThreshold = countIf(duration <= ${threshold}ms)`,
    `| fieldsAdd sli = if(total == 0, 100.0, else: (toDouble(withinThreshold) / total) * 100)`,
    `| fieldsAdd target = ${slo.target}`,
    `| fields journey = "${journey.id}", sli, target, total, thresholdMs = ${threshold}`,
  ].join('\n');
}

/** Picks the right builder for an SLO definition. */
export function sloQuery(journey: Journey, slo: JourneySlo): string {
  return slo.type === 'availability'
    ? availabilityQuery(journey, slo)
    : latencyQuery(journey, slo);
}

/**
 * Hourly request/failure trend for a journey over the trend window. Drives the
 * burn-rate timeseries tile; availability per bucket is requests vs failures.
 */
export function trendQuery(journey: Journey): string {
  return [
    `fetch spans, from: ${TREND_WINDOW}`,
    `| ${journeyFilter(journey)}`,
    `| makeTimeseries requests = count(), failures = countIf(request.is_failed == true), interval: 1h`,
  ].join('\n');
}

/**
 * One-row-per-journey availability summary across all mapped journeys — used
 * for the overview table / honeycomb tile.
 */
export function overviewQuery(): string {
  const endpoints = JOURNEYS.map((j) => `"${j.endpoint}"`).join(', ');
  return [
    `fetch spans, from: ${EVALUATION_WINDOW}`,
    `| filter in(endpoint.name, ${endpoints})`,
    `| summarize total = count(), failed = countIf(request.is_failed == true), by: { endpoint = endpoint.name }`,
    `| fieldsAdd availabilityPct = if(total == 0, 100.0, else: (toDouble(total - failed) / total) * 100)`,
    `| sort availabilityPct asc`,
  ].join('\n');
}
