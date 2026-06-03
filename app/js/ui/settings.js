function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const noBlurToggle = document.getElementById('noBlurToggle');
    const skipIntroToggle = document.getElementById('skipIntroToggle');
    const passwordToggle = document.getElementById('passwordLockToggle');

    noBlurToggle.checked = localStorage.getItem('noBlur') === 'true';
    skipIntroToggle.checked = localStorage.getItem('skipIntro') === 'true';
    passwordToggle.checked = localStorage.getItem('pz_passwordEnabled') === 'true';

    modal.classList.add('active');

    modal.onclick = function (e) {
        if (e.target === modal) {
            closeSettingsModal();
        }
    };
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
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

// Password lock functions
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

// Initialize settings on load
function initGeminiUI() {
    var apiKeyInput = document.getElementById('geminiApiKeyInput');
    var modelSelect = document.getElementById('geminiModelSelect');
    var statusEl = document.getElementById('geminiStatus');

    if (!modelSelect || !apiKeyInput) return;

    if (window.pazatorGemini && window.pazatorGemini.models) {
        modelSelect.innerHTML = window.pazatorGemini.models.map(function (m) {
            return '<option value="' + m.id + '">' + m.name + '</option>';
        }).join('');
    }

    var savedKey = window.pazatorGemini ? window.pazatorGemini.getApiKey() : '';
    var savedModel = window.pazatorGemini ? window.pazatorGemini.getModel() : '';

    apiKeyInput.value = savedKey;
    modelSelect.value = savedModel;

    updateGeminiStatus();

    apiKeyInput.addEventListener('input', function () {
        if (window.pazatorGemini) {
            window.pazatorGemini.setApiKey(this.value);
        }
        updateGeminiStatus();
    });

    modelSelect.addEventListener('change', function () {
        if (window.pazatorGemini) {
            window.pazatorGemini.setModel(this.value);
        }
    });
}

function updateGeminiStatus() {
    var statusEl = document.getElementById('geminiStatus');
    if (!statusEl) return;
    var key = window.pazatorGemini ? window.pazatorGemini.getApiKey() : '';
    var model = window.pazatorGemini ? window.pazatorGemini.getModel() : '';

    statusEl.className = 'gemini-status';

    if (!key) {
        statusEl.textContent = 'No API key configured';
    } else {
        statusEl.classList.add('configured');
        var modelName = model || 'gemini-3.1-flash-lite';
        var displayName = modelName;
        if (window.pazatorGemini && window.pazatorGemini.models) {
            for (var j = 0; j < window.pazatorGemini.models.length; j++) {
                if (window.pazatorGemini.models[j].id === modelName) {
                    displayName = window.pazatorGemini.models[j].name;
                    break;
                }
            }
        }
        statusEl.textContent = 'Using ' + displayName;
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
    initGeminiUI();
}

// Allow pressing Enter in the unlock input
// Allow pressing Enter in the unlock input
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
