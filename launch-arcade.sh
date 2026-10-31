#!/bin/bash
# Retro Arcade channel: run ES-DE (EmulationStation) full screen at the mirror's portrait resolution, then bring the
# dashboard back when it quits. Started by proxy.py (POST /launch/arcade or /launch/pinball).
#   launch-arcade.sh            opens on the system screen (NES, GBA, Arcade...)
#   launch-arcade.sh pinball    opens straight in the Pinball (Visual Pinball X) list
# NOTE: never edit this file in place while it is running (bash reads scripts by offset); replace it with mv.
export DISPLAY=:0
[ -s "$HOME/.config/mirror/tz" ] && export TZ="$(cat "$HOME/.config/mirror/tz")"   # the time zone is a setting (Settings > phone setup)
[ -z "$XAUTHORITY" ] && [ -f "$HOME/.Xauthority" ] && export XAUTHORITY="$HOME/.Xauthority"
LOG=/tmp/mirror-arcade.log
# one ES-DE at a time: a second launch just brings the running one to the front
exec 9>/tmp/mirror-arcade.lock
if ! flock -n 9; then
  echo "$(date '+%F %T') already running, raising it" >> "$LOG"
  xdotool search --class ES-DE windowactivate >/dev/null 2>&1
  exit 0
fi
echo "$(date '+%F %T') launching ES-DE ${1:-arcade}" >> "$LOG"
python3 -I "$(dirname "$(readlink -f "$0")")/tools/es_collections.py" "$1" >> "$LOG" 2>&1   # collections + start page
# controller escape hatch: hold the Xbox button to go home, Back+Start to leave a pinball table (ends when ES-DE does)
setsid python3 -I "$(dirname "$(readlink -f "$0")")/tools/pad_quit.py" >> "$LOG" 2>&1 &
"$HOME/Applications/ES-DE/squashfs-root/AppRun" --resolution 1080 1920 >> "$LOG" 2>&1
echo "$(date '+%F %T') ES-DE exited ($?)" >> "$LOG"
# back to the dashboard
xdotool search --class google-chrome windowactivate >/dev/null 2>&1
exit 0
