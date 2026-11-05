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
  if [ "${TEST_SUBS_MODE:-0}" = 1 ] && [ "$1" = pidof ]; then echo 123; return; fi
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

first_ssid="Home WiFi"
second_ssid='Cafe $Guest'
encoded_ssids="$(printf '%s' "${first_ssid}" | base64 -w0),$(printf '%s' "${second_ssid}" | base64 -w0)"
bash "${control}" set-ssids "${encoded_ssids}" >/dev/null
bash -n "${test_dir}/settings.ini"
saved_ssids="$(BOX_DIR="${test_dir}" BOX_SHELL="/usr/bin/bash" bash "${control}" settings | grep '^wifi_ssids=' | cut -d= -f2- | base64 -d)"
[[ "${saved_ssids}" == "${first_ssid}"$'\n'"${second_ssid}" ]]

if bash "${control}" set bin_name aW52YWxpZA== >/dev/null 2>&1; then
  echo "invalid core was accepted" >&2
  exit 1
fi

kernel_output="$(MIHOMO_RELEASE_JSON='{"tag_name":"v9.9.9"}' bash "${control}" kernel-info)"
latest_kernel="$(grep '^latest=' <<<"${kernel_output}" | cut -d= -f2- | base64 -d)"
[[ "${latest_kernel}" == "v9.9.9" ]]

wifi_output=$'Network Id SSID Security type\n0            Home WiFi                        WPA2_PSK\n1            Cafe Guest                       WPA3_SAE\n2            Home WiFi                        WPA2_PSK'
saved_wifi_output="$(SAVED_WIFI_OUTPUT="${wifi_output}" bash "${control}" saved-ssids | grep '^saved_ssids=' | cut -d= -f2- | base64 -d)"
[[ "${saved_wifi_output}" == $'Home WiFi\nCafe Guest' ]]

mkdir -p "${test_dir}/bin" "${test_dir}/clash"
for name in curl clash; do
  cp "${repo_dir}/tests/subscription-command-fixture.sh" "${test_dir}/bin/${name}"
done
cp "${repo_dir}/tests/subscription-command-fixture.sh" "${test_dir}/scripts/box.service"
chmod +x "${test_dir}/bin/"* "${test_dir}/scripts/box.service"
export PATH="${test_dir}/bin:${PATH}"
export TEST_SUBS_MODE=1
bash "${control}" set-subscriptions "$(printf '%s' "${first_url}" | base64 -w0)" >/dev/null
# Manual updates work with one URL, two legacy provider filenames and cron updates disabled.
printf 'mode: direct\n' > "${test_dir}/clash/config.yaml"
bash "${control}" subscription >/dev/null
grep -q 'downloaded fixture' "${test_dir}/clash/config.yaml"
for failure in TEST_DOWNLOAD_FAIL TEST_CONFIG_FAIL TEST_RESTART_FAIL; do
  printf 'mode: direct\n# original\n' > "${test_dir}/clash/config.yaml"
  if env "${failure}=1" bash "${control}" subscription >/dev/null 2>&1; then
    echo "${failure} incorrectly reported success" >&2; exit 1
  fi
  grep -q '# original' "${test_dir}/clash/config.yaml"
  test ! -d "${test_dir}/run/subscription-update.lock"
done
echo "webui.service tests passed (including subscription success and rollback cases)"
