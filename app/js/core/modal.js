function initAgentSystem() {
    if (!agentSystem) {
        agentSystem = new window.AgentSystem();
    }
    return agentSystem;
}

function toggleAgentPanel() {
    const panel = document.getElementById('agentPanel');
    if (!panel) return;
    panel.classList.toggle('collapsed');
}

document.getElementById('agentPanelToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAgentPanel();
});

document.getElementById('agentPanelClose')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('agentPanel').style.display = 'none';
    agentSystem = null;
});

document.querySelector('.agent-panel-header')?.addEventListener('click', (e) => {
    if (e.target.closest('#agentPanelToggle') || e.target.closest('#agentPanelClose')) return;
    toggleAgentPanel();
});

// Clean Modal UI Functions
const cleanModal = document.getElementById('cleanModal');
const modalIcon = document.getElementById('modalIcon');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');
const modalBackdrop = document.querySelector('.clean-modal-backdrop');

function showModal({ title, message, html, type = 'info', buttons = [] }) {
    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        question: 'fa-question-circle'
    };

    modalIcon.className = `clean-modal-icon ${type}`;
    modalIcon.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i>`;
    modalTitle.textContent = title;

    if (html) {
        modalBody.innerHTML = html;
        modalBody.classList.add('html-content');
    } else {
        modalBody.textContent = message || '';
        modalBody.classList.remove('html-content');
    }

    modalActions.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = btn.primary ? 'clean-modal-btn-primary' : 'clean-modal-btn';
        if (btn.danger) button.className = 'clean-modal-btn-danger';
        button.textContent = btn.text;
        button.onclick = () => {
            hideModal();
            if (btn.onClick) btn.onClick();
        };
        modalActions.appendChild(button);
    });

    cleanModal.classList.add('active');
    if (html) {
        cleanModal.classList.add('wide');
    } else {
        cleanModal.classList.remove('wide');
    }
}

function hideModal() {
    cleanModal.classList.remove('active');
}

modalBackdrop.addEventListener('click', hideModal);

function showAlert(message, title = 'Notice', type = 'info') {
    showModal({ title, message, type, buttons: [{ text: 'OK', primary: true }] });
}

function showConfirm(message, title = 'Confirm', type = 'question') {
    return new Promise((resolve) => {
        showModal({
            title,
            message,
            type,
            buttons: [
                { text: 'Cancel', primary: false, onClick: () => resolve(false) },
                { text: 'Confirm', primary: true, danger: true, onClick: () => resolve(true) }
            ]
        });
    });
}
