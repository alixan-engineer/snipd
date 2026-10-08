#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now snipd.service
rm -f "$HOME/.config/systemd/user/snipd.service" "$HOME/.local/bin/snipd"
rm -rf "$HOME/.local/lib/snipd"
systemctl --user daemon-reload
echo 'Config retained. Remove your snipd udev rule manually if no longer needed.'
