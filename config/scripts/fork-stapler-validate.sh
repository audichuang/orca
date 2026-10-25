#!/usr/bin/env bash
# Fork release: check the app's stapled notarization ticket against Apple, riding out a dropped CloudKit connection.
# Usage: fork-stapler-validate.sh <app>. Env: STAPLER_VALIDATE_ATTEMPTS (default 3), STAPLER_VALIDATE_DELAY_SECONDS (default 30).
# Why retry only exit 68 (EX_NOHOST): it means CloudKit was unreachable; every other failure, such as a missing ticket, is final.
set -uo pipefail

app=${1:?usage: fork-stapler-validate.sh <app>}
attempts=${STAPLER_VALIDATE_ATTEMPTS:-3}
delay=${STAPLER_VALIDATE_DELAY_SECONDS:-30}

for ((attempt = 1; ; attempt++)); do
  xcrun stapler validate "$app"
  status=$?
  [ "$status" -eq 0 ] && exit 0
  if [ "$status" -ne 68 ] || [ "$attempt" -ge "$attempts" ]; then
    echo "fork-stapler-validate: stapler validate failed with exit $status on attempt $attempt of $attempts" >&2
    exit "$status"
  fi
  echo "fork-stapler-validate: CloudKit unreachable (exit 68), retrying in ${delay}s ($attempt of $attempts)" >&2
  sleep "$delay"
done
