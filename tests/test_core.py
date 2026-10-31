"""Unit tests that need no hardware (no speaker, no Home Assistant, no network): they run in CI and on any machine.
    python3 -m unittest discover -s tests -v
The settings directory is a throw-away folder, so these never touch a real mirror's keys."""
import base64, json, os, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["OPENMIRROR_CONFIG"] = TMP = tempfile.mkdtemp(prefix="openmirror-test-")          # must be set before the modules are imported
for k in [k for k in os.environ if k.startswith("OPENMIRROR_") and k != "OPENMIRROR_CONFIG"]: os.environ.pop(k)

import mirror_channels as CH
import mirror_pairing as PAIR
import mirror_settings as SET
import mirror_themes as TH


def fresh():
    for f in os.listdir(TMP):
        try: os.remove(os.path.join(TMP, f))
        except OSError: pass


class Pairing(unittest.TestCase):
    def setUp(self): PAIR.cancel()

    def test_code_is_six_digits_and_single_use(self):
        c = PAIR.new_code()["code"]; self.assertRegex(c, r"^\d{6}$")
        tok = PAIR.verify(c, "10.0.0.1"); self.assertTrue(PAIR.check(tok))
        with self.assertRaises(ValueError): PAIR.verify(c, "10.0.0.1")                      # a used code is gone

    def test_wrong_guesses_lock_it(self):
        c = PAIR.new_code()["code"]; wrong = "000000" if c != "000000" else "111111"
        for _ in range(PAIR.MAX_FAILS):
            with self.assertRaises(ValueError): PAIR.verify(wrong, "10.0.0.2")
        with self.assertRaises(ValueError): PAIR.verify(c, "10.0.0.2")                      # even the right code is refused now
        self.assertEqual(PAIR.status()["code"], None)

    def test_new_code_resets_and_cancel_ends_sessions(self):
        tok = PAIR.verify(PAIR.new_code()["code"], "10.0.0.3"); PAIR.cancel()
        self.assertFalse(PAIR.check(tok)); self.assertFalse(PAIR.check("")); self.assertFalse(PAIR.check("made-up"))

    def test_without_a_code_nothing_works(self):
        with self.assertRaises(ValueError): PAIR.verify("123456", "10.0.0.4")


class Settings(unittest.TestCase):
    def setUp(self): fresh()

    def test_secret_is_masked_and_private(self):
        SET.set_value("tmdb_key", "FAKE-test-value-0000")
        row = [x for x in SET.view() if x["key"] == "tmdb_key"][0]
        self.assertTrue(row["set"]); self.assertEqual(row["value"], ""); self.assertTrue(row["masked"].endswith("0000")); self.assertNotIn("FAKE-test-value", json.dumps(SET.view()))
        self.assertEqual(os.stat(os.path.join(TMP, "tmdb_key")).st_mode & 0o777, 0o600)

    def test_game_names_default_and_can_be_renamed(self):
        self.assertEqual(SET.get("games_name"), "Hardy Party Games"); self.assertEqual(SET.get("slots_name"), "King Hardy Slots")
        SET.set_value("games_name", "Casa Games"); SET.set_value("slots_name", "Lucky Slots"); self.assertEqual((SET.get("games_name"), SET.get("slots_name")), ("Casa Games", "Lucky Slots"))

    def test_clear_and_defaults(self):
        SET.set_value("house_name", "Casa"); self.assertEqual(SET.get("house_name"), "Casa"); SET.clear("house_name"); self.assertEqual(SET.get("house_name"), "Host")

    def test_environment_wins(self):
        SET.set_value("house_name", "FromFile"); os.environ["OPENMIRROR_HOUSE_NAME"] = "FromEnv"
        try: self.assertEqual(SET.get("house_name"), "FromEnv"); self.assertEqual(SET.source("house_name"), "environment")
        finally: os.environ.pop("OPENMIRROR_HOUSE_NAME")

    def test_bad_values_are_refused(self):
        for key, bad in (("games_name", "<script>alert(1)</script>"), ("slots_name", "x"), ("ha_url", "javascript:alert(1)"), ("ha_url", "http://a b"), ("sonos_ip", "not-an-ip"), ("tz", "Not/AZone"), ("house_name", "x"), ("units", "furlongs"), ("nope", "x")):
            with self.assertRaises(ValueError, msg=f"{key}={bad}"): SET.set_value(key, bad)
        with self.assertRaises(ValueError): SET.set_location("Nowhere", 999, 0)
        with self.assertRaises(ValueError): SET.set_location("", 10, 10)

    def test_location_roundtrip_and_sensitivity(self):
        self.assertIsNone(SET.location()); SET.set_location("Springfield, IL", 39.8, -89.65); self.assertEqual(SET.location()["name"], "Springfield, IL")
        self.assertTrue(SET.needs_secure("ha_url") and SET.needs_secure("ha_token") and not SET.needs_secure("house_name"))

    def test_first_run_and_existing_install(self):
        self.assertTrue(SET.first_run()); SET.mark_setup_done(); self.assertFalse(SET.first_run())
        fresh(); self.assertFalse(SET.freeze_existing_setup()); SET.set_value("tmdb_key", "FAKE-test-value-0000"); self.assertTrue(SET.freeze_existing_setup()); self.assertFalse(SET.first_run())


