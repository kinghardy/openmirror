#!/bin/bash
# YouTube Shorts channel: YouTube's vertical Shorts feed (mobile site, so it fills the portrait screen like Reels) in its own full-screen Chrome
# window, with its own saved profile (~/.config/mirror/yt-profile). Started by proxy.py (POST /launch/youtube); the controller is turned into keys by tools/pad_quit.py,
# which this starts. Hold the Xbox button to go home, tap it for the Xbox menu.
# NOTE: never edit this file in place while it is running (bash reads scripts by offset); replace it with mv.
export DISPLAY=:0
[ -s "$HOME/.config/mirror/tz" ] && export TZ="$(cat "$HOME/.config/mirror/tz")"   # the time zone is a setting (Settings > phone setup)
[ -z "$XAUTHORITY" ] && [ -f "$HOME/.Xauthority" ] && export XAUTHORITY="$HOME/.Xauthority"
LOG=/tmp/mirror-youtube.log
exec 9>/tmp/mirror-youtube.lock
if ! flock -n 9; then
  echo "$(date '+%F %T') already running, raising it" >> "$LOG"
  xdotool search --class MirrorYouTube windowactivate >/dev/null 2>&1
  exit 0
fi
echo "$(date '+%F %T') launching YouTube Shorts" >> "$LOG"
UA="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
mkdir -p "$HOME/.config/mirror/yt-profile"
# controller -> keys (and the Xbox menu / hold-for-home) while YouTube is up
setsid python3 -I "$(dirname "$(readlink -f "$0")")/tools/pad_quit.py" >> "$LOG" 2>&1 &
google-chrome --class=MirrorYouTube --user-data-dir="$HOME/.config/mirror/yt-profile" --user-agent="$UA" \
  --kiosk --no-first-run --no-default-browser-check --password-store=basic --no-sandbox --ozone-platform=x11 \
  --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1.4 --disable-features=Translate \
  "https://m.youtube.com/shorts" >> "$LOG" 2>&1 &
CH=$!
for i in $(seq 1 40); do xdotool search --class MirrorYouTube windowactivate >/dev/null 2>&1 && break; sleep 0.5; done
wait $CH
echo "$(date '+%F %T') YouTube exited ($?)" >> "$LOG"
xdotool search --name "Wii Mirror Menu" windowactivate >/dev/null 2>&1
exit 0
