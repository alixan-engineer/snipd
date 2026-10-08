# snipd

Small local text expander for Linux GNOME / Wayland. TypeScript (Node.js native type stripping), JSON configuration, user systemd service, and a small Linux C transport. MIT. No npm runtime dependencies, no Electron, no network requests, no typed-text logging.

**Status: experimental implementation, not a claim of compatibility with every application.** Unit tests and native compilation have been verified; a physical GNOME/Wayland session has not. Use a scratch text document for the first run.

Ubuntu LTS in the 26 series is **26.04**, not 26.01. Runtime prerequisites: Linux evdev/uinput, Node **24.12+**, GCC, GNOME's `org.gnome.ScreenSaver`, `gdbus`, `dbus-monitor`; `wl-copy` for optional clipboard mode. No dependency on a particular GNOME micro-version.

## How it works

One explicitly selected physical keyboard is exclusively grabbed by the helper. Every key event goes to the TypeScript engine and is forwarded through one virtual keyboard. The helper waits for the engine's bounded reply before reading the next event. When `:name` completes and all held keys are released, it forwards the last release, sends five Backspaces and types `Alikhan`. Events arriving during replacement stay queued in evdev, so physical input is ordered behind the replacement. Kernel queue overflow aborts instead of expanding from corrupt state.

The helper has no socket, no shell execution, no root privileges and no access to configuration. It accepts only bounded keyboard events over its private parent pipes. If the parent crashes, its pipe closes; if a reply stalls for two seconds, it releases the grab. SIGTERM releases it as well. systemd kills the entire process group on stop.

## Install

1. Install prerequisites and verify Node version (install a supported Node separately if your distro package is older):

```bash
sudo apt install build-essential libglib2.0-bin dbus wl-clipboard acl
node --version
npm test
bash scripts/install.sh
```

The installer copies the program into `~/.local/lib/snipd`, creates `~/.local/bin/snipd`, initializes JSON without overwriting existing settings and enables the service for future graphical logins. It deliberately does not start until permissions and configuration are ready. Add `~/.local/bin` to PATH if necessary. Keep your keyboard released and Caps Lock off before starting.

2. Find the **single keyboard** you want to use:

```bash
ls -l /dev/input/by-id/*-event-kbd
udevadm info --query=property --name=/dev/input/by-id/YOUR_KEYBOARD-event-kbd
```

Set `device` to its full stable symlink in `~/.config/snipd/config.json`. Internal keyboards without a by-id symlink are not supported in this initial version; do not substitute an arbitrary event number. Other keyboards continue to work normally but do not expand text.

3. Grant access to that keyboard and uinput. Do not add yourself to the broad `input` group and do not use world-writable devices. Create `/etc/udev/rules.d/70-snipd.rules` with a text editor using sudo. Replace the placeholder with the actual `ID_SERIAL` shown by `udevadm`:

```udev
SUBSYSTEM=="input", KERNEL=="event*", ENV{ID_INPUT_KEYBOARD}=="1", ENV{ID_SERIAL}=="EXACT_KEYBOARD_ID_SERIAL", TAG+="uaccess"
SUBSYSTEM=="misc", KERNEL=="uinput", TAG+="uaccess"
```

If your keyboard has no `ID_SERIAL`, stop and choose a unique device-specific match using `udevadm info --attribute-walk`; do not remove the identifying condition. The rule must sort before `73-seat-late.rules` so the active-seat ACL is applied. This grants the active local desktop user low-level access, not only snipd: other processes under your account can also access these devices.

```bash
sudo modprobe uinput
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=input
sudo udevadm trigger --subsystem-match=misc
sudo udevadm settle
getfacl /dev/uinput /dev/input/by-id/YOUR_KEYBOARD-event-kbd
```

For persistent module loading create `/etc/modules-load.d/snipd.conf` containing `uinput`. Log out/in or reconnect the keyboard if the ACL has not appeared. Verify your user can read the chosen keyboard and write `/dev/uinput`; Node and the helper must run **without sudo**.

4. Start:

```bash
snipd check
snipd start
snipd status
journalctl --user -u snipd.service -n 40
```

In an empty text document, with **English US layout and Caps Lock off**, type `:name`. It expands immediately after release of the final key. **F12** toggles expansion for the current process (the key still reaches the application). Navigation keys, Ctrl/Alt/Super shortcuts, unsupported keys and a configurable idle timeout reset partial triggers. Backspace edits them.

## JSON

