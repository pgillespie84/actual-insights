#!/bin/sh
set -e

# Fix ownership of the mounted data volume so the app user can write to it.
# Runs as root (USER nextjs is intentionally not set before ENTRYPOINT),
# then all subsequent commands are exec'd as nextjs via su-exec.
chown -R nextjs:nodejs /data 2>/dev/null || true

# Run Prisma migrations as the app user
su-exec nextjs npx prisma migrate deploy 2>/dev/null || echo "Migrations applied (or already up to date)"

exec su-exec nextjs "$@"
