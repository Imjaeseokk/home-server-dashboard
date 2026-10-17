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

HIDDEN_FILESYSTEM_NAMES = frozenset({
    "venv", "env", "node_modules", "__pycache__", "__pypackages__",
})


def is_hidden_filesystem_path(path: Path) -> bool:
    """Exclude internal entries at every level of the filesystem browser."""
    return any(
        (part.startswith(".") and part not in {".", ".."})
        or part.casefold() in HIDDEN_FILESYSTEM_NAMES
        or part.casefold().endswith(".env")
        for part in path.parts
    )


@app.get("/", include_in_schema=False)
def dashboard():
    return FileResponse(
        STATIC_DIR / "index.html",
        headers={"Cache-Control": "no-cache"},
    )

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
def get_files(root: str, subpath: str = ""):
    root_info = FILE_ROOTS.get(root)

    if root_info is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown file root",
        )

    if is_hidden_filesystem_path(Path(subpath)):
        raise HTTPException(status_code=404, detail="Path does not exist")

    root_path = root_info["path"].resolve()
    try:
        target_path = (root_path / subpath).resolve()
    except (OSError, RuntimeError):
        raise HTTPException(status_code=404, detail="Path does not exist")

    # 허용된 root 바깥으로 나가는 것을 방지
    try:
        relative_target = target_path.relative_to(root_path)
    except ValueError:
        raise HTTPException(
            status_code=403,
            detail="Access outside the allowed root is not permitted",
        )

    if is_hidden_filesystem_path(relative_target):
        raise HTTPException(status_code=404, detail="Path does not exist")

    if not target_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Path does not exist",
        )

    if not target_path.is_dir():
        raise HTTPException(
            status_code=400,
            detail="Path is not a directory",
        )

    items = []

    try:
        for entry in target_path.iterdir():
            relative_path = entry.relative_to(root_path)

            if is_hidden_filesystem_path(relative_path):
                continue

            # A visible symlink must not reveal a hidden or out-of-root target.
            try:
                resolved_relative = entry.resolve().relative_to(root_path)
            except (ValueError, OSError, RuntimeError):
                continue

            if is_hidden_filesystem_path(resolved_relative):
                continue

            try:
                stat = entry.stat()

                items.append({
                    "name": entry.name,
                    "subpath": str(relative_path),
                    "type": "directory" if entry.is_dir() else "file",
                    "size": stat.st_size if entry.is_file() else None,
                    "modified": datetime.fromtimestamp(
                        stat.st_mtime
                    ).isoformat(),
                })

            except (PermissionError, OSError):
                items.append({
                    "name": entry.name,
                    "subpath": str(relative_path),
                    "type": "unknown",
                    "size": None,
                    "modified": None,
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
        "subpath": subpath,
        "path": str(target_path),
        "items": items,
    }
