#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -ne 0 ]] || { echo 'Run as your desktop user, without sudo.' >&2; exit 1; }
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_dir="$HOME/.local/lib/snipd"
[[ "$install_dir" != *' '* && "$install_dir" != *'%'* && "$install_dir" != *'"'* && "$install_dir" != *'\\'* ]] || { echo 'Unsupported HOME path'; exit 1; }
node -e 'if (+process.versions.node.split(".")[0]<24) process.exit(1)'
cc -std=c11 -O2 -Wall -Wextra -Werror "$project_dir/native/input.c" -o "$project_dir/native/snipd-input"
mkdir -p "$install_dir/src" "$install_dir/native" "$install_dir/examples" "$HOME/.local/bin" "$HOME/.config/systemd/user"
cp "$project_dir"/src/*.ts "$install_dir/src/"
cp "$project_dir/native/snipd-input" "$install_dir/native/"
cp "$project_dir/examples/config.json" "$install_dir/examples/"
cp "$project_dir/package.json" "$install_dir/"
node_path="$(command -v node)"
printf '#!/usr/bin/env bash\nexec %q %q "$@"\n' "$node_path" "$install_dir/src/cli.ts" > "$HOME/.local/bin/snipd"
chmod 755 "$HOME/.local/bin/snipd"
node "$install_dir/src/cli.ts" init
cat > "$HOME/.config/systemd/user/snipd.service" <<UNIT
[Unit]
Description=snipd local text expansion
PartOf=graphical-session.target
After=graphical-session.target
StartLimitIntervalSec=60
StartLimitBurst=3
[Service]
Type=simple
ExecStart="$node_path" "$install_dir/src/cli.ts" run
Restart=on-failure
RestartSec=5
TimeoutStopSec=3
KillMode=control-group
UMask=0077
NoNewPrivileges=yes
RestrictAddressFamilies=AF_UNIX
LockPersonality=yes
RestrictRealtime=yes
[Install]
WantedBy=graphical-session.target
UNIT
systemctl --user daemon-reload
systemctl --user enable snipd.service
printf 'Installed. Configure device permissions and config.json before running snipd start.\n'
