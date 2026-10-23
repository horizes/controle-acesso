"""Executed by cloud-init on a NEW Ubuntu 24.04 VPS, as root."""
import json
import os
from pathlib import Path
import subprocess


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def private_file(path, content):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with target.open("x", encoding="utf-8") as file:
        os.chmod(target, 0o600)
        file.write(content)


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
    run("ufw", "default", "deny", "incoming")
    run("ufw", "default", "allow", "outgoing")
    run("ufw", "allow", "from", settings["admin_cidr"], "to", "any", "port", "22", "proto", "tcp")
    run("ufw", "allow", "51820/udp")
    # No public HTTP, SDK or callback ports. Private callbacks need explicit rules later.
    run("ufw", "--force", "enable")
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
