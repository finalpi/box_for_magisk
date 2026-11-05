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
