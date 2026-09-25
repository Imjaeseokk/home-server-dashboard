const REFRESH_INTERVAL_MS = 5000;

const CPU_MA_WINDOW = 5;
const cpuHistory = [];

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