class Channels(unittest.TestCase):
    def setUp(self): fresh()
    @staticmethod
    def write(path, obj):
        with open(path, "w") as f: json.dump(obj, f)

    def test_manifests_load_with_known_permissions(self):
        man = CH.load_manifests(); self.assertIn("system", man); self.assertTrue(all(p in CH.PERMISSIONS or p.startswith("network:") for m in man.values() for p in m["permissions"]))

    def test_unknown_or_mismatched_manifests_are_not_loaded(self):
        old, tmp = CH.CHANNELS_DIR, tempfile.mkdtemp()
        try:
            for cid, perms in (("good", ["controller"]), ("bad", ["root_access"]), ("badnet", ["network:evil"]), ("net", ["network:api.example.com"])):
                os.makedirs(os.path.join(tmp, cid)); self.write(os.path.join(tmp, cid, "channel.json"), {"id": cid, "name": cid, "permissions": perms})
            os.makedirs(os.path.join(tmp, "mismatch")); self.write(os.path.join(tmp, "mismatch", "channel.json"), {"id": "other", "name": "x", "permissions": []})
            CH.CHANNELS_DIR = tmp; self.assertEqual(set(CH.load_manifests()), {"good", "net"})
        finally: CH.CHANNELS_DIR = old

    def test_required_channel_cannot_be_hidden_and_actions_validate(self):
        with self.assertRaises(ValueError): CH.act("hide", "system")
        with self.assertRaises(ValueError): CH.act("hide", "nope")
        with self.assertRaises(ValueError): CH.act("explode", "pool")
        ids = [c["id"] for c in CH.act("hide", "tv")]; self.assertNotIn("tv", [c["id"] for c in CH.effective(False)]); self.assertIn("tv", ids)
        CH.act("reset"); self.assertIn("tv", [c["id"] for c in CH.effective(False)])

    def test_rename_strips_markup(self):
        name = [c for c in CH.act("rename", "pool", "A <b>x</b>\x07") if c["id"] == "pool"][0]["name"]; self.assertNotIn("<", name); self.assertNotIn("\x07", name)
        self.assertEqual([c for c in CH.act("rename", "pool", "") if c["id"] == "pool"][0]["name"], [c for c in CH.effective() if c["id"] == "pool"][0]["default_name"])

    def test_clean_install_gets_the_generic_home_screen(self):
        import html, re
        with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f: raw = f.read()
        tile = re.compile(r'<div class="channel-tile" data-app="(\w+)">\s*<div class="channel-icon">(.*?)</div>\s*<div class="channel-title">(.*?)</div>\s*<div class="channel-subtitle"(?: id="([\w-]+)")?>(.*?)</div>\s*</div>', re.S)
        norm = lambda t: [(a, html.unescape(b).strip(), html.unescape(c), d, html.unescape(e)) for a, b, c, d, e in tile.findall(t)]
        self.assertEqual(norm(CH.render_index(raw)), norm(raw))

    def test_the_film_entry_only_appears_when_the_film_exists(self):
        with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f: raw = f.read()
        old = CH.has_promo
        try:
            CH.has_promo = lambda: False; self.assertNotIn("promo.html", CH.render_index(raw)); self.assertIn("Replay Intro", CH.render_index(raw))
            CH.has_promo = lambda: True; self.assertIn("promo.html", CH.render_index(raw))
        finally: CH.has_promo = old

    def test_freeze_keeps_an_existing_install_unchanged(self):
        SET.set_value("tmdb_key", "FAKE-test-value-0000"); self.assertTrue(CH.freeze_existing()); cfg = CH.user_config(); self.assertEqual(cfg["hidden"], []); self.assertGreaterEqual(len(cfg["order"]), 11)


