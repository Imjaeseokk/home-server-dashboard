import psutil

KNOWN_SERVICES = {
    22: "SSH",
    80: "HTTP",
    443: "HTTPS",
    3000: "Web App",
    5000: "Backend",
    5432: "PostgreSQL",
    6379: "Redis",
    8000: "FastAPI",
    8080: "Web Server",
}

def get_listening_services():
    services = []

    connections = psutil.net_connections(kind="inet")

    for conn in connections:
        if conn.status != psutil.CONN_LISTEN:
            continue

        if not conn.laddr:
            continue

        ip = conn.laddr.ip
        port = conn.laddr.port
        pid = conn.pid

        process_name = "unknown"

        service_name = KNOWN_SERVICES.get(
            port,
            process_name,
        )

        if pid is not None:
            try:
                process = psutil.Process(pid)
                process_name = process.name()

            except (
                psutil.NoSuchProcess,
                psutil.AccessDenied,
            ):
                pass

        services.append({
            "name": service_name,
            "process": process_name,
            "pid": pid,
            "ip": ip,
            "port": port,
        })

    services.sort(
        key=lambda service: service["port"]
    )

    return services