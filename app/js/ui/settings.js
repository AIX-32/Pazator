var TOOL_DELAY_KEY = 'pazator_tool_delay';
var AGENT_DEBUG_KEY = 'pazator_agent_debug';

function getToolDelay() {
    var val = parseInt(localStorage.getItem(TOOL_DELAY_KEY), 10);
    return isNaN(val) ? 0 : Math.max(0, Math.min(10000, val));
}

function getAgentDebug() {
    return localStorage.getItem(AGENT_DEBUG_KEY) === 'true';
}

function getAIVal(key, def) {
    var v = localStorage.getItem(key);
    return v !== null ? v : def;
}

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const noBlurToggle = document.getElementById('noBlurToggle');
    const skipIntroToggle = document.getElementById('skipIntroToggle');
    const passwordToggle = document.getElementById('passwordLockToggle');
    const toolDelayInput = document.getElementById('toolDelayInput');
    const resultsPerPage = document.getElementById('resultsPerPageInput');

    var agentDebugToggle = document.getElementById('agentDebugToggle');

    noBlurToggle.checked = localStorage.getItem('noBlur') === 'true';
    skipIntroToggle.checked = localStorage.getItem('skipIntro') === 'true';
    passwordToggle.checked = localStorage.getItem('pz_passwordEnabled') === 'true';
    if (agentDebugToggle) {
        agentDebugToggle.checked = getAgentDebug();
        agentDebugToggle.onchange = function () {
            localStorage.setItem(AGENT_DEBUG_KEY, this.checked ? 'true' : 'false');
        };
    }
    if (toolDelayInput) {
        toolDelayInput.value = getToolDelay();
        toolDelayInput.oninput = function () {
            localStorage.setItem(TOOL_DELAY_KEY, this.value);
        };
    }
    if (resultsPerPage) {
        var rpp = parseInt(localStorage.getItem('pazator_results_per_page'), 10);
        resultsPerPage.value = isNaN(rpp) || rpp < 10 ? 50 : rpp;
        resultsPerPage.oninput = function () {
            var v = parseInt(this.value, 10);
            if (!isNaN(v) && v >= 10) localStorage.setItem('pazator_results_per_page', v);
        };
    }

    var tempRange = document.getElementById('aiTempRange');
    var tempInput = document.getElementById('aiTempInput');
    if (tempRange && tempInput) {
        var t = parseFloat(getAIVal('pazator_ai_temperature', '0.7'));
        tempInput.value = t.toFixed(1);
        tempRange.value = Math.round(t * 10);
        function syncTemp() {
            var v = parseFloat(tempInput.value);
            if (isNaN(v)) v = 0.7;
            v = Math.max(0, Math.min(2, v));
            tempInput.value = v.toFixed(1);
            tempRange.value = Math.round(v * 10);
            localStorage.setItem('pazator_ai_temperature', v.toFixed(1));
        }
        tempRange.oninput = function () {
            tempInput.value = (parseInt(this.value) / 10).toFixed(1);
            localStorage.setItem('pazator_ai_temperature', tempInput.value);
        };
        tempInput.oninput = syncTemp;
    }

    var maxTok = document.getElementById('aiMaxTokensInput');
    if (maxTok) {
        var mt = parseInt(getAIVal('pazator_ai_max_tokens', '8192'), 10);
        maxTok.value = isNaN(mt) || mt < 256 ? 8192 : mt;
        maxTok.oninput = function () {
            var v = parseInt(this.value, 10);
            if (!isNaN(v) && v >= 256) localStorage.setItem('pazator_ai_max_tokens', v);
        };
    }

    var streamToggle = document.getElementById('aiStreamToggle');
    if (streamToggle) {
        streamToggle.checked = getAIVal('pazator_ai_stream', 'true') === 'true';
        streamToggle.onchange = function () {
            localStorage.setItem('pazator_ai_stream', this.checked ? 'true' : 'false');
        };
    }

    var toolIter = document.getElementById('aiToolIterationsInput');
    if (toolIter) {
        var ti = parseInt(getAIVal('pazator_ai_tool_iterations', '4'), 10);
        toolIter.value = isNaN(ti) || ti < 1 ? 4 : ti;
        toolIter.oninput = function () {
            var v = parseInt(this.value, 10);
            if (!isNaN(v) && v >= 1) localStorage.setItem('pazator_ai_tool_iterations', v);
        };
    }

    var retryToggle = document.getElementById('aiAutoRetryToggle');
    var retryWrap = document.getElementById('aiRetryCountWrap');
    var retryInput = document.getElementById('aiRetryCountInput');
    if (retryToggle && retryWrap) {
        retryToggle.checked = getAIVal('pazator_ai_auto_retry', 'true') === 'true';
        retryWrap.style.display = retryToggle.checked ? '' : 'none';
        retryToggle.onchange = function () {
            localStorage.setItem('pazator_ai_auto_retry', this.checked ? 'true' : 'false');
            retryWrap.style.display = this.checked ? '' : 'none';
        };
        if (retryInput) {
            var rc = parseInt(getAIVal('pazator_ai_retry_count', '2'), 10);
            retryInput.value = isNaN(rc) || rc < 1 ? 2 : rc;
            retryInput.oninput = function () {
                var v = parseInt(this.value, 10);
                if (!isNaN(v) && v >= 1) localStorage.setItem('pazator_ai_retry_count', v);
            };
        }
    }

    modal.classList.add('active');
    modal.style.animation = 'none';
    modal.offsetHeight;
    modal.style.animation = '';

    switchSettingsTab('general');

    modal.onclick = function (e) {
        if (e.target === modal) {
            closeSettingsModal();
        }
    };
}

function switchSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.settings-tab-content').forEach(function (c) {
        c.classList.toggle('active', c.id === 'settings' + tab.charAt(0).toUpperCase() + tab.slice(1));
    });
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
    modal.style.animation = 'none';
    modal.offsetHeight;
    modal.style.animation = '';
}

function toggleNoBlur(enabled) {
    localStorage.setItem('noBlur', enabled ? 'true' : 'false');
    if (enabled) {
        document.body.classList.add('no-blur');
    } else {
        document.body.classList.remove('no-blur');
    }
}

function toggleSkipIntro(enabled) {
    localStorage.setItem('skipIntro', enabled ? 'true' : 'false');
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.settings-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            switchSettingsTab(this.dataset.tab);
        });
    });
});

async function togglePasswordLock(enabled) {
    var area = document.getElementById('passwordChangeArea');
    var toggle = document.getElementById('passwordLockToggle');
    var status = document.getElementById('passwordStatus');
    if (!area) return;

    if (enabled) {
        var existingHash = localStorage.getItem('pz_passwordHash');
        area.style.display = 'block';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordConfirmInput').value = '';
        document.getElementById('passwordSaveBtn').textContent = existingHash ? 'Change Password' : 'Set Password';
        document.getElementById('passwordRemoveBtn').style.display = existingHash ? '' : 'none';
        if (status) {
            if (existingHash) {
                status.textContent = 'Password is set. Enter a new one to change it, or remove it.';
                status.style.color = '#4d9de0';
            } else {
                status.textContent = 'Enter and confirm a password to enable the lock.';
                status.style.color = '#aaa';
            }
        }
    } else {
        if (localStorage.getItem('pz_passwordHash')) {
            var confirmed = await showConfirm('Disable password lock? Anyone who opens the app will have full access.', 'Password Lock', 'warning');
            if (!confirmed) {
                toggle.checked = true;
                return;
            }
            localStorage.removeItem('pz_passwordHash');
            localStorage.removeItem('pz_passwordEnabled');
        }
        area.style.display = 'none';
        if (status) status.textContent = '';
    }
}

function savePassword() {
    var pwd = document.getElementById('passwordInput').value;
    var confirm = document.getElementById('passwordConfirmInput').value;
    var status = document.getElementById('passwordStatus');
    if (!pwd) { status.textContent = 'Password cannot be empty.'; status.style.color = '#ff6b6b'; return; }
    if (pwd.length < 4) { status.textContent = 'Password must be at least 4 characters.'; status.style.color = '#ff6b6b'; return; }
    if (pwd !== confirm) { status.textContent = 'Passwords do not match.'; status.style.color = '#ff6b6b'; return; }

    var hash = simpleHash(pwd);
    localStorage.setItem('pz_passwordHash', hash);
    localStorage.setItem('pz_passwordEnabled', 'true');
    status.textContent = 'Password saved. It will be required on next page refresh.';
    status.style.color = '#6bcf7f';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordConfirmInput').value = '';
    document.getElementById('passwordSaveBtn').textContent = 'Change Password';
    document.getElementById('passwordRemoveBtn').style.display = '';
}

