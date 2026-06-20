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
| `apply.sh` | Validate (default) or apply the events via the Settings 2.0 API |

Both are [`builtin:anomaly-detection.metric-events`](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/settings)
objects (schema v1.0.19).

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
> 634 GB → 0 GB in ~45 min, so even a 1 TB warning gives limited runway. For
> earlier warning, consider adding a Davis **predictive/forecast** metric event
> or a rate-of-change alert on the same selector. Tune thresholds up if your
> remediation needs more time.

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
