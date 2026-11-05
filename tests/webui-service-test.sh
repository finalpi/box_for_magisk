#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "${test_dir}"' EXIT

mkdir -p "${test_dir}/run" "${test_dir}/scripts"
cp "${repo_dir}/box/settings.ini" "${test_dir}/settings.ini"
sed -i 's/\r$//' "${test_dir}/settings.ini"
sed -i "s#/data/adb/box#${test_dir}#g" "${test_dir}/settings.ini"

busybox() {
  command "$@"
}
export -f busybox
export BOX_DIR="${test_dir}"
export BOX_SHELL="/usr/bin/bash"

control="${repo_dir}/box/scripts/webui.service"

settings_output="$(bash "${control}" settings)"
grep -q '^bin_name=' <<<"${settings_output}"
grep -q '^subscription_urls=' <<<"${settings_output}"

bash "${control}" set ipv6 dHJ1ZQ== >/dev/null
grep -q '^ipv6="true"$' "${test_dir}/settings.ini"

first_url="https://example.com/sub?token=a&name=first"
second_url='https://example.net/path?value=$safe'
encoded_urls="$(printf '%s' "${first_url}" | base64 -w0),$(printf '%s' "${second_url}" | base64 -w0)"
bash "${control}" set-subscriptions "${encoded_urls}" >/dev/null
bash -n "${test_dir}/settings.ini"

saved_urls="$(BOX_DIR="${test_dir}" BOX_SHELL="/usr/bin/bash" bash "${control}" settings | grep '^subscription_urls=' | cut -d= -f2- | base64 -d)"
[[ "${saved_urls}" == "${first_url}"$'\n'"${second_url}" ]]

if bash "${control}" set bin_name aW52YWxpZA== >/dev/null 2>&1; then
  echo "invalid core was accepted" >&2
  exit 1
fi

echo "webui.service tests passed"
