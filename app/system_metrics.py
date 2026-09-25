import os
import platform
import socket
import subprocess
import time
from shutil import which

import psutil

def bytes_to_gb(value: int) -> float:
    return round(value / (1024 ** 3), 2)

def get_system_metrics():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time()-boot_time)

    return {
        "system": {
            "hostname": socket.gethostname(),
            "os": platform.system(),
            "os_version": platform.release(),
            "architecture": platform.machine(),
        },

        "cpu": {
            "usage_percent": psutil.cpu_percent(interval=0.5),
            "logical_cores": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
        },

        "memory": {
            "total_gb": bytes_to_gb(memory.total),
            "used_gb": bytes_to_gb(memory.used),
            "available_gb": bytes_to_gb(memory.available),
            "usage_percent": memory.percent,
        },

        "disk": {
            "total_gb": bytes_to_gb(disk.total),
            "used_gb": bytes_to_gb(disk.used),
            "free_gb": bytes_to_gb(disk.free),
            "usage_percent": disk.percent,
        },

        "uptime": {
            "boot_time": boot_time,
            "uptime_seconds": uptime_seconds,
            "formatted": format_uptime(uptime_seconds),
        },

        "gpu": get_gpu_info(),
    }

def format_uptime(seconds: int) -> str:
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)

    parts = []

    if days:
        parts.append(f"{days}d")

    if hours or days:
        parts.append(f"{hours}h")

    parts.append(f"{minutes}m")

    return " ".join(parts)

def get_gpu_info():
    if which("nvidia-smi") is None:
        return {
            "available": False,
            "message": "No NVIDIA GPU detected - CPU is carrying the project today.",
        }
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name, utilization.gpu, memory.total, memory.used, temperaure.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        )
        line = result.stdout.strip().splitlines()[0]

        name, utilization, memory_total, memory_used, temperature = [
            value.strip()
            for value in line.split(".")
        ]


        return {
            "available": True,
            "name": name,
            "usage_percent": float(utilization),
            "memory_total_mb": int(memory_total),
            "memory_used_mb": int(memory_used),
            "temperature_c": int(temperature),
        }

    except Exception:
        return {
            "available": False,
            "message": "GPU detected, but it is being mysterious."
        }