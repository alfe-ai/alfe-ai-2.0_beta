#!/bin/bash
# file: vm_run.sh
#
# Quick-start KVM/QEMU launcher for the Alfe agent VM.
# Creates a grow-on-write qcow2 disk, prepares a cloud-init seed,
# then boots a headless Debian guest with port-forwarded SSH.

set -euo pipefail

VM_NAME="alfe-agent"
DISK_IMG="${VM_NAME}.qcow2"
DISK_SIZE=20G          # grow-on-write qcow2
ISO_PATH="/path/to/debian-12.5.0-amd64-netinst.iso"   # TODO: point to a local ISO
SEED_IMG="${VM_NAME}-seed.iso"

# ----------------------------------------------------------------------
# 1. Build base disk if missing
# ----------------------------------------------------------------------
if [[ ! -f "${DISK_IMG}" ]]; then
  echo "[+] Creating base disk ${DISK_IMG} (${DISK_SIZE})"
  qemu-img create -f qcow2 "${DISK_IMG}" "${DISK_SIZE}"
fi

# ----------------------------------------------------------------------
# 2. Create cloud-init seed ISO (user-data + meta-data)
# ----------------------------------------------------------------------
echo "[+] Generating cloud-init seed"

cat > user-data <<'EOF'
#cloud-config
preserve_hostname: false
hostname: alfe-agent
users:
  - name: alfe
    groups: sudo
    home: /home/alfe
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    lock_passwd: true
    ssh_authorized_keys:
      - ssh-rsa AAAA...your_public_key_here
ssh_pwauth: false
chpasswd: { expire: false }
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
EOF

touch meta-data    # empty meta-data is acceptable
cloud-localds "${SEED_IMG}" user-data meta-data

# ----------------------------------------------------------------------
# 3. Launch VM
# ----------------------------------------------------------------------
echo "[+] Booting VM '${VM_NAME}' (SSH -> localhost:2222)"

exec qemu-system-x86_64 \
  -name "${VM_NAME}" \
  -machine q35,accel=kvm,type=pc \
  -cpu host,migratable=no \
  -smp cores=2 \
  -m 4096 \
  -drive if=virtio,file="${DISK_IMG}",format=qcow2 \
  -drive if=virtio,media=cdrom,file="${ISO_PATH}" \
  -drive if=virtio,media=cdrom,file="${SEED_IMG}" \
  -netdev user,id=net0,hostfwd=tcp::2222-:22 \
  -device virtio-net-pci,netdev=net0 \
  -serial mon:stdio \
  -nographic