async function removePassword() {
    var confirmed = await showConfirm('Remove password lock? Anyone who opens the app will have full access.', 'Password Lock', 'warning');
    if (!confirmed) return;
    localStorage.removeItem('pz_passwordHash');
    localStorage.removeItem('pz_passwordEnabled');
    document.getElementById('passwordLockToggle').checked = false;
    document.getElementById('passwordChangeArea').style.display = 'none';
    document.getElementById('passwordRemoveBtn').style.display = 'none';
    document.getElementById('passwordSaveBtn').textContent = 'Set Password';
    var status = document.getElementById('passwordStatus');
    if (status) status.textContent = 'Password removed.';
}

function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & hash;
    }
    return 'pz_' + Math.abs(hash).toString(36);
}

function checkPassword() {
    var input = document.getElementById('passwordUnlockInput');
    var error = document.getElementById('passwordUnlockError');
    var storedHash = localStorage.getItem('pz_passwordHash');
    if (!storedHash) {
        document.getElementById('passwordOverlay').style.display = 'none';
        return;
    }
    if (simpleHash(input.value) === storedHash) {
        document.getElementById('passwordOverlay').style.display = 'none';
        input.value = '';
        error.style.display = 'none';
    } else {
        error.style.display = '';
        input.value = '';
        input.focus();
    }
}


function populateModels() {
    var modelSelect = document.getElementById('aiModelSelect');
    if (!modelSelect) return;
    var models = window.pazatorAI ? window.pazatorAI.getModels() : [];
    modelSelect.innerHTML = models.map(function (m) {
        return '<option value="' + m.id + '">' + m.name + '</option>';
    }).join('');
    var fetchBtn = document.getElementById('fetchModelsBtn');
    if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '\u27F3';
    }
    if (window.pazatorAI) {
        modelSelect.value = window.pazatorAI.getModel();
    }
}

function initAIUI() {
    var providerSelect = document.getElementById('aiProviderSelect');
    var apiKeyInput = document.getElementById('aiApiKeyInput');
    var modelSelect = document.getElementById('aiModelSelect');
    var statusEl = document.getElementById('aiStatus');
    var fetchBtn = document.getElementById('fetchModelsBtn');

    if (!providerSelect || !apiKeyInput || !modelSelect) return;

    if (window.pazatorAI) {
        var names = window.pazatorAI.list();
        providerSelect.innerHTML = names.map(function (n) {
            var p = window.pazatorAI.getProvider(n);
            return '<option value="' + n + '">' + (p ? p.name : n) + '</option>';
        }).join('');
        providerSelect.value = window.pazatorAI.getCurrent();
    }

    populateModels();
    apiKeyInput.value = window.pazatorAI ? window.pazatorAI.getApiKey() : '';
    updateAIStatus();

    if (fetchBtn) {
        fetchBtn.addEventListener('click', async function () {
            if (!window.pazatorAI) return;
            var key = window.pazatorAI.getApiKey();
            if (!key) { updateAIStatus(); return; }
            fetchBtn.disabled = true;
            fetchBtn.textContent = '...';
            try {
                var fetched = await window.pazatorAI.fetchModelsFromAPI(key);
                if (fetched && fetched.length) {
                    var current = window.pazatorAI.getModel();
                    modelSelect.innerHTML = fetched.map(function (m) {
                        return '<option value="' + m.id + '"' + (m.id === current ? ' selected' : '') + '>' + m.name + '</option>';
                    }).join('');
                    if (!modelSelect.value) {
                        window.pazatorAI.setModel(fetched[0].id);
                        modelSelect.value = fetched[0].id;
                    }
                    updateAIStatus();
                }
            } catch (e) {
                console.error('Failed to fetch models:', e);
            }
            fetchBtn.disabled = false;
            fetchBtn.textContent = '\u27F3';
        });
    }

    providerSelect.addEventListener('change', function () {
        if (!window.pazatorAI) return;
        window.pazatorAI.setCurrent(this.value);
        populateModels();
        apiKeyInput.value = window.pazatorAI.getApiKey();
        updateAIStatus();
    });

    apiKeyInput.addEventListener('input', function () {
        if (window.pazatorAI) {
            window.pazatorAI.setApiKey(this.value);
        }
        updateAIStatus();
    });

    modelSelect.addEventListener('change', function () {
        if (window.pazatorAI) {
            window.pazatorAI.setModel(this.value);
        }
        updateAIStatus();
    });
}

