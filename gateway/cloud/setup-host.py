"""Executed by cloud-init on a NEW Ubuntu 24.04 VPS, as root."""
import json
import ipaddress
import os
from pathlib import Path
import shutil
import subprocess


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def private_file(path, content):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with target.open("x", encoding="utf-8") as file:
        os.chmod(target, 0o600)
        file.write(content)


def oracle_rules(original, admin_cidr):
    """Keep the image's essential storage/metadata rules and other tables intact."""
    network = ipaddress.ip_network(admin_cidr, strict=True)
    if network.version != 4 or network.prefixlen != 32:
        raise ValueError("SSH exige um endereço IPv4 /32.")
    lines = original.splitlines(keepends=True)
    if original.count("*filter\n") != 1 or "IMPERIUM-IN" in original:
        raise ValueError("Regras ausentes ou já alteradas; revisar manualmente.")
    start = lines.index("*filter\n")
    end = next(i for i in range(start + 1, len(lines)) if lines[i].strip() == "COMMIT")
    if not any(line.startswith(":INPUT ") for line in lines[start:end]):
        raise ValueError("Cadeia INPUT ausente.")
    first_rule = next((i for i in range(start + 1, end) if lines[i].startswith("-A ")), end)
    own_rules = [
        ":IMPERIUM-IN - [0:0]\n",
        "-A INPUT -j IMPERIUM-IN\n",
        "-A IMPERIUM-IN -i lo -j RETURN\n",
        "-A IMPERIUM-IN -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN\n",
        f"-A IMPERIUM-IN -p tcp -s {network} --dport 22 -j ACCEPT\n",
        "-A IMPERIUM-IN -p tcp --dport 22 -j DROP\n",
        "-A IMPERIUM-IN -p udp --dport 51820 -j ACCEPT\n",
        "-A IMPERIUM-IN -p tcp --dport 8765 -j DROP\n",
        "-A IMPERIUM-IN -j RETURN\n",
    ]
    return "".join(lines[:first_rule] + own_rules + lines[first_rule:])


def configure_firewall(settings):
    if settings.get("provider") != "oracle":
        run("ufw", "default", "deny", "incoming")
        run("ufw", "default", "allow", "outgoing")
        run("ufw", "allow", "from", settings["admin_cidr"], "to", "any", "port", "22", "proto", "tcp")
        run("ufw", "allow", "51820/udp")
        run("ufw", "--force", "enable")
        return
    # OCI warns against UFW: it may remove boot-volume/iSCSI rules.
    # Inspect an official image's persistent rules instead of flushing tables.
    rules_file = Path("/etc/iptables/rules.v4")
    original = rules_file.read_text(encoding="utf-8")
    updated = oracle_rules(original, settings["admin_cidr"])
    if not Path("/etc/systemd/system/multi-user.target.wants/netfilter-persistent.service").exists():
        run("systemctl", "is-enabled", "netfilter-persistent")
    if shutil.which("ufw") and subprocess.run(["ufw", "status"], capture_output=True, text=True).stdout.startswith("Status: active"):
        raise RuntimeError("UFW ativo: revisar firewall OCI antes de prosseguir.")
    run("iptables-restore", "--test", input=updated, text=True)
    private_file("/etc/imperium/oracle-rules.original.private.conf", original)
    private_file("/etc/imperium/oracle-rules.runtime.private.conf",
                 subprocess.check_output(["iptables-save"], text=True))
    rules_file.write_text(updated, encoding="utf-8")
    os.chmod(rules_file, 0o600)
    run("iptables-restore", input=updated, text=True)
    # This is a fresh host with no containers. Recreate Docker's runtime chains.
    run("systemctl", "restart", "docker")


def main():
    if os.geteuid() != 0:
        raise RuntimeError("Execute somente na VPS, como root.")
    os.umask(0o077)
    release = Path("/etc/os-release").read_text()
    if 'ID=ubuntu' not in release or 'VERSION_ID="24.04"' not in release:
        raise RuntimeError("Este perfil exige uma VPS nova com Ubuntu 24.04.")
    settings = json.loads(Path("/etc/imperium/bootstrap.json").read_text())
    repo = Path("/opt/imperium/controle-acesso")
    if repo.exists():
        raise RuntimeError("Diretório existente: interrompido para preservar a instalação.")
    repo.parent.mkdir(parents=True, exist_ok=True)
    run("git", "clone", "--no-checkout", "https://github.com/horizes/controle-acesso.git", str(repo))
    run("git", "-C", str(repo), "checkout", "--detach", settings["revision"])
    run("sshd", "-t")
    run("systemctl", "reload", "ssh")
    configure_firewall(settings)
    vpn = Path("/etc/wireguard")
    vpn.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = subprocess.check_output(["wg", "genkey"], text=True).strip()
    pub = subprocess.check_output(["wg", "pubkey"], input=key + "\n", text=True).strip()
    private_file(vpn / "imperium.key", key + "\n")
    private_file(vpn / "imperium.pub", pub + "\n")
    # No peer is invented and no tunnel is enabled before the router is known.
    private_file(vpn / "wg-imperium.conf", "[Interface]\nAddress = 10.200.0.1/32\nListenPort = 51820\nPrivateKey = " + key + "\n")
    private_file("/etc/imperium/gateway.env", "IMPERIUM_GATEWAY_TOKEN=REPLACE_WITH_GATEWAY_TOKEN\nIMPERIUM_ENABLE_PHYSICAL=no\n")
    private_file("/etc/imperium/gateway.private.json", json.dumps({
        "apiBaseUrl": "https://abweepruixcyetrzefhk.supabase.co/functions/v1/access-api",
        "gatewayTokenEnv": "IMPERIUM_GATEWAY_TOKEN", "journalFile": "/data/imperium.sqlite",
        "physicalEnabled": False, "devices": []
    }, indent=2) + "\n")
    compose = {"services": {"imperium-gateway": {
        "build": {"context": str(repo), "dockerfile": "gateway/Dockerfile"},
        "restart": "unless-stopped", "network_mode": "host", "read_only": True,
        "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"],
        "pids_limit": 100, "mem_limit": "256m", "env_file": "/etc/imperium/gateway.env",
        "volumes": ["/etc/imperium/gateway.private.json:/run/imperium/config.json:ro", "imperium-journal:/data"],
        "tmpfs": ["/tmp"]}}, "volumes": {"imperium-journal": {}}}
    private_file("/etc/imperium/compose.json", json.dumps(compose, indent=2) + "\n")
    run("systemctl", "enable", "--now", "docker")
    run("systemctl", "enable", "--now", "systemd-timesyncd")
    run("docker", "compose", "-p", "imperium", "-f", "/etc/imperium/compose.json", "config", "--quiet")
    run("docker", "compose", "-p", "imperium", "-f", "/etc/imperium/compose.json", "build")
    private_file("/etc/imperium/HOST-PREPARED", "Host preparado; gateway parado; VPN sem peers; acesso físico desativado.\n")
    print("Imperium: preparação concluída. Gateway não iniciado; configuração e teste da VPN pendentes.")


if __name__ == "__main__":
    main()
