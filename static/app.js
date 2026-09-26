const REFRESH_INTERVAL_MS = 5000;

const CPU_MA_WINDOW = 5;
const cpuHistory = [];

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadFileRoots();
    }
);

async function fetchSystemMetrics() {
  const response = await fetch("/api/system");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function setProgress(id, value) {
  const element = document.getElementById(id);

  const safeValue = Math.min(Math.max(value, 0), 100);

  element.style.width = `${safeValue}%`;
}

function updateSystemInfo(data) {
  document.getElementById("hostname").textContent = data.system.hostname;

  document.getElementById("system-info").textContent =
    `${data.system.os} · ${data.system.architecture}`;
}

function updateCpu(cpu) {
  const smoothedCpu = getCpuMovingAverage(cpu.usage_percent);

  const displayValue = smoothedCpu.toFixed(1);

  document.getElementById("cpu-value").textContent = `${displayValue}%`;

  document.getElementById("cpu-detail").textContent =
    `${cpu.physical_cores} physical · ${cpu.logical_cores} logical cores`;

  setProgress("cpu-progress", smoothedCpu);

  return smoothedCpu;
}
function updateMemory(memory) {
  document.getElementById("memory-value").textContent =
    `${memory.usage_percent}%`;

  document.getElementById("memory-detail").textContent =
    `${memory.used_gb} / ${memory.total_gb} GB`;

  setProgress("memory-progress", memory.usage_percent);
}

function updateDisk(disk) {
  document.getElementById("disk-value").textContent = `${disk.usage_percent}%`;

  document.getElementById("disk-detail").textContent =
    `${disk.used_gb} / ${disk.total_gb} GB`;

  setProgress("disk-progress", disk.usage_percent);
}

function updateUptime(uptime) {
  document.getElementById("uptime-value").textContent = uptime.formatted;
}

function updateGpu(gpu) {
  const container = document.getElementById("gpu-content");

  if (!gpu.available) {
    container.innerHTML = `
            <div class="gpu-empty">
                ${gpu.message}
            </div>
        `;

    return;
  }

  container.innerHTML = `
        <div class="gpu-name">
            ${gpu.name}
        </div>

        <div class="gpu-stats">
            <span>
                Usage ${gpu.usage_percent}%
            </span>

            <span>
                VRAM ${gpu.memory_used_mb}
                / ${gpu.memory_total_mb} MB
            </span>

            <span>
                ${gpu.temperature_c}°C
            </span>
        </div>
    `;
}

function updateHealthItem(id, value) {
  const displayValue = Number(value.toFixed(1));

  const element = document.getElementById(id);

  const label = element.querySelector("span:last-child");

  element.classList.remove("warning", "danger");

  if (displayValue >= 90) {
    element.classList.add("danger");

    label.textContent = `Critical · ${displayValue}%`;
  } else if (displayValue >= 75) {
    element.classList.add("warning");

    label.textContent = `Watch · ${displayValue}%`;
  } else {
    label.textContent = `Normal · ${displayValue}%`;
  }
}

function updateHealth(data, smoothedCpu) {
  updateHealthItem("health-cpu", smoothedCpu);

  updateHealthItem("health-memory", data.memory.usage_percent);

  updateHealthItem("health-disk", data.disk.usage_percent);
}

function updateTimestamp() {
  const now = new Date();

  document.getElementById("last-updated").textContent =
    `Last updated ${now.toLocaleTimeString()}`;
}

async function refreshDashboard() {
  try {
    const [data, serviceData] = await Promise.all([
      fetchSystemMetrics(),
      fetchServices(),
    ]);

    updateSystemInfo(data);
    const smoothedCpu = updateCpu(data.cpu);

    updateMemory(data.memory);
    updateDisk(data.disk);
    updateUptime(data.uptime);
    updateGpu(data.gpu);
    updateServices(serviceData);

    updateHealth(data, smoothedCpu);
    updateTimestamp();
  } catch (error) {
    console.error("Dashboard refresh failed:", error);
  }
}

refreshDashboard();

setInterval(refreshDashboard, REFRESH_INTERVAL_MS);

function getCpuMovingAverage(currentValue) {
  cpuHistory.push(currentValue);

  if (cpuHistory.length > CPU_MA_WINDOW) {
    cpuHistory.shift();
  }

  const sum = cpuHistory.reduce((acc, value) => acc + value, 0);

  return sum / cpuHistory.length;
}

async function fetchServices() {
  const response = await fetch("/api/services");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function updateServices(data) {
  const services = data.services;

  const container = document.getElementById("service-list");

  document.getElementById("service-count").textContent =
    `${services.length} listening`;

  if (services.length === 0) {
    container.innerHTML = `
            <div class="service-empty">
                No listening services detected.
            </div>
        `;

    return;
  }

  container.innerHTML = services
    .map(
      (service) => `

            <div class="service-row">

                <div class="service-name">
                    ${service.name}
                </div>

                <div class="service-process">
                    ${service.process}
                </div>

                <div>
                    <span class="service-port">
                        :${service.port}
                    </span>
                </div>

                <div class="service-pid">
                    PID ${service.pid ?? "-"}
                </div>

            </div>

        `,
    )
    .join("");
}


const fileTreeEl = document.getElementById("filesystemTree");
const fileDetailEl = document.getElementById("filesystemDetail");


async function loadFileRoots() {
    try {
        const response = await fetch("/api/files/roots");

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        fileTreeEl.innerHTML = "";

        for (const root of data.roots) {
            renderRootNode(root);
        }

    } catch (error) {
        console.error("Failed to load file roots:", error);

        fileTreeEl.innerHTML = `
            <div class="tree-error">
                Failed to load filesystem roots
            </div>
        `;
    }
}

function renderRootNode(root) {
    const node = document.createElement("div");
    node.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-node-row";

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = root.available ? "▶" : "—";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = "▣";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = root.name;

    row.append(toggle, icon, name);

    const children = document.createElement("div");
    children.className = "tree-children";
    children.hidden = true;

    node.append(row, children);
    fileTreeEl.appendChild(node);

    if (!root.available) {
        row.style.opacity = "0.4";
        return;
    }

    let loaded = false;

    row.addEventListener("click", async () => {
        showFileDetail({
            name: root.name,
            type: "directory",
            path: root.path,
            size: null,
            modified: null,
        });

        const willOpen = children.hidden;

        if (willOpen && !loaded) {
            await loadDirectory(
                root.id,
                "",
                children
            );

            loaded = true;
        }

        children.hidden = !willOpen;

        toggle.textContent =
            willOpen ? "▼" : "▶";
    });
}

async function loadDirectory(
    rootId,
    subpath,
    container
) {

    container.innerHTML = `
        <div class="tree-loading">
            Loading...
        </div>
    `;

    try {
        const params = new URLSearchParams({
            root: rootId,
            subpath: subpath,
        });

        const response = await fetch(
            `/api/files?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        container.innerHTML = "";

        if (data.items.length === 0) {
            container.innerHTML = `
                <div class="tree-empty">
                    Empty directory
                </div>
            `;

            return;
        }

        for (const item of data.items) {
            renderFileNode(
                rootId,
                data.path,
                item,
                container
            );
        }

    } catch (error) {
        console.error(
            "Failed to load directory:",
            error
        );

        container.innerHTML = `
            <div class="tree-error">
                Unable to read directory
            </div>
        `;
    }
}

function renderFileNode(
    rootId,
    parentPath,
    item,
    container
) {
    const node = document.createElement("div");
    node.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-node-row";

    const toggle = document.createElement("span");
    toggle.className = "tree-toggle";

    const icon = document.createElement("span");
    icon.className = "tree-icon";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = item.name;

    const isDirectory =
        item.type === "directory";

    if (isDirectory) {
        toggle.textContent = "▶";
        icon.textContent = "▸";
    } else {
        toggle.textContent = "";
        icon.textContent = "·";
    }

    row.append(toggle, icon, name);

    const children = document.createElement("div");
    children.className = "tree-children";
    children.hidden = true;

    node.append(row, children);
    container.appendChild(node);

    let loaded = false;

    row.addEventListener("click", async (event) => {
        event.stopPropagation();

        const fullPath =
            `${parentPath}/${item.name}`;

        showFileDetail({
            ...item,
            path: fullPath,
        });

        if (!isDirectory) {
            return;
        }

        const willOpen = children.hidden;

        if (willOpen && !loaded) {
            await loadDirectory(
                root.id,
                "",
                children
            );

            loaded = true;
        }

        children.hidden = !willOpen;

        toggle.textContent =
            willOpen ? "▼" : "▶";
    });
}

function showFileDetail(item) {
    fileDetailEl.innerHTML = `
        <div class="file-detail-title">
            ${escapeHtml(item.name)}
        </div>

        <div class="file-detail-row">
            <div class="file-detail-label">Type</div>
            <div class="file-detail-value">
                ${escapeHtml(item.type)}
            </div>
        </div>

        <div class="file-detail-row">
            <div class="file-detail-label">Path</div>
            <div class="file-detail-value">
                ${escapeHtml(item.path)}
            </div>
        </div>

        <div class="file-detail-row">
            <div class="file-detail-label">Size</div>
            <div class="file-detail-value">
                ${formatFileSize(item.size)}
            </div>
        </div>

        <div class="file-detail-row">
            <div class="file-detail-label">Modified</div>
            <div class="file-detail-value">
                ${formatModified(item.modified)}
            </div>
        </div>
    `;
}

function formatFileSize(bytes) {
    if (bytes === null || bytes === undefined) {
        return "—";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];

    let value = bytes;
    let unitIndex = 0;

    while (
        value >= 1024 &&
        unitIndex < units.length - 1
    ) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(
        unitIndex === 0 ? 0 : 1
    )} ${units[unitIndex]}`;
}


function formatModified(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    return date.toLocaleString();
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}



