#!/usr/bin/env python3
"""Publishes an extra name for this machine on the local network (mDNS / Bonjour), so phones can type  party.local  instead of an IP address.
iPhones and recent Android phones resolve .local names by themselves. Meant to run as a user service (tools/mirror-mdns.service). Name: first argument
(default party.local). It re-publishes when the machine's address changes."""

import socket
import sys
import dbus
from gi.repository import GLib
from dbus.mainloop.glib import DBusGMainLoop

NAME = sys.argv[1] if len(sys.argv) > 1 else "party.local"


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


DBusGMainLoop(set_as_default=True)
bus = dbus.SystemBus()
server = dbus.Interface(bus.get_object("org.freedesktop.Avahi", "/"), "org.freedesktop.Avahi.Server")
state = {"ip": None, "group": None}


def publish():
    ip = lan_ip()
    if ip and ip != state["ip"]:
        if state["group"] is not None:
            try:
                state["group"].Reset()
            except dbus.DBusException:
                pass
        g = dbus.Interface(
            bus.get_object("org.freedesktop.Avahi", server.EntryGroupNew()), "org.freedesktop.Avahi.EntryGroup"
        )
        g.AddAddress(
            -1, 0, dbus.UInt32(16), NAME, ip
        )  # any interface, IPv4; no reverse record (the machine already owns its address's reverse name)
        g.Commit()
        state["group"], state["ip"] = g, ip
        print(f"published {NAME} -> {ip}", flush=True)
    return True


publish()
GLib.timeout_add_seconds(60, publish)
GLib.MainLoop().run()