class Themes(unittest.TestCase):
    def setUp(self): fresh()

    def test_listing_and_default(self):
        d = TH.theme_list(); ids = {t["id"] for t in d["themes"]}; self.assertTrue({"wii", "halloween"} <= ids); self.assertEqual(d["mode"], "auto")

    def test_unknown_theme_is_refused_and_files_are_contained(self):
        with self.assertRaises(ValueError): TH.theme_set("../../etc")
        for bad in ("/themes/../proxy.py", "/themes/halloween/../../proxy.py", "/themes/halloween/theme.py", "/themes/halloween/../theme.json", "/themes/nope/theme.css", "/themes/halloween/.env"):
            self.assertIsNone(TH.theme_file(bad), bad)
        self.assertIsNotNone(TH.theme_file("/themes/halloween/theme.css"))


class Network(unittest.TestCase):
    def test_nmcli_escaping(self):
        import mirror_network as N
        self.assertEqual(N._split(r"yes:My\:Network:71:WPA2"), ["yes", "My:Network", "71", "WPA2"])

    def test_bad_wifi_input_is_refused_before_anything_runs(self):
        import mirror_network as N
        if N.available():
            self.assertFalse(N.wifi_connect("", "")[0]); self.assertFalse(N.wifi_connect("x" * 40, "")[0]); self.assertFalse(N.wifi_connect("net", "short")[0])


class Push(unittest.TestCase):
    def test_message_decrypts_with_an_independent_receiver(self):
        """encrypt (RFC 8291) and decrypt here with the receiver-side steps written separately"""
        import mirror_push as P
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
        ua = ec.generate_private_key(ec.SECP256R1()); ua_pub = ua.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        auth = os.urandom(16); b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
        body = P.encrypt(b"hello from the mirror", b64(ua_pub), b64(auth))
        salt, rs, idlen = body[:16], int.from_bytes(body[16:20], "big"), body[20]; as_pub, ct = body[21:21 + idlen], body[21 + idlen:]
        self.assertEqual(rs, 4096)
        secret = ua.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
        ikm = HKDF(hashes.SHA256(), 32, auth, b"WebPush: info\x00" + ua_pub + as_pub).derive(secret)
        cek = HKDF(hashes.SHA256(), 16, salt, b"Content-Encoding: aes128gcm\x00").derive(ikm); nonce = HKDF(hashes.SHA256(), 12, salt, b"Content-Encoding: nonce\x00").derive(ikm)
        plain = AESGCM(cek).decrypt(nonce, ct, None); self.assertEqual(plain, b"hello from the mirror\x02")


if __name__ == "__main__":
    unittest.main()
