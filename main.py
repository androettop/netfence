import asyncio
import json
import os
import pwd
import subprocess

import decky

TABLE = "netfence"
NFT = "/usr/bin/nft"
SETTINGS = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")

# Loopback is never blocked (Decky's UI talks to its backend over localhost).
LOOP4 = ["127.0.0.0/8"]
LOOP6 = ["::1/128"]
LAN4 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
        "169.254.0.0/16", "224.0.0.0/4", "255.255.255.255/32"]
LAN6 = ["fe80::/10", "fc00::/7", "ff00::/8"]


def _env():
    # Decky's bundled Python sets LD_LIBRARY_PATH, which breaks system binaries.
    env = dict(os.environ)
    env.pop("LD_LIBRARY_PATH", None)
    env.pop("LD_PRELOAD", None)
    return env


def _run(args, input_=None):
    return subprocess.run(args, input=input_, capture_output=True, text=True, env=_env())


def _cgroup_rel():
    uid = pwd.getpwnam(decky.DECKY_USER or "deck").pw_uid
    # Steam (steam-launcher.service) and every game it launches
    # (app-steam-app<ID>-N.scope) live under app.slice.
    return f"user.slice/user-{uid}.slice/user@{uid}.service/app.slice"


def _cgroup_ino():
    try:
        return os.stat("/sys/fs/cgroup/" + _cgroup_rel()).st_ino
    except FileNotFoundError:
        return None


def _ruleset(block_lan, block_internet):
    cg = f'socket cgroupv2 level 4 "{_cgroup_rel()}"'
    rej = "reject with icmpx admin-prohibited"
    rules = []
    if block_lan:
        rules.append(f"{cg} ip daddr @lan4 {rej}")
        rules.append(f"{cg} ip6 daddr @lan6 {rej}")
    if block_internet:
        rules.append(f"{cg} ip daddr != @lan4 ip daddr != @loop4 {rej}")
        rules.append(f"{cg} ip6 daddr != @lan6 ip6 daddr != @loop6 {rej}")
    body = "\n        ".join(rules)
    return f"""
table inet {TABLE} {{
    set loop4 {{ type ipv4_addr; flags interval; elements = {{ {", ".join(LOOP4)} }} }}
    set loop6 {{ type ipv6_addr; flags interval; elements = {{ {", ".join(LOOP6)} }} }}
    set lan4 {{ type ipv4_addr; flags interval; elements = {{ {", ".join(LAN4)} }} }}
    set lan6 {{ type ipv6_addr; flags interval; elements = {{ {", ".join(LAN6)} }} }}
    chain output {{
        type filter hook output priority filter - 10; policy accept;
        {body}
    }}
}}
"""


def _table_exists():
    return _run([NFT, "list", "table", "inet", TABLE]).returncode == 0


def _remove_rules():
    if _table_exists():
        r = _run([NFT, "delete", "table", "inet", TABLE])
        if r.returncode != 0:
            decky.logger.error("nft delete failed: %s", r.stderr)


def _apply_rules(block_lan, block_internet):
    if not (block_lan or block_internet):
        _remove_rules()
        return
    _run(["/usr/bin/modprobe", "nft_socket"])
    script = (f"delete table inet {TABLE}\n" if _table_exists() else "") + _ruleset(block_lan, block_internet)
    r = _run([NFT, "-f", "-"], input_=script)
    if r.returncode != 0:
        decky.logger.error("nft apply failed: %s", r.stderr)
        raise RuntimeError(r.stderr.strip() or "nft failed")
    decky.logger.info("rules applied: block_lan=%s block_internet=%s", block_lan, block_internet)


class Plugin:
    def _load(self):
        try:
            with open(SETTINGS) as f:
                s = json.load(f)
        except Exception:
            s = {}
        return {"block_lan": bool(s.get("block_lan")),
                "block_internet": bool(s.get("block_internet"))}

    def _save(self):
        os.makedirs(os.path.dirname(SETTINGS), exist_ok=True)
        with open(SETTINGS, "w") as f:
            json.dump(self.settings, f)

    def _any(self):
        return self.settings["block_lan"] or self.settings["block_internet"]

    def _apply(self):
        _apply_rules(self.settings["block_lan"], self.settings["block_internet"])
        self.applied_ino = _cgroup_ino() if self._any() else None

    async def _watch(self):
        # Re-apply when the user's app.slice cgroup is (re)created, e.g. at boot
        # or after the user manager restarts (cgroup IDs change).
        while True:
            try:
                if self._any():
                    ino = _cgroup_ino()
                    if ino is not None and (ino != self.applied_ino or not _table_exists()):
                        self._apply()
            except Exception as e:
                decky.logger.error("watch: %s", e)
            await asyncio.sleep(1)

    async def _main(self):
        self.settings = self._load()
        self.applied_ino = None
        if not self._any():
            _remove_rules()
        self.watcher = asyncio.get_event_loop().create_task(self._watch())

    async def _unload(self):
        if getattr(self, "watcher", None):
            self.watcher.cancel()

    async def _uninstall(self):
        _remove_rules()

    async def get_status(self):
        return dict(self.settings)

    async def set_block(self, kind: str, value: bool):
        if kind not in ("block_lan", "block_internet"):
            raise ValueError(kind)
        self.settings[kind] = bool(value)
        self._save()
        self._apply()
        return dict(self.settings)
