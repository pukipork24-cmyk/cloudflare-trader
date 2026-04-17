// Settings Management

const SETTINGS_KEY = 'trading_settings';
const DEFAULT_SETTINGS = {
  bitget: { verified: false, lastVerified: null },
  deepseek: { verified: false, lastVerified: null },
  anthropic: { verified: false, lastVerified: null },
  activePairs: ['BTC', 'ETH', 'SOL'],
  maxPairs: 3,
  maxLeverage: 1,
  perTradeRisk: 2,
  dailyLossLimit: 100,
  maxPositions: 3,
  blacklist: [],
  tradingEnabled: true,
  autoExecute: true,
  telegramAlerts: false,
  autoRefresh: true,
  debugLogging: false,
  cycleInterval: 5,
  tradingStart: '00:00',
  tradingEnd: '23:59'
};

// Load settings from localStorage
function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Load settings into form
function loadSettingsToForm() {
  const settings = loadSettings();

  // Trading Pairs
  document.getElementById('active-pairs').value = settings.activePairs.join(', ');
  document.getElementById('max-pairs').value = settings.maxPairs;

  // Risk
  document.getElementById('max-leverage').value = settings.maxLeverage;
  document.getElementById('leverage-display').textContent = settings.maxLeverage + 'x';

  document.getElementById('per-trade-risk').value = settings.perTradeRisk;
  document.getElementById('risk-display').textContent = settings.perTradeRisk.toFixed(1) + '%';

  document.getElementById('daily-loss-limit').value = settings.dailyLossLimit;
  document.getElementById('max-positions').value = settings.maxPositions;

  // Blacklist
  document.getElementById('blacklist').value = settings.blacklist.join('\n');

  // Toggles
  document.getElementById('trading-enabled').checked = settings.tradingEnabled;
  document.getElementById('auto-execute').checked = settings.autoExecute;
  document.getElementById('telegram-alerts').checked = settings.telegramAlerts;
  document.getElementById('auto-refresh').checked = settings.autoRefresh;
  document.getElementById('debug-logging').checked = settings.debugLogging;

  // Schedule
  document.querySelector(`input[name="cycle-interval"][value="${settings.cycleInterval}"]`).checked = true;
  document.getElementById('trading-start').value = settings.tradingStart;
  document.getElementById('trading-end').value = settings.tradingEnd;

  // Update slider displays
  document.getElementById('max-leverage').addEventListener('input', (e) => {
    document.getElementById('leverage-display').textContent = e.target.value + 'x';
  });

  document.getElementById('per-trade-risk').addEventListener('input', (e) => {
    document.getElementById('risk-display').textContent = parseFloat(e.target.value).toFixed(1) + '%';
  });
}

// Save all settings from form
function saveAllSettings() {
  const settings = {
    activePairs: document.getElementById('active-pairs').value.split(',').map(p => p.trim().toUpperCase()).filter(p => p),
    maxPairs: parseInt(document.getElementById('max-pairs').value),
    maxLeverage: parseInt(document.getElementById('max-leverage').value),
    perTradeRisk: parseFloat(document.getElementById('per-trade-risk').value),
    dailyLossLimit: parseFloat(document.getElementById('daily-loss-limit').value),
    maxPositions: parseInt(document.getElementById('max-positions').value),
    blacklist: document.getElementById('blacklist').value.split('\n').map(c => c.trim().toUpperCase()).filter(c => c),
    tradingEnabled: document.getElementById('trading-enabled').checked,
    autoExecute: document.getElementById('auto-execute').checked,
    telegramAlerts: document.getElementById('telegram-alerts').checked,
    autoRefresh: document.getElementById('auto-refresh').checked,
    debugLogging: document.getElementById('debug-logging').checked,
    cycleInterval: parseInt(document.querySelector('input[name="cycle-interval"]:checked').value),
    tradingStart: document.getElementById('trading-start').value,
    tradingEnd: document.getElementById('trading-end').value
  };

  saveSettings(settings);
  showSaveStatus('✓ Settings saved', 'success');
}

function resetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    localStorage.removeItem(SETTINGS_KEY);
    loadSettingsToForm();
    showSaveStatus('Settings reset to defaults', 'info');
  }
}

// Test API connections
async function testConnection(service) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Testing...';

  try {
    const response = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service })
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById(`${service}-status`).classList.add('connected');
      document.getElementById(`${service}-verified`).textContent = 'Connected ✓';
      showSaveStatus(`${service.toUpperCase()} connection verified`, 'success');
    } else {
      showSaveStatus(`Connection failed: ${data.error}`, 'error');
    }
  } catch (e) {
    showSaveStatus(`Error: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

function clearApiKey(service) {
  if (confirm(`Clear ${service.toUpperCase()} API key?`)) {
    document.getElementById(`${service}-key`).value = '';
    document.getElementById(`${service}-secret`).value = '';
    document.getElementById(`${service}-passphrase`).value = '';
    document.getElementById(`${service}-status`).classList.remove('connected');
    document.getElementById(`${service}-verified`).textContent = 'Not verified';
    showSaveStatus(`${service.toUpperCase()} key cleared`, 'info');
  }
}

// Show save status message
function showSaveStatus(message, type = 'success') {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = message;
  statusEl.className = `save-status show ${type}`;

  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', loadSettingsToForm);
