"""Render cloud-init without provider credentials or operational gateway secrets."""
import argparse
import base64
import ipaddress
import json
import struct
from pathlib import Path

REVISION = "e0274f586536df608eec8c718775dfc635e305d1"


def render(admin_cidr, public_key):
    network = ipaddress.ip_network(admin_cidr, strict=True)
    if network.version != 4 or network.prefixlen != 32:
        raise ValueError("Informe o IPv4 público de administração com /32.")
    fields = public_key.strip().split()
    if len(fields) < 2 or fields[0] != "ssh-ed25519":
        raise ValueError("Use uma chave pública SSH Ed25519; nunca a chave privada.")
    raw = base64.b64decode(fields[1], validate=True)
    if (len(raw) != 51 or raw[:4] != struct.pack(">I", 11)
            or raw[4:15] != b"ssh-ed25519" or raw[15:19] != struct.pack(">I", 32)):
        raise ValueError("Chave pública Ed25519 inválida.")
    public_key = " ".join(fields[:2])
    settings = {"admin_cidr": str(network), "revision": REVISION}
    bootstrap = Path(__file__).with_name("setup-host.py").read_text(encoding="utf-8")
    config = {
        "hostname": "imperium-gateway-01",
        "manage_etc_hosts": True,
        "timezone": "Etc/UTC",
        "disable_root": True,
        "ssh_pwauth": False,
        "users": [{"name": "imperium-admin", "shell": "/bin/bash", "lock_passwd": True,
                   "sudo": ["ALL=(ALL) NOPASSWD:ALL"], "ssh_authorized_keys": [public_key]}],
        "package_update": True,
        "packages": ["ca-certificates", "git", "docker.io", "docker-compose-v2",
                     "wireguard", "ufw", "unattended-upgrades"],
        "write_files": [
            {"path": "/usr/local/lib/imperium/setup-host.py", "permissions": "0700",
             "owner": "root:root", "content": bootstrap},
            {"path": "/etc/imperium/bootstrap.json", "permissions": "0600",
             "owner": "root:root", "content": json.dumps(settings)},
            {"path": "/etc/ssh/sshd_config.d/00-imperium.conf", "permissions": "0644",
             "content": "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n"},
        ],
        "runcmd": [["python3", "/usr/local/lib/imperium/setup-host.py"]],
    }
    # JSON is also valid YAML; cloud-init recognizes the initial cloud-config header.
    return "#cloud-config\n" + json.dumps(config, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-cidr", required=True)
    parser.add_argument("--ssh-public-key", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = render(args.admin_cidr, args.ssh_public_key.read_text(encoding="utf-8"))
        # Do not overwrite a file that may have been reviewed already.
        with args.output.open("x", encoding="utf-8", newline="\n") as destination:
            destination.write(result)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print("Cloud-init preparado. Nenhum servidor foi contratado ou criado.")
