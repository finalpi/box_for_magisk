#### Changelog v1.11.6 - 05-11-26
- Add visible tap animation and loading feedback to WebUI buttons
- List Android saved Wi-Fi networks for one-tap SSID rule selection
- Keep manual SSID entry and allow saved-network chips to be toggled
- Remove post-write content comparison from subscription, SSID and quick-setting saves

#### Changelog v1.11.5 - 05-11-26
- Avoid fully loading settings.ini before simple subscription and SSID writes
- Return verified subscription and SSID values from the same root command that writes them
- Reduce dedicated Clash/Mihomo subscription saving from three root calls to one
- Fix the false “subscription write verification failed” result after a successful write
- Replace only the target line without spawning a process for every settings.ini line

#### Changelog v1.11.4 - 05-11-26
- Add a dedicated Clash/Mihomo subscription save action with write-after-read verification
- Keep Clash subscriptions isolated from other core configurations
- Add module network-state controls and editable SSID blacklist/whitelist settings
- Verify all quick settings and SSID values after writing settings.ini
- Make “Save and apply” the primary action and keep “Save only” explicit

#### Changelog v1.11.3 - 05-11-26
- Render local service status and current kernel version before network requests
- Run latest-version and latency checks through the asynchronous KernelSU process bridge
- Cache the latest stable Mihomo version for instant display on later visits
- Delay background network checks until after the first WebUI frame

#### Changelog v1.11.2 - 05-11-26
- Fix latest Mihomo version lookup on Android without storing the large GitHub response in an argument
- Show the exact settings.ini subscription source and add a manual reload action
- Stop production WebUI from silently falling back to demo subscription data
- Add a bottom Mihomo tab with an embedded dashboard and an external fallback
- Bust cached WebUI assets after module upgrades

#### Changelog v1.11.1 - 05-11-26
- Add live download and upload speed monitoring with a one-minute trend chart
- Add HTTPS access latency checks for Baidu, Google and YouTube
- Show the installed and latest stable Mihomo versions in the WebUI
- Add one-tap Mihomo kernel update with live progress output
- Use the official latest stable Mihomo release endpoint for kernel updates

#### Changelog v1.11.0 - 05-11-26
- Add a mobile-first module WebUI for service status and controls
- Add quick settings for core, network mode, IPv6, subscription and cron options
- Add subscription update, raw configuration viewer and runtime log viewer
- Publish a verified flashable ZIP and SHA-256 checksum from GitHub Actions

#### Changelog v1.10.2 - 05-09-25
- fix(scripts): use `/system/bin/sh` and add `curl` timeout options in box.tool
- fix: escape special characters in restore_ini sed replacement
- box.tool(subs): extend protocol detection & clarify error log
- feat: support Base64 subscription(clash/momo) file in box.tool
- refactor(settings): move GID list to separate gid.list.cfg
- Add restore and apply settings.ini functionality
- box: switch sing-box to single config file

#### Changelog v1.10.1 - 23-08-25
- fix: Improve SSID retrieval accuracy during network switching (network control)
