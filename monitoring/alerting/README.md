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
| `vmware-datastore-cx-overcommit.json`         | Metric event — thin **over-provisioning** `> 150%` (leading indicator) |
| `apply.sh` | Validate (default) or apply all three metric events via the Settings 2.0 API |

All three are [`builtin:anomaly-detection.metric-events`](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/settings)
objects (schema v1.0.19), validated against tenant `fau66290` (`validateOnly` →
HTTP 200). Forecasting needs a **Workflow**, not an anomaly detector — see the
[Forecast](#forecast-davis-predictive--requires-a-workflow) section.

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
> over-commit event and the forecast Workflow (below) address this by alerting
> *ahead* of the drain.

## Over-provisioning (thin over-commit) — the leading indicator

`vmware-datastore-cx-overcommit.json` alerts when a CX datastore is provisioned
**> 150%** via `func:vmware.datastore.disk.percent_provisioned` (a VMware
extension metric). This is the *root-cause* signal for this incident class:
thin-provisioned VMDKs are entitled to more space than the datastore holds, so
as they grow the datastore fills. On 2026-06-20 `CX_IMG4` was **159% provisioned
with ~26 TB uncommitted** — a standing risk that was visible long before free
space dropped, but never alerted.

Unlike free space, this is a *standing* condition, so set the threshold to your
thin-provisioning tolerance. At `150%`, only `CX_IMG4` (159%) fires today;
`CX` (113%) and `CX_IMG`/`CX_IMG2` (~100%) do not. Lower it (e.g. 120%) to be
stricter. Companion metrics worth a dashboard tile: `vmware.datastore.uncommitted`,
`vmware.datastore.disk.provisioned.latest`.

## Forecast (Davis predictive) — requires a Workflow

**Davis anomaly detectors do not support a forecast analyzer.** Verified against
this tenant: `builtin:davis.anomaly-detectors` only accepts the Static, Seasonal,
and Auto-adaptive analyzers; the forecast analyzer
`dt.statistics.GenericForecastAnalyzer` exists but returns *"not supported in
anomaly detection."* Forecasting therefore lives in a **Workflow**
(AutomationEngine), which is **not committed here** — the Workflow/automation API
(`/platform/automation/*`) is blocked by this environment's network egress
policy, so it could not be built or validated from this session.

To add it, create a scheduled Workflow (UI: **Workflows → New**) that:

1. Runs every ~15 min.
2. Executes `dt.statistics.GenericForecastAnalyzer` with input `timeSeriesData`:
   ```
   timeseries free = avg(vmware.datastore.freeSpace), by:{datastore.name},
     filter: { contains(datastore.name, "prdsan") and contains(datastore.name, "CX") }
   ```
   and `forecastHorizon` (e.g. 120) / `coverageProbability` (e.g. 0.9).
3. Branches on the forecast crossing 500 GB (`500000000000` bytes) and, if so,
   raises a Davis event (e.g. via the `Create Davis event` / `davis.events`
   action) attached to the datastore entity.

Given the ~1 TB/hr drain, the **over-commit alert above is the more reliable
early warning** for this failure mode; treat the forecast Workflow as additive.

## Apply

`apply.sh` applies the **three metric events** (not the forecast Workflow). It
works with a classic Api-Token *or* a platform token:

```bash
export DT_TENANT=https://fau66290.live.dynatrace.com
# classic token (default):
export DT_API_TOKEN=dt0c01....            # scope: settings.write
# or a platform token:
#   export DT_API_TOKEN=dt0s16....
#   export DT_AUTH_SCHEME=Bearer

./apply.sh            # validate only (no changes)
./apply.sh --apply    # create the metric events
```

Verify under **Settings → Anomaly detection → Metric events**. All three
payloads validated (`?validateOnly=true` → HTTP 200) on tenant `fau66290` on
2026-06-20.

## Rollback

Delete the three metric events in the Dynatrace UI (Settings → Anomaly detection →
Metric events), or via the Settings API: `GET` the objects filtered by
`schemaIds=builtin:anomaly-detection.metric-events`, find the ones whose
`summary` starts with `VMware CX production datastore`, and `DELETE
/api/v2/settings/objects/{objectId}`.
