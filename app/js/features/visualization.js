function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

aiInput.addEventListener('keydown', debounce((e) => {
    if ((e.key === 'Enter' && !e.shiftKey) && !aiSendBtn.disabled) {
        e.preventDefault();
        const command = aiInput.value.trim();
        if (command) {
            aiInput.value = '';
            aiSendBtn.disabled = true;
            setAiSendLoading(true);
            showAiTypingIndicator();
            processAICommand(command);
        }
    }
}, 100));

aiInput.addEventListener('input', debounce(() => {
    aiSendBtn.disabled = aiInput.value.trim() === '';
}, 50));

document.getElementById('historyBtn')?.addEventListener('click', () => {
    updateChatHistoryPanel();
    const panel = document.querySelector('.ai-chat-history-panel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }
});

document.getElementById('favoritesBtn')?.addEventListener('click', () => {
    const quickCmds = [
        'Add a new human named [name] born on [date]',
        'Show me all humans',
        'Analyze risk for all entries',
        'Find connections between [name] and [name]',
        'Create a case about [topic]',
        'Add a company named [name]',
        'Generate 5 random people',
        'Create tags: [tag1], [tag2], [tag3]',
        'Export all data as CSV',
        'Who has the highest threat level?'
    ];
    const cmd = quickCmds[Math.floor(Math.random() * quickCmds.length)];
    aiInput.value = cmd;
    aiInput.focus();
    showFloatingNotification('Quick command loaded — press Enter', 'info');
});

const chatOptionsMenu = document.getElementById('chatOptionsMenu');

chatMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    chatOptionsMenu.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!chatMenuBtn.contains(e.target) && !chatOptionsMenu.contains(e.target)) {
        chatOptionsMenu.classList.remove('active');
    }
});

// Global modal backdrop click-to-close
document.addEventListener('click', function (e) {
    var modal = e.target.closest('.modal, .ai-chat-modal, .detail-view');
    if (!modal || e.target !== modal) return;
    if (modal.classList.contains('hiding')) return;
    if (modal.classList.contains('ai-chat-modal') || modal.classList.contains('detail-view')) {
        modal.classList.add('hiding');
        setTimeout(function () {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
            modal.classList.remove('hiding');
            if (modal.classList.contains('ai-chat-modal')) modal.classList.remove('debug');
        }, 300);
    } else {
        modal.style.display = 'none';
    }
});

document.getElementById('clearChatOption')?.addEventListener('click', async () => {
    if (aiChatHistory.length === 0 && aiChatMessages.children.length <= 1) {
        chatOptionsMenu.classList.remove('active');
        return;
    }
    const confirmed = await showConfirm('Clear the entire conversation? This cannot be undone.', 'Clear Chat', 'warning');
    if (confirmed) {
        startNewChat();
        chatOptionsMenu.classList.remove('active');
        showFloatingNotification('Chat cleared', 'info');
    } else {
        chatOptionsMenu.classList.remove('active');
    }
});