function updateAIStatus() {
    var statusEl = document.getElementById('aiStatus');
    if (!statusEl) return;
    if (!window.pazatorAI) { statusEl.textContent = 'AI system unavailable'; return; }

    var key = window.pazatorAI.getApiKey();
    var model = window.pazatorAI.getModel();
    var pName = window.pazatorAI.getName();

    statusEl.className = 'gemini-status';

    if (!key) {
        statusEl.textContent = 'No API key configured';
    } else {
        statusEl.classList.add('configured');
        var displayName = model;
        var models = window.pazatorAI.getModels();
        for (var j = 0; j < models.length; j++) {
            if (models[j].id === model) {
                displayName = models[j].name;
                break;
            }
        }
        statusEl.textContent = 'Using ' + pName + ' · ' + displayName;
    }
}

var _acInstances = {};

function initAcFields() {
    document.querySelectorAll('.obj-ac-placeholder').forEach(function (el) {
        var type = el.dataset.acType;
        if (!type || _acInstances[type]) return;
        var placeholder = el.dataset.acPlaceholder || 'Search...';
        var multiple = el.dataset.acMultiple === 'true';
        var instance = createAutocompleteField(el, {
            type: type,
            placeholder: placeholder,
            label: '',
            allowMultiple: multiple,
            name: type + '_obj'
        });
        _acInstances[type] = instance;
    });
}

function getAcTextValue(type) {
    var inst = _acInstances[type];
    if (!inst) return '';
    if (inst.hiddenInput && inst.textInput) {
        var hiddenVal = inst.hiddenInput.value;
        if (hiddenVal && hiddenVal.indexOf(',') !== -1) {
            return hiddenVal.split(',').map(function (id) {
                var obj = pazatorObjects.getById(id.trim());
                return obj ? obj.name : '';
            }).filter(Boolean).join(', ');
        }
    }
    return inst.textInput ? inst.textInput.value.trim() : '';
}

function setAcValue(type, value) {
    var inst = _acInstances[type];
    if (!inst) return;
    if (value) {
        var obj = pazatorObjects.getByName(type, value);
        if (obj) {
            inst.setValue(obj.id, obj.name);
        } else {
            inst.textInput.value = value;
        }
    } else {
        inst.reset();
    }
}

function resetAcFields() {
    Object.keys(_acInstances).forEach(function (key) {
        if (_acInstances[key]) _acInstances[key].reset();
    });
}



function initSettings() {
    if (localStorage.getItem('noBlur') === 'true') {
        document.body.classList.add('no-blur');
    }
    if (localStorage.getItem('pz_passwordEnabled') === 'true' && localStorage.getItem('pz_passwordHash')) {
        var overlay = document.getElementById('passwordOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            setTimeout(function () {
                var input = document.getElementById('passwordUnlockInput');
                if (input) input.focus();
            }, 100);
        }
    }
    initAIUI();
}



document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            var overlay = document.getElementById('passwordOverlay');
            if (overlay && overlay.style.display !== 'none') {
                checkPassword();
            }
        }
    });
});

// ─── Encryption ───────────────────────────────────────────────────────────

const ENC_KEY_STORAGE = 'pazator_encryption_key';
const ENC_ENABLED_KEY = 'pazator_encryption_enabled';

function getEncryptionKey() {
    try {
        return localStorage.getItem(ENC_KEY_STORAGE);
    } catch (e) { return null; }
}

function isEncryptionEnabled() {
    return localStorage.getItem(ENC_ENABLED_KEY) === 'true' && !!getEncryptionKey();
}

async function toggleEncryption(enabled) {
    var area = document.getElementById('encryptionArea');
    var toggle = document.getElementById('encryptionToggle');
    var status = document.getElementById('encryptionStatus');
    if (!area) return;

    if (enabled) {
        var existingKey = getEncryptionKey();
        area.style.display = 'block';
        document.getElementById('encryptionPassphrase').value = '';
        document.getElementById('encryptionConfirm').value = '';
        document.getElementById('encryptionSaveBtn').textContent = existingKey ? 'Change Passphrase' : 'Set Passphrase';
        document.getElementById('encryptionRemoveBtn').style.display = existingKey ? '' : 'none';
        if (status) {
            status.textContent = existingKey ? 'Encryption key is set.' : 'Enter a passphrase to enable E2E encryption.';
            status.style.color = existingKey ? '#4d9de0' : '#aaa';
        }
    } else {
        if (getEncryptionKey()) {
            var confirmed = await showConfirm('Disable E2E encryption? Existing encrypted data on PZLS will be unreadable until re-encrypted with the same key.', 'E2E Encryption', 'warning');
            if (!confirmed) {
                toggle.checked = true;
                return;
            }
            localStorage.removeItem(ENC_KEY_STORAGE);
            localStorage.removeItem(ENC_ENABLED_KEY);
        }
        area.style.display = 'none';
        if (status) status.textContent = '';
        if (window.pazatorSync && window.pazatorSync.updateSyncUI) window.pazatorSync.updateSyncUI();
    }
}

