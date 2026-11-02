#!/usr/bin/env bash
#
# In-container steps of ./bin/docker-e2e (docker-compose.e2e.yml). Not meant to be run on the host.
#
# Usage: e2e-runner.sh [--deps] [--prepare] -- <command>
#   --deps      install dependencies into the node_modules volume
#   --prepare   migrate (and seed a fresh DB), build the app when its fingerprint changed, and make
#               sure the standalone server answers on :4100
#   command     test [playwright args] | ui [playwright args] | session | any other command
#
# test and ui hold a lock for the whole prepare + run, because Playwright empties test-results/e2e
# at the start of every run and a rebuild restarts the server under a running suite.

set -euo pipefail

cd /app

SERVER_LOG=test-results/e2e-server.log
SERVER_PID_FILE=/tmp/e2e-server.pid
LOCK_FILE=/tmp/e2e-playwright.lock
UI_PID_FILE=/tmp/e2e-ui.pid
FINGERPRINT_FILE=.next/.e2e-fingerprint
SESSION_READY_FILE=/tmp/e2e-session.ready
SESSION_DEADLINE_FILE=/tmp/e2e-session.deadline

note() { echo "[docker-e2e] $*"; }

install_deps() {
    # Same install as docker-compose.testunit.yml, except --config.trustLockfile: without it pnpm
    # applies the minimumReleaseAge of pnpm-workspace.yaml here exactly as on the host.
    pnpm install --config.store-dir=/app/node_modules/.pnpm-store --ignore-scripts --frozen-lockfile \
        --prefer-offline --config.confirmModulesPurge=false || {
        echo "docker-e2e: pnpm install failed. On ERR_PNPM_OUTDATED_LOCKFILE, run  pnpm install  on the host;" >&2
        echo "docker-e2e: otherwise reset this checkout's dependencies with  ./bin/docker-e2e --clean" >&2
        exit 1
    }
    # An interrupted install can leave node_modules that pnpm reports as up to date.
    local package
    for package in kysely-ctl next @playwright/test tsx; do
        if [ ! -f "node_modules/$package/package.json" ]; then
            echo "docker-e2e: node_modules is incomplete ($package is missing); run  ./bin/docker-e2e --clean" >&2
            exit 1
        fi
    done
}

psql_e2e() {
    PGPASSWORD=si psql -h db -U si -v ON_ERROR_STOP=1 -qtA "$@"
}

# bin/migrate-dev-db without the type codegen, prettier and eslint: those would rewrite the tracked
# src/database/types.ts through the bind mount.
prepare_db() {
    local fresh=false applied on_disk migration
    if [ "$(psql_e2e -d si_e2e -c "SELECT to_regclass('public.kysely_migration') IS NOT NULL")" != t ]; then
        fresh=true
    else
        applied=$(psql_e2e -d si_e2e -c 'SELECT name FROM kysely_migration')
        on_disk=$(find src/database/migrations -maxdepth 1 -name '*.ts' -exec basename {} .ts \; 2>/dev/null || true)
        if [ -z "$on_disk" ]; then
            note "no migrations found in src/database/migrations; skipping the mismatch check"
        else
            for migration in $applied; do
                if ! grep -qxF "$migration" <<<"$on_disk"; then
                    note "migration '$migration' is applied but not in the codebase; recreating si_e2e"
                    psql_e2e -d postgres -c 'DROP DATABASE si_e2e WITH (FORCE)' -c 'CREATE DATABASE si_e2e'
                    fresh=true
                    break
                fi
            done
        fi
    fi

    pnpm exec kysely migrate:latest

    if [ "$fresh" = true ]; then
        # Both seeds return early without ALLOW_TESTING_DATA, and the specs need their orgs.
        note "seeding the fresh test database"
        ALLOW_TESTING_DATA=TRUE pnpm exec kysely seed:run
        ALLOW_TESTING_DATA=TRUE pnpm exec tsx bin/seed-environment.ts
    fi
}

# A zombie still answers kill -0, so check the process state too.
server_running() {
    [ -f "$SERVER_PID_FILE" ] || return 1
    local state
    state=$(ps -o stat= -p "$(cat "$SERVER_PID_FILE")" 2>/dev/null || true)
    [ -n "$state" ] && [ "${state#Z}" = "$state" ]
}

stop_server() {
    server_running || return 0
    local pid
    pid=$(cat "$SERVER_PID_FILE")
    note "stopping the app server for the rebuild"
    kill "$pid" 2>/dev/null || true
    while server_running; do sleep 0.2; done
    rm -f "$SERVER_PID_FILE"
}

server_log_tail() {
    echo "----- last lines of $SERVER_LOG -----" >&2
    tail -n 40 "$SERVER_LOG" >&2 || true
    echo "-----" >&2
}