```json
{
  "enabled": true,
  "device": "/dev/input/by-id/YOUR_KEYBOARD-event-kbd",
  "mode": "keys",
  "paste": "ctrl-v",
  "idleMs": 1500,
  "matches": {
    ":name": "Alikhan",
    ":surname": "Zhumazhanov",
    ":mail": "example@gmail.com"
  }
}
```

Config changes are watched, including atomic editor saves. Invalid changes retain the last valid settings and produce a generic error without dumping JSON. Changing the device requests a service restart. Trigger format is `:[a-z][a-z0-9_]*`, up to 65 characters; max 500 matches, replacements up to 512 UTF-16 code units. Instant triggers must not be prefixes of other triggers (`:mail` and `:mailwork` are rejected). There are no commands, template execution, or dynamic variables in v0.1.

- `mode: "keys"`: printable ASCII replacement through physical US keystrokes. Does not change the clipboard. No newlines or Unicode. **Both triggers and output require the active English US layout.** Caps Lock on pauses matching.
- `mode: "clipboard"`: Unicode and multiline replacement using `wl-copy` and Ctrl+V. **Triggers still require English US layout.** Set `paste: "ctrl-shift-v"` if primarily using terminals. One paste chord applies globally; automatic terminal detection is not implemented. Clipboard mode overwrites the clipboard; it does not preserve its old contents. `--paste-once` limits serving, but clipboard managers and applications may read or retain the text. Some XWayland clients may request clipboard data more than once and fail with paste-once.
- `enabled: false`: stops the helper, returning to the physical keyboard directly. Re-enable through JSON. F12 pauses expansion but leaves forwarding enabled; it does not remove access to input events.

## Security and compatibility boundaries

The program refuses to run as root. During a GNOME lock it terminates the helper. It subscribes to lock signals and reconciles GetActive every second; unknown lock state disables the helper. This is a best-effort session guard, **not** a secure-input boundary: signals may race input, and permission revocation does not close an already open evdev descriptor. Device read access can expose passwords. Password fields, browser incognito mode and sensitive applications cannot be detected with evdev. **Stop the service before entering secrets if this matters to your threat model. Do not store passwords in this config.** There is no network code or text logging.

The implementation does not read compositor XKB state, IME state, focus or pointer events. A click between partial trigger characters may move focus without clearing the buffer; press Escape first or wait `idleMs`. Autocorrect, application key handling, games, raw terminal modes, remote sessions, layouts, focus changes and clipboard restrictions can prevent or alter expansion. A Backspace-based expander cannot guarantee insertion in every app. Rapid focus changes during replacement remain a limitation. No automatic Russian/Kazakh layout recognition, password exclusion, multi-keyboard merging, or hot-unplug recovery beyond systemd restart is claimed.

The virtual keyboard forwards key events, not all hardware-specific events or LED feedback. Hardware media features or composite keyboard mouse events may require a separate device. A helper crash releases virtual keys; when restarting, release all physical keys to avoid mismatched modifier states. The C helper's two-second deadline is a fail-safe and may abort under heavy system load. Repeated failures are rate-limited by systemd; after fixing them use `systemctl --user reset-failed snipd` and `snipd start`.

## Commands

```bash
snipd config       # print JSON path
snipd check        # validate JSON without opening input devices
snipd start
snipd stop
snipd restart
snipd status
snipd run          # foreground; stop service first to avoid competing grabs
```

To remove the installation: `bash scripts/uninstall.sh`. Config is retained. Remove `/etc/udev/rules.d/70-snipd.rules` and `/etc/modules-load.d/snipd.conf` yourself if no longer needed, reload rules and log out. Never run either script as root.

## Development and validation

Node 24 executes these erasable TypeScript sources directly, without transpilation. `npm test` tests the engine and schema, not the OS integration. `npm run build:native` compiles the helper with warnings as errors. `bash -n scripts/*.sh` checks scripts.

Before daily use, manually check: Chrome, Firefox, VS Code, Telegram, terminal (both paste modes as appropriate), fast typing immediately after trigger, Backspace, Caps Lock, layout switching, click during partial trigger, screen lock/unlock, JSON save/invalid JSON, keyboard unplug, parent kill and service stop while a modifier is held. These hardware tests have **not** been run by the authoring environment. The source is ready to publish to GitHub, but this release should be labeled experimental until those checks pass on the target machine.

## References

- Linux uinput: https://docs.kernel.org/input/uinput.html
- wl-clipboard: https://github.com/bugaevc/wl-clipboard
- systemd active-seat access: https://github.com/systemd/systemd/blob/main/src/udev/udev-builtin-uaccess.c
- Ubuntu releases: https://ubuntu.com/project/docs/release-team/list-of-releases/