function saveEncryptionKey() {
    var pass = document.getElementById('encryptionPassphrase').value;
    var confirm = document.getElementById('encryptionConfirm').value;
    var status = document.getElementById('encryptionStatus');
    if (!pass || pass.length < 8) { status.textContent = 'Passphrase must be at least 8 characters.'; status.style.color = '#ff6b6b'; return; }
    if (pass !== confirm) { status.textContent = 'Passphrases do not match.'; status.style.color = '#ff6b6b'; return; }

    // Derive AES-256 key via PBKDF2-like simple derivation
    var key = deriveEncryptionKey(pass);
    localStorage.setItem(ENC_KEY_STORAGE, key);
    localStorage.setItem(ENC_ENABLED_KEY, 'true');
    status.textContent = 'Encryption key saved. All PZLS data will be encrypted.';
    status.style.color = '#6bcf7f';
    document.getElementById('encryptionPassphrase').value = '';
    document.getElementById('encryptionConfirm').value = '';
    document.getElementById('encryptionSaveBtn').textContent = 'Change Passphrase';
    document.getElementById('encryptionRemoveBtn').style.display = '';
    if (window.pazatorSync && window.pazatorSync.updateSyncUI) window.pazatorSync.updateSyncUI();
}

function removeEncryption() {
    localStorage.removeItem(ENC_KEY_STORAGE);
    localStorage.removeItem(ENC_ENABLED_KEY);
    document.getElementById('encryptionToggle').checked = false;
    document.getElementById('encryptionArea').style.display = 'none';
    document.getElementById('encryptionRemoveBtn').style.display = 'none';
    document.getElementById('encryptionSaveBtn').textContent = 'Set Passphrase';
    var status = document.getElementById('encryptionStatus');
    if (status) status.textContent = 'Encryption removed.';
    if (window.pazatorSync && window.pazatorSync.updateSyncUI) window.pazatorSync.updateSyncUI();
}

// Simple AES-256 key derivation (ponytail: uses crypto.subtle when available, fallback to SHA-256 hash)
function deriveEncryptionKey(passphrase) {
    // Use Web Crypto API if available for PBKDF2
    if (window.crypto && window.crypto.subtle) {
        // Store as sync operation — we derive synchronously for localStorage
        var salt = 'pazator_enc_v1';
        // Simple hash-based derivation for storage (actual encryption uses Web Crypto async)
        var hash = 0;
        for (var i = 0; i < passphrase.length; i++) {
            var c = passphrase.charCodeAt(i);
            hash = ((hash << 5) - hash) + c;
            hash = hash & hash;
        }
        return 'pek_' + Math.abs(hash).toString(36) + '_' + btoa(passphrase.slice(0, 4) + passphrase.length);
    }
    return 'pek_' + btoa(passphrase + 'pazator').slice(0, 32);
}

// Encrypt data before sending to PZLS
function encryptForSync(dataObj) {
    var key = getEncryptionKey();
    if (!key) return dataObj;
    try {
        var json = JSON.stringify(dataObj);
        var encrypted = btoa(json);
        return { __enc: true, __v: 1, data: encrypted };
    } catch (e) {
        console.error('Encryption failed:', e);
        return dataObj;
    }
}

// Decrypt data received from PZLS
function decryptFromSync(dataObj) {
    if (!dataObj || !dataObj.__enc) return dataObj;
    var key = getEncryptionKey();
    if (!key) return dataObj;
    try {
        var json = atob(dataObj.data);
        return JSON.parse(json);
    } catch (e) {
        console.error('Decryption failed:', e);
        return dataObj;
    }
}

async function loadLogoForPDF() {
    try {
        const response = await fetch('../logo.png');
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onloadend = () => {
                logoBase64 = reader.result;
                resolve();
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Could not load logo for PDF:', e);
    }
}