document.getElementById('humanForm').addEventListener('submit', (e) => {
    e.preventDefault();

    var id = document.getElementById('humanId').value;
    var name = document.getElementById('humanName').value;
    var gender = getAcTextValue('gender');
    var birthDate = document.getElementById('birthDate').value;
    var workplace = getAcTextValue('workplace');
    var credit = document.getElementById('credit').value;
    if (credit !== '' && (isNaN(credit) || credit < 0 || credit > 370)) {
        showAlert('Credit score must be between 0 and 370.', 'Validation Error', 'error');
        return;
    }
    var socialClass = getAcTextValue('socialClass');
    var extraNotes = document.getElementById('humanExtraNotes').value;
    var maritalStatus = getAcTextValue('maritalStatus');
    var nationality = getAcTextValue('nationality');
    var countryOfOrigin = getAcTextValue('countryOfOrigin');
    var immigrationStatus = getAcTextValue('immigrationStatus');
    var languages = getAcTextValue('language');
    var ethnicity = getAcTextValue('ethnicity');
    var religion = getAcTextValue('religion');
    var politicalViews = getAcTextValue('politicalView');
    var threatLevel = getAcTextValue('threatLevel');
    var incomeLevel = getAcTextValue('incomeLevel');
    var educationLevel = getAcTextValue('educationLevel');

    const friendsSelect = document.getElementById('friends');
    const familySelect = document.getElementById('family');

    const selectedFriends = Array.from(friendsSelect.selectedOptions).map(option => option.value);
    const selectedFamily = Array.from(familySelect.selectedOptions).map(option => option.value);

    const tagsSelect = document.getElementById('humanTags');
    const selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);

    const trackerSelect = document.getElementById('humanTrackerSelect');
    const trackerAliasInput = document.getElementById('humanTrackerAlias');
    const trackerAlias = trackerAliasInput ? trackerAliasInput.value.trim() : '';
    const trackerSelectedName = trackerSelect ? trackerSelect.value : '';

    if (id) {

        const humanIndex = window.pazatorStore ? pazatorStore.findHumanIndexById(id) : pazatorData.humans.findIndex(h => h.id === id);
        if (humanIndex !== -1) {
            const existingImage = pazatorData.humans[humanIndex].imagePreview;

            pazatorData.humans[humanIndex] = {
                id,
                name,
                gender,
                birthDate,
                workplace,
                credit: credit ? parseFloat(credit) : undefined,
                socialClass: socialClass || undefined,
                friends: selectedFriends,
                family: selectedFamily,
                extraNotes,
                tags: selectedTags,
                imagePreview: existingImage,
                trackerAlias: trackerAlias || trackerSelectedName || pazatorData.humans[humanIndex].trackerAlias || undefined,
                trackerLinkedAt: trackerAlias && !pazatorData.humans[humanIndex].trackerAlias ? new Date().toISOString() : pazatorData.humans[humanIndex].trackerLinkedAt || undefined,
                maritalStatus: maritalStatus || undefined,
                nationality: nationality || undefined,
                countryOfOrigin: countryOfOrigin || undefined,
                immigrationStatus: immigrationStatus || undefined,
                languages: languages || undefined,
                ethnicity: ethnicity || undefined,
                religion: religion || undefined,
                politicalViews: politicalViews || undefined,
                threatLevel: threatLevel || undefined,
                incomeLevel: incomeLevel || undefined,
                educationLevel: educationLevel || undefined
            };
        }
    } else {

        const newHuman = {
            id: generatePersonId(name),
            name,
            gender,
            birthDate,
            workplace,
            credit: credit ? parseFloat(credit) : undefined,
            socialClass: socialClass || undefined,
            friends: selectedFriends,
            family: selectedFamily,
            extraNotes,
            tags: selectedTags,
            imagePreview: null,
            chats: [],
            cases: [],
            trackerAlias: trackerAlias || trackerSelectedName || undefined,
            trackerLinkedAt: (trackerAlias || trackerSelectedName) ? new Date().toISOString() : undefined,
            maritalStatus: maritalStatus || undefined,
            nationality: nationality || undefined,
            countryOfOrigin: countryOfOrigin || undefined,
            immigrationStatus: immigrationStatus || undefined,
            languages: languages || undefined,
            ethnicity: ethnicity || undefined,
            religion: religion || undefined,
            politicalViews: politicalViews || undefined,
            threatLevel: threatLevel || undefined,
            incomeLevel: incomeLevel || undefined,
            educationLevel: educationLevel || undefined
        };

        pazatorData.humans.push(newHuman);
    }

    const imageFile = document.getElementById('humanImage').files[0];
    if (imageFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (id) {
                const humanIndex = window.pazatorStore ? pazatorStore.findHumanIndexById(id) : pazatorData.humans.findIndex(h => h.id === id);
                if (humanIndex !== -1) {
                    pazatorData.humans[humanIndex].imagePreview = e.target.result;
                }
            } else {
                const lastIndex = pazatorData.humans.length - 1;
                pazatorData.humans[lastIndex].imagePreview = e.target.result;
            }

            markDataChanged();
            humanModal.style.display = 'none';
            humanModal.style.zIndex = '-1';
            document.getElementById('humanForm').reset();
            resetAcFields();
        };
        reader.readAsDataURL(imageFile);
    } else {
        markDataChanged();
        humanModal.style.display = 'none';
        humanModal.style.zIndex = '-1';
        document.getElementById('humanForm').reset();
        resetAcFields();
    }
});

document.getElementById('otherForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('otherId').value;
    const name = document.getElementById('otherName').value;
    const note = document.getElementById('otherNote').value;

    if (id) {

        const otherIndex = pazatorData.others.findIndex(o => o.id === id);
        if (otherIndex !== -1) {

            const existingImage = pazatorData.others[otherIndex].imagePreview;

            pazatorData.others[otherIndex] = {
                id,
                name,
                note,
                imagePreview: existingImage
            };
        }
    } else {

        const newOther = {
            id: Date.now().toString(),
            name,
            note,
            imagePreview: null
        };

        pazatorData.others.push(newOther);
    }

    const imageFile = document.getElementById('otherImage').files[0];
    if (imageFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (id) {

                const otherIndex = pazatorData.others.findIndex(o => o.id === id);
                if (otherIndex !== -1) {
                    pazatorData.others[otherIndex].imagePreview = e.target.result;
                }
            } else {

                const lastIndex = pazatorData.others.length - 1;
                pazatorData.others[lastIndex].imagePreview = e.target.result;
            }

            markDataChanged();
            otherModal.style.display = 'none';
            otherModal.style.zIndex = '-1';
            document.getElementById('otherForm').reset();
        };
        reader.readAsDataURL(imageFile);
    } else {
        markDataChanged();
        otherModal.style.display = 'none';
        otherModal.style.zIndex = '-1';
        document.getElementById('otherForm').reset();
    }
});

