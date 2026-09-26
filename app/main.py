from datetime import datetime

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi import HTTPException

from pathlib import Path

from app.system_metrics import get_system_metrics
from app.service_monitor import get_listening_services

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="Jaeseokk Server Dashboard",
    version="0.1.0",
)

app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)

FILE_ROOTS = {
    "applications": {
        "name": "Applications",
        "path": Path("/home/jaeseokk/apps"),
    },
    "server_data": {
        "name": "Server Data",
        "path": Path("/srv"),
    },
    "large_data": {
        "name": "Large Data",
        "path": Path("/data"),
    },
}


@app.get("/", include_in_schema=False)
def dashboard():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/api/health")
def health():
    return {
        "status": "ok",
    }

@app.get("/api/system")
def system_metrics():
    return get_system_metrics()

@app.get("/api/services")
def services():
    return {
        "services": get_listening_services()
    }
    
@app.get("/api/files/roots")
def get_file_roots():
    roots = []
    
    for root_id, info in FILE_ROOTS.items():
        path = info["path"]
        
        roots.append({
            "id": root_id,
            "name": info["name"],
            "path": str(path),
            "available": path.exists() and path.is_dir(),
        })
        
    return {
        "roots": roots,
    }
    
    
@app.get("/api/files")
def get_files(root: str):
    root_info = FILE_ROOTS.get(root)

    if root_info is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown file root",
        )

    root_path = root_info["path"]

    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(
            status_code=404,
            detail="File root is not available",
        )

    items = []

    try:
        for entry in root_path.iterdir():
            stat = entry.stat()

            items.append({
                "name": entry.name,
                "type": "directory" if entry.is_dir() else "file",
                "size": stat.st_size if entry.is_file() else None,
                "modified": datetime.fromtimestamp(
                    stat.st_mtime
                ).isoformat(),
            })

    except PermissionError:
        raise HTTPException(
            status_code=403,
            detail="Permission denied",
        )

    items.sort(
        key=lambda item: (
            item["type"] != "directory",
            item["name"].lower(),
        )
    )

    return {
        "root": root,
        "path": str(root_path),
        "items": items,
    }
