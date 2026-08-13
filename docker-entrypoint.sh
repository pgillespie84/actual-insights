#!/bin/sh
set -e

# Fix ownership of the mounted data volume so the app user can write to it.
# Runs as root (USER nextjs is intentionally not set before ENTRYPOINT),
# then all subsequent commands are exec'd as nextjs via su-exec.
chown -R nextjs:nodejs /data 2>/dev/null || true

# Run Prisma migrations as the app user.
# stderr is deliberately not suppressed: a failure here means the schema does
# not match the generated client, and the error text is the only thing that
# explains the query failures that follow. "Already up to date" is a success
# exit from migrate deploy, so it needs no special case.
if su-exec nextjs npx prisma migrate deploy; then
  echo "Migrations up to date."
else
  echo "WARNING: prisma migrate deploy failed (exit $?). Starting anyway — expect query errors until the schema is fixed." >&2
fi

exec su-exec nextjs "$@"
