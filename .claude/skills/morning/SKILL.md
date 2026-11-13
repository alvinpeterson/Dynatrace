---
name: morning
description: Morning start-of-day brief. Reviews significant Dynatrace issues since 6pm the prior workday, pulls in other pertinent signals, and triages Outlook email and Microsoft Teams messages, with priority on leadership contacts and urgent items still awaiting a reply. Run only when the teammate types /morning.
disable-model-invocation: true
argument-hint: "[optional: since=<ISO time or 'yesterday 6pm'>] [optional: tz=<IANA zone>]"
---

# /morning — start-of-day brief

Goal: give the teammate exactly what they need to start the day, focused on issues that need
action. Lead with what needs attention; leave out anything that is healthy, routine, or already handled.

This runs interactively in chat. Mail, Teams, and directory tools are set to "Needs approval",
so the teammate will approve each read call as it comes up. Use read-only tools only. Never send,
reply, forward, flag, delete, accept, or decline anything unless the teammate asks for it in this chat.

## 0. Time window

- Default window start: **6:00 PM local time on the prior workday**, until now.
  - Tuesday through Friday: 6:00 PM yesterday.
  - Monday: 6:00 PM the previous Friday (covers the weekend).
- Default time zone: `America/Denver`. Override with `tz=<IANA zone>`. Override the start with
  `since=<ISO-8601 time>`.
- Convert the start to UTC for Dynatrace queries. Print the window you used at the top of the brief.

## 1. Dynatrace (primary source)

Environment: `DT_ENVIRONMENT` (classic URL, for example `https://<tenant>.live.dynatrace.com`).
Credential: `DT_PLATFORM_TOKEN`. Never print, echo, or log the token.

Querying:
- If `dtctl` is installed and has a context, use it: `dtctl query "<DQL>" --agent -o json`.
- Otherwise call the Grail query API directly. The platform host is the classic host with `.live.`
  replaced by `.apps.`:

  ```bash
  BASE="${DT_ENVIRONMENT/.live./.apps.}"
  body=$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1],"requestTimeoutMilliseconds":60000,"maxResultRecords":500}))' "$DQL")
  curl -sS -X POST "$BASE/platform/storage/query/v1/query:execute" \
    -H "Authorization: Bearer $DT_PLATFORM_TOKEN" -H "Content-Type: application/json" -d "$body"
  ```

  If the response has `"state":"RUNNING"` and a `requestToken`, poll
  `GET $BASE/platform/storage/query/v1/query:poll?request-token=<token>` until it succeeds.

Queries to run (replace `<START>` with the UTC start, for example `2026-11-13T01:00:00Z`). If a
field does not exist in this tenant, drop it and rerun rather than guessing values.

1. Volume by status and category:
   `fetch dt.davis.problems, from:"<START>" | summarize c=count(), by:{event.status, event.category} | sort c desc`
2. Problems still active (highest priority):
   `fetch dt.davis.problems, from:"<START>" | filter event.status=="ACTIVE" | fields display_id, event.name, event.category, event.start, root_cause_entity_name, affected_entity_ids | sort event.start asc`
3. Recurring or long-running problems (noise vs. real issues):
   `fetch dt.davis.problems, from:"<START>" | summarize c=count(), longest=max(event.end - event.start), by:{event.name, root_cause_entity_name} | sort c desc | limit 25`
4. Closed problems that lasted 30 minutes or more, or that hit user-facing services, applications,
   or synthetic monitors: these matter even when they are closed.
5. Optional context, only when 2 to 4 point to it: deployment or configuration change events on the
   affected entities (`fetch events | filter event.kind=="DAVIS_EVENT" or event.type=="CUSTOM_DEPLOYMENT"`),
   and error-log spikes for a named root-cause service. Keep log scans narrow (filter by entity and
   time first); log fetches are billed by bytes scanned.

What counts as significant: anything still active; availability or error problems on member-facing
services (member portal, mobile, claims, payments and card transactions, enrollment, COBRA, commuter
benefits); problems lasting 30 minutes or more; one root cause producing many problems; any problem
that recurred overnight. Flapping monitors that opened and closed in under 5 minutes go in one
"noise" line at most.