# Sets app_rebuilt, so the caller knows a running server is stale. Never call it as an `if`
# condition: bash then ignores set -e inside it, and a failed build would carry on.
app_rebuilt=false
build_app_if_changed() {
    local want=${E2E_APP_FINGERPRINT:?E2E_APP_FINGERPRINT is set by bin/docker-e2e}
    if [ "${E2E_REBUILD:-}" != 1 ] && [ -f .next/standalone/server.js ] &&
        [ "$(cat "$FINGERPRINT_FILE" 2>/dev/null)" = "$want" ]; then
        note "app sources unchanged since the last build; skipping next build"
        return 0
    fi
    stop_server
    note "building the app (E2E_FAKE_CLERK=1)"
    rm -f "$FINGERPRINT_FILE"
    CI=true pnpm exec next build || {
        echo "docker-e2e: next build failed; see its output above." >&2
        exit 1
    }
    # The same copy steps as bin/app-test and bin/ci-server.
    cp -r public .next/standalone/
    mkdir -p .next/standalone/coder-files
    cp -r .next/static .next/standalone/.next/
    echo "$want" >"$FINGERPRINT_FILE"
    app_rebuilt=true
}

start_server() {
    mkdir -p test-results
    echo "=== app server start $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >>"$SERVER_LOG"
    note "starting the app server on :4100 (log: $SERVER_LOG)"
    # HOSTNAME: Docker sets it to the container ID, which the standalone server would bind to. The
    # subshell hands the server to the container's init, which reaps it; a session's `timeout` would
    # leave a zombie. setsid and 9>&- keep it out of the caller's signals and lock.
    (
        CI=true HOSTNAME=0.0.0.0 setsid node .next/standalone/server.js >>"$SERVER_LOG" 2>&1 9>&- &
        echo $! >"$SERVER_PID_FILE"
    )

    local i
    for i in $(seq 1 60); do
        if ! server_running; then
            echo "docker-e2e: the app server exited during startup." >&2
            server_log_tail
            exit 1
        fi
        if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:4100/account/signin || true)" != 000 ]; then
            note "app server is up (${i}s)"
            return 0
        fi
        sleep 1
    done
    echo "docker-e2e: the app server did not answer on :4100 within 60s." >&2
    server_log_tail
    exit 1
}

# Never hand off to Playwright with :4100 down: its webServer would then start `pnpm run app:test`,
# which sources a bind-mounted .env.test and points the app at the host's database.
ensure_server() {
    build_app_if_changed
    if server_running; then
        return 0
    fi
    if [ -f "$SERVER_PID_FILE" ] && [ "$app_rebuilt" = false ]; then
        echo "docker-e2e: the app server of this session has stopped." >&2
        server_log_tail
        echo "docker-e2e: end the session with ./bin/docker-e2e --down and start a new one." >&2
        exit 1
    fi
    start_server
}

take_playwright_lock() {
    exec 9>"$LOCK_FILE"
    flock -n 9 && return 0
    if [ -f "$UI_PID_FILE" ] && kill -0 "$(cat "$UI_PID_FILE")" 2>/dev/null; then
        echo "docker-e2e: Playwright UI mode is open in this session; stop the UI first." >&2
        exit 1
    fi
    note "another Playwright run is active in this session; waiting for it to finish"
    flock 9
}

deps=false
prepare=false
while [ $# -gt 0 ]; do
    case $1 in
        --deps) deps=true ;;
        --prepare) prepare=true ;;
        --)
            shift
            break
            ;;
        *)
            echo "e2e-runner.sh: unknown option $1" >&2
            exit 2
            ;;
    esac
    shift
done
[ $# -gt 0 ] || set -- test
command=$1

# bin/docker-e2e stops an interrupted run in a session through this file.
if [ -n "${E2E_RUN_ID:-}" ]; then
    echo $$ >"/tmp/e2e-run-${E2E_RUN_ID}.pid"
fi

if [ "$deps" = true ]; then install_deps; fi

case $command in
    test | ui) take_playwright_lock ;;
esac

if [ "$prepare" = true ]; then
    prepare_db
    ensure_server
fi

case $command in
    test)
        shift
        exec pnpm exec playwright test "$@"
        ;;
    ui)
        shift
        echo $$ >"$UI_PID_FILE"
        exec pnpm exec playwright test --ui-host=0.0.0.0 --ui-port=9323 "$@"
        ;;
    session)
        # The TTL counts from container start, like the timeout around Postgres and SeaweedFS.
        ttl_left=$((${E2E_TTL:-7200} - SECONDS))
        echo $(($(date +%s) + ttl_left)) >"$SESSION_DEADLINE_FILE"
        touch "$SESSION_READY_FILE"
        note "session ready; it stops by itself in $((ttl_left / 60)) min"
        exec timeout -s INT "$ttl_left" sleep infinity
        ;;
    *)
        exec "$@"
        ;;
esac
