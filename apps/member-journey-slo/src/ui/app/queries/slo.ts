/**
 * DQL builders for member-journey SLIs.
 *
 * These produce the exact queries used by the app's SLO cards. The same DQL is
 * mirrored in the Platform dashboard so the app and the dashboard evaluate an
 * identical signal.
 */
import {
  BIZEVENT_PROVIDER,
  EVALUATION_WINDOW,
  TREND_WINDOW,
  type Journey,
  type JourneySlo,
} from '../config/journeys';

/** Shared filter that scopes a query to one journey's business events. */
function journeyFilter(journey: Journey): string {
  return `filter event.provider == "${BIZEVENT_PROVIDER}" and journey == "${journey.id}"`;
}

/**
 * Availability SLI: success ratio over the evaluation window, with the error
 * budget burned expressed as a percentage of the total budget (0% = pristine,
 * 100% = budget exhausted).
 */
export function availabilityQuery(journey: Journey, slo: JourneySlo): string {
  return [
    `fetch bizevents, from: ${EVALUATION_WINDOW}`,
    `| ${journeyFilter(journey)}`,
    `| summarize total = count(), failed = countIf(outcome == "failure")`,
    `| fieldsAdd sli = if(total == 0, 100.0, else: (toDouble(total - failed) / total) * 100)`,
    `| fieldsAdd target = ${slo.target}`,
    `| fieldsAdd errorBudgetBurnedPct = if(sli >= target, 0.0, else: ((target - sli) / (100 - target)) * 100)`,
    `| fields journey = "${journey.id}", sli, target, total, failed, errorBudgetBurnedPct`,
  ].join('\n');
}

/**
 * Latency SLI: percentage of journeys completing at or under the configured
 * threshold over the evaluation window.
 */
export function latencyQuery(journey: Journey, slo: JourneySlo): string {
  const threshold = slo.thresholdMs ?? 0;
  return [
    `fetch bizevents, from: ${EVALUATION_WINDOW}`,
    `| ${journeyFilter(journey)}`,
    `| summarize total = count(), withinThreshold = countIf(duration <= ${threshold})`,
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
 * burn-rate timeseries tile; availability per bucket is total vs failed.
 */
export function trendQuery(journey: Journey): string {
  return [
    `fetch bizevents, from: ${TREND_WINDOW}`,
    `| ${journeyFilter(journey)}`,
    `| makeTimeseries requests = count(), failures = countIf(outcome == "failure"), interval: 1h`,
  ].join('\n');
}

/**
 * One-row-per-journey availability summary across all journeys — used for the
 * overview table / honeycomb tile.
 */
export function overviewQuery(): string {
  return [
    `fetch bizevents, from: ${EVALUATION_WINDOW}`,
    `| filter event.provider == "${BIZEVENT_PROVIDER}" and isNotNull(journey)`,
    `| summarize total = count(), failed = countIf(outcome == "failure"), by: { journey }`,
    `| fieldsAdd availabilityPct = if(total == 0, 100.0, else: (toDouble(total - failed) / total) * 100)`,
    `| sort availabilityPct asc`,
  ].join('\n');
}
