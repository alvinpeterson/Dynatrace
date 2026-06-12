# HealthEquity Member Journey SLOs

A Dynatrace App (AppEngine / Grail + DQL) that tracks **SLOs and error budgets**
for HealthEquity's most critical member journeys:

| Journey | Tier | Objectives |
| --- | --- | --- |
| Member Authentication | Critical | Availability 99.9% · Latency ≤ 1500ms @ 99% |
| HSA Contribution (Money-In) | Critical | Availability 99.9% · Latency ≤ 2000ms @ 99% |
| Card Transaction Authorization | Critical | Availability 99.95% · Latency ≤ 800ms @ 99.5% |
| Claims & Reimbursement Submission | High | Availability 99.5% · Latency ≤ 3000ms @ 99% |
| Reimbursement Disbursement | High | Availability 99.5% · Latency ≤ 5000ms @ 99% |
| Open Enrollment Signup | High | Availability 99.9% · Latency ≤ 2500ms @ 99% |
| Employer Enrollment File Ingestion | Standard | Availability 99.0% |

## The SLI signal

The app reads **business events** the applications emit with a common shape:

```
event.provider == "com.healthequity"
journey        == "<journey id>"        // e.g. "account.funding"
outcome        == "success" | "failure"
duration       == <end-to-end latency in ms>
```

All journeys, targets, and field names live in one place —
[`src/app/config/journeys.ts`](src/app/config/journeys.ts). Adjust that file to
match your instrumentation and every SLO card, query, and the companion
dashboard update with it. If your signal lives in spans or logs rather than
business events, change the `fetch` source in
[`src/app/queries/slo.ts`](src/app/queries/slo.ts).

## Project layout

```
src/app/
  config/journeys.ts     # single source of truth: journeys + SLO targets
  queries/slo.ts         # DQL builders (availability, latency, trend, overview)
  hooks/useDql.ts        # runs DQL against Grail via @dynatrace-sdk/client-query
  components/SloCard.tsx  # renders one journey and its SLOs
  App.tsx                # page layout
```

## Develop & deploy

> Requires Node.js 18+ and access to your Dynatrace environment.

```bash
cd apps/member-journey-slo
npm install

# point the app at your tenant
#   edit app.config.json -> environmentUrl: https://<env-id>.apps.dynatrace.com

npm start      # dt-app dev — live preview in the browser
npm run deploy # dt-app deploy — publish to the environment
```

The required Grail scopes (`storage:bizevents:read`, `storage:spans:read`,
`storage:metrics:read`, `storage:logs:read`) are declared in
[`app.config.json`](app.config.json).

## Companion dashboard

A read-only Platform dashboard mirroring these same DQL queries lives in the
`Dynatrace_Dashboards` repo under `member-journey-slo/`. Use the app for the
interactive, per-journey view and the dashboard for an at-a-glance overview /
TV-mode display.
