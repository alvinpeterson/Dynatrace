# VMware CX datastore — free-space alerting

Dynatrace metric events that alert when a **production CX VMware datastore** runs
low on free space. Created in response to the **2026-06-20 PRODCXFIL01 outage**,
where the datastore `blfprdsan02_CX_IMG4` filled to 0 GB and the host
`PRODCXFIL01.compliancelink.com` became unresponsive — with **no datastore-level
alert** firing at the time (only the downstream "host unavailable" problems).

## Files

| File | Purpose |
|------|---------|
| `vmware-datastore-cx-freespace-warning.json`  | Metric event — WARNING, free space `< 1000 GB` |
| `vmware-datastore-cx-freespace-critical.json` | Metric event — CRITICAL, free space `< 500 GB` |
| `vmware-datastore-cx-freespace-forecast.json` | Davis **predictive** detector — alert when free space is *forecast* to fall below 500 GB within ~2 h |
| `apply.sh` | Validate (default) or apply the two metric events via the Settings 2.0 API |

The two static events are [`builtin:anomaly-detection.metric-events`](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/settings)
objects (schema v1.0.19). The forecast detector is a
[`builtin:davis.anomaly-detectors`](https://docs.dynatrace.com/docs/platform/davis-ai/anomaly-detection)
object (schema v1.0.15).

## Why absolute GB, not % free

The datastores are large (24–57 TB), so a percentage rule is the wrong tool:

- **`5% free` alone is noise.** On the 40 TB `CX_IMG4`, 5% is ~2 TB free — not an
  emergency. (This is the case to *avoid* alerting on.)
- **An absolute floor alone is wrong on *small* datastores.** A 500 GB floor would
  fire on a 537 GB store that is 80% empty.

The rule we actually want is **"low % free AND low GB free."** Dynatrace metric
events evaluate a single metric series and have no elementwise `max()` to AND two
series together, so that exact condition can't live in one event.

The clean equivalent: **scope an absolute-GB floor to large datastores only.**
On a multi-TB datastore, "GB is low" already implies "% is low" (500 GB of 40 TB
= 1.25%), so the absolute floor *is* the AND — and scoping to large CX stores
keeps the small-datastore false positives out. That is exactly what these two
events do.

## Scope

The metric selector targets production CX datastores:

```
vmware.datastore.freeSpace:names:filter(and(
  contains("dt.entity.vmware:datastore.name","prdsan"),
  contains("dt.entity.vmware:datastore.name","CX")
)) / 1000000000
```

`/ 1000000000` converts bytes → GB so the threshold reads in GB. As of
2026-06-20 this matches 9 datastores, all 24–57 TB:

```
blfprdsan02_CX, _CX_IMG, _CX_IMG2, _CX_IMG3, _CX_IMG4, _CX_SQL
blfprdsan01_CX-SQL1, _CX-SQL2, _CX_SQL
```

To cover other large families (V5, PC, DW), clone an event and swap the second
`contains(...)` term (e.g. `"V5"`). **Do not** widen the scope to small
datastores with these absolute thresholds — give those a percentage-based event
instead.

## Thresholds & rationale

| Severity | Threshold | Behavior on incident-day data |
|----------|-----------|-------------------------------|
| WARNING  | `< 1000 GB` (1 TB) | `CX_IMG4` crossed ~09:40 (784 GB @ 09:45) — ~20 min before host impact |
| CRITICAL | `< 500 GB`         | `CX_IMG4` crossed ~10:10 (138 GB @ 10:15) — at/just after host impact |

Today none of the 9 datastores trips either threshold (lowest is ~1.05 TB free),
so this is quiet in steady state — consistent with "1 TB+ free is not urgent."

Sampling: `3` violating of `5` samples to fire, `5` to clear — slow-moving
signal, so this resists flapping while still reacting quickly.

> **Lead-time caveat:** on 2026-06-20 `CX_IMG4` drained ~1 TB/hour and went
> 634 GB → 0 GB in ~45 min, so even a 1 TB warning gives limited runway. The
> Davis forecast detector below addresses this by alerting on the *predicted*
> trajectory rather than the current value.

## Forecast (Davis predictive) detector

`vmware-datastore-cx-freespace-forecast.json` is a Davis anomaly detector using
the **prediction analyzer**
(`dt.statistics.ui.anomaly_detection.PredictionAnalyzer`). It runs a DQL
timeseries over the same CX prod datastores and raises a `CUSTOM_ALERT` when
free space is *forecast* to drop **below 500 GB within the next ~2 hours**
(`forecastHorizon = 120`, `coverageProbability = 0.9`). This fires on the
*trend* — e.g. it would have alerted during the 06:30→ steady decline well
before the static floor was hit — giving runway the static events can't.

Query (threshold is in **bytes**, so 500 GB = `500000000000`):

```
timeseries free = avg(vmware.datastore.freeSpace), by:{datastore.name},
  filter: { contains(datastore.name, "prdsan") and contains(datastore.name, "CX") }
```

### Before you apply — two required edits

1. **`executionSettings.actor`** is set to `REPLACE_WITH_SERVICE_USER_UUID`.
   Davis detectors run queries as a **service user**; put a valid service-user
   UUID here (the existing detectors in this tenant use ones like
   `a4691d58-...`). Pick the service user your team uses for monitoring-as-code.
2. Tune `forecastHorizon` / `alertThreshold` to your remediation runway if 2 h /
   500 GB isn't right.

### How to apply

> ⚠️ **Not deployable with a classic API token.** `builtin:davis.anomaly-detectors`
> requires **OAuth / a platform token** — the Settings API rejects analyzer
> validation over an Api-Token (`"Could not do validation as request was not
> done using oAuth"`). `apply.sh` therefore covers only the two static metric
> events. Apply the forecast detector one of these ways:
>
> - **UI:** Settings → Anomaly detection → Davis anomaly detectors → add, or
>   paste the `value` object.
> - **API with OAuth:** `POST /api/v2/settings/objects` using an OAuth bearer
>   token (or platform token) with `settings:objects:write`, same payload shape.
>
> Unlike the static events (validated against tenant `fau66290`,
> `validateOnly` → HTTP 200), this detector was **not** API-validated here
> because the token couldn't perform OAuth validation. Confirm the analyzer
> input keys in the UI after import.

## Apply

```bash
export DT_TENANT=https://fau66290.live.dynatrace.com
export DT_API_TOKEN=dt0c01....          # scope: settings.write
./apply.sh            # validate only (no changes)
./apply.sh --apply    # create the metric events
```

Verify under **Settings → Anomaly detection → Metric events**. Tested with
`?validateOnly=true` (HTTP 200) on tenant `fau66290` on 2026-06-20.

## Rollback

Delete the two metric events in the Dynatrace UI (Settings → Anomaly detection →
Metric events), or via the Settings API: `GET` the objects filtered by
`schemaIds=builtin:anomaly-detection.metric-events`, find the ones whose
`summary` starts with `VMware CX production datastore`, and `DELETE
/api/v2/settings/objects/{objectId}`.
