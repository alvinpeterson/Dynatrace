#!/usr/bin/env bash
#
# Apply the VMware CX datastore free-space metric events to a Dynatrace tenant.
#
# Credentials are read from the environment (never hard-code the token):
#   DT_TENANT     e.g. https://fau66290.live.dynatrace.com
#   DT_API_TOKEN  token with scope: settings.write (and settings.read)
#
# Usage:
#   ./apply.sh            # validate only (default, makes no changes)
#   ./apply.sh --apply    # create/update the metric events
#
set -euo pipefail

: "${DT_TENANT:?set DT_TENANT, e.g. https://fau66290.live.dynatrace.com}"
: "${DT_API_TOKEN:?set DT_API_TOKEN (needs settings.write)}"

BASE="${DT_TENANT%/}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES=(
  "vmware-datastore-cx-freespace-warning.json"
  "vmware-datastore-cx-freespace-critical.json"
)

MODE="validate"
QUERY="?validateOnly=true"
if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
  QUERY=""
fi

echo "Tenant: $BASE"
echo "Mode:   $MODE"
echo

for f in "${FILES[@]}"; do
  echo "--- $f ---"
  http=$(curl -s -o /tmp/dt_resp.json -w "%{http_code}" -X POST "$BASE/api/v2/settings/objects$QUERY" \
    -H "Authorization: Api-Token $DT_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data @"$DIR/$f")
  cat /tmp/dt_resp.json; echo
  if [[ "$http" != "200" ]]; then
    echo "FAILED (HTTP $http) for $f" >&2
    exit 1
  fi
  echo
done

if [[ "$MODE" == "validate" ]]; then
  echo "Validation passed. Re-run with --apply to create the metric events."
else
  echo "Applied. Verify under Settings > Anomaly detection > Metric events in Dynatrace."
fi
