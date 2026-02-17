#!/bin/sh
set -eu

load_env_file() {
  file_path="$1"
  if [ -f "$file_path" ]; then
    echo "[entrypoint] Loading env from $file_path"
    temp_env="$(mktemp)"
    tr -d '\r' < "$file_path" > "$temp_env"
    set -a
    # shellcheck disable=SC1090
    . "$temp_env"
    set +a
    rm -f "$temp_env"
  fi
}

# Priority: Docker secrets > local env files
load_env_file "/run/secrets/geia.env"
load_env_file "/app/.env.local"
load_env_file "/app/.env.production"
load_env_file "/app/.env"
load_env_file "/app/.env.example"

exec "$@"