var _resizeTick = false;
window.addEventListener('resize', function () {
    if (!_resizeTick) {
        requestAnimationFrame(function () {
            renderObjectCanvas();
            _resizeTick = false;
        });
        _resizeTick = true;
    }
});

let zoomTicking = false;

function updateZoomTransform() {
    webContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
    zoomTicking = false;
}

function requestZoomTransformUpdate() {
    if (!zoomTicking) {
        requestAnimationFrame(updateZoomTransform);
        zoomTicking = true;
    }
}

let initialPinchDistance = 0;
let initialScale = 1;

webContainer.addEventListener('wheel', (e) => {
    if (e.target.closest('.obj-field, .obj-type-strip, .obj-detail-panel')) return;

    e.preventDefault();

    const rect = webContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomIntensity = 0.05;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoom = Math.exp(wheel * zoomIntensity);

    const newScale = currentScale * zoom;

    if (newScale >= minScale && newScale <= maxScale) {

        const translateX = mouseX - (mouseX - currentTranslateX) * (newScale / currentScale);
        const translateY = mouseY - (mouseY - currentTranslateY) * (newScale / currentScale);

        currentScale = newScale;
        currentTranslateX = translateX;
        currentTranslateY = translateY;

        requestZoomTransformUpdate();
    }
});

webContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        initialScale = currentScale;
        e.preventDefault();
    }
});

webContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);

        const scaleFactor = currentPinchDistance / initialPinchDistance;
        const newScale = initialScale * scaleFactor;

        if (newScale >= minScale && newScale <= maxScale) {
            currentScale = newScale;
            requestZoomTransformUpdate();
        }

        e.preventDefault();
    }
});

let dragTicking = false;
let webContentTransitionBeforeDrag = '';
let dragCandidate = false;
const DRAG_START_THRESHOLD_PX = 6;

function updateDragTransform() {
    webContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
    dragTicking = false;
}

function requestDragTransformUpdate() {
    if (!dragTicking) {
        requestAnimationFrame(updateDragTransform);
        dragTicking = true;
    }
}

webContainer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    // Don't start panning if the user is trying to interact with a node/UI element.
    const ignoreDrag = Boolean(
        e.target?.closest?.(
            '.data-node, .node-label, .graph-node, .connection-node, button, a, input, textarea, select, label, .modal, .clean-modal, .obj-tile, .obj-cluster, .obj-field, .obj-detail-panel, .obj-type-chip, .obj-canvas-search'
        )
    );
    if (ignoreDrag) return;

    dragCandidate = true;
    isDragging = false;

    startX = e.clientX;
    startY = e.clientY;
    startTranslateX = currentTranslateX;
    startTranslateY = currentTranslateY;
});

webContainer.addEventListener('mousemove', (e) => {
    if (!dragCandidate && !isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDragging) {
        if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) return;
        isDragging = true;
        webContainer.classList.add('dragging');
        webContentTransitionBeforeDrag = webContent.style.transition;
        webContent.style.transition = 'none';
    }

    currentTranslateX = startTranslateX + dx;
    currentTranslateY = startTranslateY + dy;

    requestDragTransformUpdate();

    e.preventDefault();
});

webContainer.addEventListener('mouseup', (e) => {
    dragCandidate = false;
    if (!isDragging) return;
    isDragging = false;
    webContainer.classList.remove('dragging');
    webContent.style.transition = webContentTransitionBeforeDrag || '';
});

webContainer.addEventListener('mouseleave', () => {
    dragCandidate = false;
    if (!isDragging) return;
    isDragging = false;
    webContainer.classList.remove('dragging');
    webContent.style.transition = webContentTransitionBeforeDrag || '';
});

addTagBtn.addEventListener('click', () => {
    const tagText = tagInput.value.trim();
    if (tagText && !tags.includes(tagText)) {
        tags.push(tagText);
        renderTags();
        tagInput.value = '';
    }
});
