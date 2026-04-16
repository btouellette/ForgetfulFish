#!/usr/bin/env bash
set -euo pipefail

mode="${1:-check}"

case "$mode" in
  check | write) ;;
  *)
    printf 'Usage: %s [check|write]\n' "$0" >&2
    exit 1
    ;;
esac

resolve_diff_range() {
  if [[ -n "${FORMAT_DIFF_RANGE:-}" ]]; then
    printf '%s' "$FORMAT_DIFF_RANGE"
    return
  fi

  if [[ -n "${GITHUB_BASE_SHA:-}" && -n "${GITHUB_HEAD_SHA:-}" ]]; then
    printf '%s...%s' "$GITHUB_BASE_SHA" "$GITHUB_HEAD_SHA"
    return
  fi

  if [[ -n "${GITHUB_EVENT_BEFORE:-}" && -n "${GITHUB_SHA:-}" && "$GITHUB_EVENT_BEFORE" != "0000000000000000000000000000000000000000" ]]; then
    printf '%s...%s' "$GITHUB_EVENT_BEFORE" "$GITHUB_SHA"
    return
  fi

  if git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then
    printf '%s' '@{upstream}...HEAD'
    return
  fi

  if git rev-parse --verify 'origin/main' >/dev/null 2>&1; then
    base_commit="$(git merge-base HEAD origin/main)"
    printf '%s...HEAD' "$base_commit"
    return
  fi

  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    printf '%s' 'HEAD~1...HEAD'
    return
  fi

  printf '%s' 'HEAD'
}

diff_range="$(resolve_diff_range)"

changed_files=()
while IFS= read -r file; do
  changed_files+=("$file")
done < <(git diff --name-only --diff-filter=ACMR "$diff_range")

if [[ ${#changed_files[@]} -eq 0 ]]; then
  printf 'No changed files to format-check (%s).\n' "$diff_range"
  exit 0
fi

printf 'Running prettier --%s on %s changed files (%s).\n' "$mode" "${#changed_files[@]}" "$diff_range"
pnpm exec prettier "--${mode}" --ignore-unknown "${changed_files[@]}"
