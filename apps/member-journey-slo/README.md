# HealthEquity Member Journey SLOs

A Dynatrace App (AppEngine / Grail + DQL) that tracks **SLOs and error budgets**
for HealthEquity's critical member journeys, sourced from distributed traces.

Currently wired to live span data:

| Journey | Endpoint | Tier | Objectives |
| --- | --- | --- | --- |
| Member Authentication | `/ClientLogin.aspx` | Critical | Availability 99.9% · Latency ≤ 1500ms @ 99% |
| Member Balance Inquiry | `GetBalanceDetails` | High | Availability 99.5% · Latency ≤ 2000ms @ 99% |

Additional journeys (card authorization, open enrollment, HSA funding, claims)
are stubbed in [`journeys.ts`](src/ui/app/config/journeys.ts) and enabled by
adding their `endpoint.name`.

## The SLI signal

The app reads **distributed traces (spans)**. Each journey is identified by the
span's `endpoint.name`:

```
endpoint.name      identifies the journey (e.g. "/ClientLogin.aspx")
request.is_failed  drives availability (failure = is_failed == true)
duration           drives latency (compared against the threshold, e.g. 1500ms)
```

All journeys, endpoints, and targets live in one place —
[`src/ui/app/config/journeys.ts`](src/ui/app/config/journeys.ts). Add or edit an
entry there and every SLO card, query, and the companion dashboard follows. To
switch a journey to a different signal (business events or logs), change the
`fetch` source in [`src/ui/app/queries/slo.ts`](src/ui/app/queries/slo.ts).

## Project layout

```
src/ui/
  main.tsx                 # entrypoint: mounts the app inside Strato's <AppRoot>
  app/
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
