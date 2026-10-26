#!/usr/bin/env bash
# Fork-only: block until a background job writes its exit-code file, for at most MAX seconds.
# Why: an unattended agent that ends its turn to await a background-task notice looks idle, and an Orca
# automation then marks the run completed and may close its terminal (auto-rebase run 121, v1.4.241).
# Start the job as `<cmd> >LOG 2>&1; echo $? >LOG.exit` in the background, then call this until it exits 0.
# Usage: fork-wait-for-job.sh <exit-file> [max-seconds, default 540: under the agent's 10-minute call limit]
# Exit: 0 the job finished (prints its exit code); 3 still running (call again); 2 usage error.
set -u
file=${1:-}
max=${2:-540}
[ -n "$file" ] && [[ $max =~ ^[1-9][0-9]*$ ]] || { echo "usage: fork-wait-for-job.sh <exit-file> [max-seconds]" >&2; exit 2; }
deadline=$((SECONDS + max))
while [ ! -s "$file" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "still running after ${max}s; call again"
    exit 3
  fi
  sleep 10
done
echo "finished with exit code $(cat "$file")"
