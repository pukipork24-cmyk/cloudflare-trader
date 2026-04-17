// Log Management & Filtering

let allLogs = [];
let filteredLogs = [];
let logAutoScroll = true;
let logPaused = false;

// Fetch logs from API
async function fetchLogs() {
  try {
    const response = await fetch('/api/intelligence-logs?limit=500');
    const data = await response.json();
    allLogs = Array.isArray(data) ? data : [];
    renderLogs(allLogs);
  } catch (e) {
    console.error('Failed to fetch logs:', e);
    showLogError('Failed to load logs');
  }
}

// Apply filters
function applyLogFilters() {
  if (logPaused) return;

  const levelFilter = document.querySelector('.chip.active')?.getAttribute('data-value') || 'all';
  const agentFilter = document.getElementById('agent-filter').value;
  const eventFilter = document.getElementById('event-filter').value;
  const searchTerm = document.getElementById('log-search').value.toLowerCase();

  filteredLogs = allLogs.filter(log => {
    // Level filter
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;

    // Agent filter
    if (agentFilter && !log.agent?.includes(agentFilter)) return false;

    // Event type filter
    if (eventFilter && log.type !== eventFilter) return false;

    // Search filter
    if (searchTerm) {
      const content = JSON.stringify(log).toLowerCase();
      if (!content.includes(searchTerm)) return false;
    }

    return true;
  });

  renderLogs(filteredLogs);
  updateLogStats();
}

function resetLogFilters() {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip[data-value="all"]').classList.add('active');
  document.getElementById('agent-filter').value = '';
  document.getElementById('event-filter').value = '';
  document.getElementById('date-filter').value = '24h';
  document.getElementById('log-search').value = '';

  filteredLogs = allLogs;
  renderLogs(allLogs);
  updateLogStats();
}

// Render logs to DOM
function renderLogs(logs) {
  const stream = document.getElementById('log-stream');

  if (logs.length === 0) {
    stream.innerHTML = '<div class="log-entry loading"><span>No logs found</span></div>';
    return;
  }

  stream.innerHTML = logs.map((log, idx) => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const level = log.level || 'INFO';
    const agent = log.agent || 'SYSTEM';
    const message = log.message || log.headline || '';
    const details = log.data || log.raw ? JSON.stringify(log.data || log.raw, null, 2) : '';

    return `
      <div class="log-entry ${level}" onclick="toggleLogDetails(${idx})">
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-content">
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="log-badge ${level}">${level}</span>
            <span style="font-size: 11px; color: var(--txt-dim);">${agent}</span>
          </div>
          <div class="log-message">${escapeHtml(message)}</div>
          ${details ? `<div class="log-details">${escapeHtml(details)}</div>` : ''}
        </div>
        <button class="log-copy-btn" onclick="copyLogToClipboard(event, ${idx})">Copy</button>
      </div>
    `;
  }).join('');

  // Attach event listeners
  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const filter = e.target.getAttribute('data-filter');
      document.querySelectorAll(`[data-filter="${filter}"]`).forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      applyLogFilters();
    });
  });

  // Auto-scroll
  if (logAutoScroll && !logPaused) {
    stream.scrollTop = stream.scrollHeight;
  }
}

function toggleLogDetails(idx) {
  const entries = document.querySelectorAll('.log-entry');
  entries[idx].classList.toggle('expanded');
}

function copyLogToClipboard(e, idx) {
  e.stopPropagation();
  const log = filteredLogs[idx];
  const text = JSON.stringify(log, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    showLogMessage('Copied to clipboard', 'success');
  }).catch(() => {
    showLogMessage('Failed to copy', 'error');
  });
}

// Export logs
function exportLogs(format) {
  if (filteredLogs.length === 0) {
    showLogMessage('No logs to export', 'error');
    return;
  }

  let content, filename, type;

  if (format === 'json') {
    content = JSON.stringify(filteredLogs, null, 2);
    filename = `logs_${new Date().toISOString().split('T')[0]}.json`;
    type = 'application/json';
  } else if (format === 'csv') {
    content = convertLogsToCSV(filteredLogs);
    filename = `logs_${new Date().toISOString().split('T')[0]}.csv`;
    type = 'text/csv';
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showLogMessage(`Exported ${filteredLogs.length} logs as ${format.toUpperCase()}`, 'success');
}

function convertLogsToCSV(logs) {
  const headers = ['Timestamp', 'Level', 'Agent', 'Message'];
  const rows = logs.map(log => [
    log.timestamp,
    log.level,
    log.agent,
    JSON.stringify(log.message).replace(/"/g, '""')
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}

// Clear logs
function clearLogs() {
  if (!confirm('Clear all logs? This cannot be undone.')) return;

  allLogs = [];
  filteredLogs = [];
  renderLogs([]);
  updateLogStats();
  showLogMessage('Logs cleared', 'info');
}

// Pause/Resume
function pauseLogs() {
  logPaused = !logPaused;
  const btn = event.target;
  btn.textContent = logPaused ? '▶ Resume' : '⏸ Pause';
  btn.style.opacity = logPaused ? '0.6' : '1';
}

// Update log statistics
function updateLogStats() {
  const total = filteredLogs.length;
  const errors = filteredLogs.filter(l => l.level === 'ERROR').length;
  const warns = filteredLogs.filter(l => l.level === 'WARN').length;

  const statsEl = document.getElementById('log-stats');
  statsEl.textContent = `${total} logs | ${errors} errors | ${warns} warnings`;
}

// Utilities
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function showLogMessage(message, type) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    background: ${type === 'success' ? 'var(--green)' : 'var(--red)'};
    color: #000;
    border-radius: 4px;
    font-size: 13px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function showLogError(message) {
  showLogMessage(message, 'error');
}

// Auto-refresh logs periodically
let logRefreshInterval;
function startLogRefresh(interval = 5000) {
  if (logRefreshInterval) clearInterval(logRefreshInterval);
  logRefreshInterval = setInterval(() => {
    if (!logPaused) fetchLogs();
  }, interval);
}

// Initialize logs
document.addEventListener('DOMContentLoaded', () => {
  fetchLogs();
  startLogRefresh(10000); // Refresh every 10 seconds

  // Toggle auto-scroll
  const autoScrollCheckbox = document.getElementById('auto-scroll');
  if (autoScrollCheckbox) {
    autoScrollCheckbox.addEventListener('change', (e) => {
      logAutoScroll = e.target.checked;
    });
  }

  // Filter triggers
  document.getElementById('agent-filter')?.addEventListener('change', applyLogFilters);
  document.getElementById('event-filter')?.addEventListener('change', applyLogFilters);
  document.getElementById('date-filter')?.addEventListener('change', applyLogFilters);
  document.getElementById('log-search')?.addEventListener('input', applyLogFilters);
});
