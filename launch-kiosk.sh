#!/bin/bash
LOG=/tmp/mirror-launch.log
echo "$(date '+%F %T') launcher started" > "$LOG"
export DISPLAY=:0
[ -s "$HOME/.config/mirror/tz" ] && export TZ="$(cat "$HOME/.config/mirror/tz")"   # the time zone is a setting (a PC on UTC would otherwise show the wrong clock and game times)
for i in $(seq 1 60); do xset q >/dev/null 2>&1 && break; sleep 1; done
echo "$(date '+%T') display ready after ${i}s" >> "$LOG"
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:8765/index.html && break; sleep 1; done
echo "$(date '+%T') proxy ready after ${i}s" >> "$LOG"
exec google-chrome --no-sandbox --ozone-platform=x11 --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check --password-store=basic --disk-cache-dir=/dev/null --user-data-dir=/tmp/chrome-mirror-profile --kiosk http://127.0.0.1:8765/index.html