For each significant item give: problem ID, what is affected, start time (local), current status
and duration, likely root cause, and a suggested next step or owner. Quote at most one short
decisive log line; never dump raw logs.

## 2. Other pertinent sources (best effort)

Use whatever of these is connected; skip quietly if not:
- **Atlassian (Jira / Confluence):** incident, outage, or high-priority tickets created or updated
  in the window, and change records for overnight releases.
- **Email and Teams:** monitoring alerts, incident bridges, status pages, or vendor notices (cloud
  providers, payment processors, banking partners) that line up with what Dynatrace shows.

Correlate with the Dynatrace findings: same time, same service, or same change.

## 3. Email triage (Work IQ Mail, read-only)

Search the inbox for messages received in the window (on Monday, also check anything still unread
from Friday). Use `SearchMessages`, then `GetMessage` only when you need the body.

Report in this order:
1. **Leadership:** any message from or substantially about:
   - Darek Easterly (manager)
   - Abhi Gite (CIO)
   - Ryan Hunter (VP, Engineering)
   - Sarah Kulp (Director, Operations)

   Include direct messages, threads where they replied, and threads where they asked the teammate
   something. Show sender, subject, received time, a 1 to 2 sentence summary, and the ask.
2. **Urgent and not yet answered by the teammate:** high importance, "urgent", "ASAP", "today",
   "EOD", "outage", "incident", "escalation", "blocked", "approval needed", or a direct question to the
   teammate, where the Sent Items show no reply from the teammate after the message arrived.
3. **Everything else worth knowing:** one line each, at most 5. Skip newsletters, automated
   notifications that need no action, and calendar responses.

To tell whether the teammate replied, look for a sent message in the same conversation dated after
the inbound one. If you can't tell, say "reply status unknown".

## 4. Teams triage (Work IQ Teams, read-only)

Use `ListChats` and `ListChatMessages` for chats active in the window, plus `SearchTeamsMessages`
for @mentions of the teammate in channels.

Apply the same three tiers as email: leadership (same four people), urgent and unanswered (an
@mention or direct question with no later message from the teammate in that chat or thread), then
other notable items.

If a leadership name returns multiple directory accounts, ignore admin and service accounts
(`[ADMIN]`, `[SA]`, `a_`, `sa_`, `ca_`, `svc` prefixes, or no `mail` attribute).

## 5. Output format

Use plain, calm, factual language and short sections:

```
Morning brief — <date>   Window: <start local> to <now local> (<tz>)

Needs your attention now
  1. ...  (at most 5 items, across all sources, most urgent first)

Dynatrace
  Summary: <N> problems (<active> active). <one line on overall health>
  Active: ...
  Significant overnight: ...
  Noise: ...

Leadership
  Darek Easterly — ... / nothing new
  Abhi Gite — ...
  Ryan Hunter — ...
  Sarah Kulp — ...

Urgent, awaiting your reply
  - [Email|Teams] <sender> — <subject or chat> — <received> — <the ask>

Other notable
  - ...

Not checked: <any source that was unavailable or a call that was denied>
```

## Rules

- Use "HealthEquity" (one word), "members" for HealthEquity customers, and "teammates" for colleagues.
- Treat member data as sensitive: account numbers, SSNs, DOBs, claims, diagnoses, provider
  names, employer plan data. Never repeat it in the brief; mask it (last 4 digits at most) or
  describe it generically ("a member claims question").
- Never echo secrets. If a message contains a credential, API key, token, or password, say only
  that it does and that it should be rotated; do not repeat the value.
- If anything suggests a security issue, fraud, or data exposure, put it first under "Needs your
  attention now" and recommend contacting Information Security at infosec@healthequity.com.
- For a specific member's account, balance, or claim, don't speculate. Point to the right
  internal system or Member Services.
- If a tool is denied or a source is unreachable, keep going with the rest and list it under
  "Not checked". Don't stop the whole brief.
