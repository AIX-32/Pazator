function checkAuthStatus() {
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn && typeof puter !== 'undefined' && puter.auth) {
        if (typeof puter.auth.isSignedIn === 'function') {
            if (puter.auth.isSignedIn()) {
                signInBtn.style.display = 'none';
            } else {
                signInBtn.style.display = 'block';
            }
        } else {
            signInBtn.style.display = 'none';
        }
    }

    // Fire-and-forget; ensures greeting is updated when auth changes.
    updateAccountSection();
}

document.getElementById('signInBtn')?.addEventListener('click', async () => {
    if (typeof puter === 'undefined' || !puter.auth) {
        showAlert('Sign in is not available without Puter. Use the Gemini API key in AI Configuration instead.', 'Info', 'info');
        return;
    }
    try {
        await puter.auth.signIn();
        setTimeout(checkAuthStatus, 1000);
    } catch (error) {
        console.error('Sign in failed:', error);
    }
});

if (typeof puter !== 'undefined' && puter.auth) {
    checkAuthStatus();

    if (typeof puter.auth.on === 'function') {
        puter.auth.on('signed-in', () => {
            checkAuthStatus();
        });

        puter.auth.on('signed-out', () => {
            checkAuthStatus();
        });
    }
} else {
    const authCheckInterval = setInterval(() => {
        if (typeof puter !== 'undefined' && puter.auth) {
            checkAuthStatus();
            clearInterval(authCheckInterval);
        }
    }, 500);

    setTimeout(() => {
        clearInterval(authCheckInterval);
    }, 10000);
}

console.log(' Initializing Pazator app...');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLogoDropdownListeners);
} else {
    setupLogoDropdownListeners();
}

function setupLogoDropdownListeners() {
    console.log(' Setting up logo dropdown event listeners...');

    const refreshNodesOption = document.getElementById('refreshNodesOption');
    const classifyOption = document.getElementById('classifyOption');
    const exportCsvOption = document.getElementById('exportCsvOption');
    const settingsOption = document.getElementById('settingsOption');
    const aboutOption = document.getElementById('aboutOption');

    console.log(' Refresh option exists:', !!refreshNodesOption);
    console.log(' Classify option exists:', !!classifyOption);
    console.log(' Export CSV option exists:', !!exportCsvOption);
    console.log(' Settings option exists:', !!settingsOption);
    console.log(' About option exists:', !!aboutOption);

    const aboutOverlay = document.getElementById('aboutOverlay');
    const aboutCard = document.getElementById('aboutCard');
    const closeAboutBtn = document.getElementById('closeAboutBtn');

    if (aboutOverlay && aboutCard) {
        function onAboutKeydown(event) {
            if (event.key === 'Escape') {
                setAboutOpen(false);
            }
        }

        function setAboutOpen(open) {
            aboutOverlay.classList.toggle('open', open);
            aboutOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
            if (open) {
                closeAboutBtn?.focus?.();
                document.addEventListener('keydown', onAboutKeydown);
            } else {
                document.removeEventListener('keydown', onAboutKeydown);
            }
        }

        closeAboutBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setAboutOpen(false);
        });

        aboutOverlay.addEventListener('click', (event) => {
            if (event.target === aboutOverlay) {
                setAboutOpen(false);
            }
        });

        aboutCard.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        aboutOption?.addEventListener('click', (event) => {
            event.stopPropagation();
            window.open('../docs/about_note.html', '_blank');
        });

        settingsOption?.addEventListener('click', (event) => {
            event.stopPropagation();
            openSettingsModal();
        });
    }

    if (refreshNodesOption) {
        console.log(' Adding event listener to Refresh Nodes');
        refreshNodesOption.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(' Logo dropdown: Refresh Nodes clicked');

            manualRefresh();
        });
    } else {
        console.error(' RefreshNodesOption not found!');
    }

    if (classifyOption) {
        console.log(' Adding event listener to Classify');

        const classificationDataSelect = document.getElementById('classificationDataset');
        const classificationConfidenceInput = document.getElementById('classificationConfidence');
        const classificationConfidenceValue = document.getElementById('classificationConfidenceValue');
        const classificationStatus = document.getElementById('classificationStatus');
        const classificationPreview = document.getElementById('classificationPreview');
        const applyClassifyBtn = document.getElementById('applyClassifyBtn');
        const cancelClassifyBtn = document.getElementById('cancelClassifyBtn');
        const resetClassifyBtn = document.getElementById('resetClassifyBtn');

        const datasetLabels = {
            all: 'All entries',
            humans: 'Humans only',
            others: 'Other entities',
            high_risk: 'High-risk humans',
            new_alerts: 'New alerts'
        };

        let classificationState = {
            active: false,
            dataset: 'all',
            confidence: 85
        };

        const getDatasetLabel = (key) => datasetLabels[key] || 'Custom collection';

        const updateClassificationPreview = () => {
            if (!classificationPreview) return;
            const label = getDatasetLabel(classificationState.dataset);
            const confidence = classificationState.confidence;
            classificationPreview.textContent = classificationState.active
                ? `Last applied: ${label} (${confidence}% confidence).`
                : `Targeting ${label} with ${confidence}% confidence when you apply classification.`;
        };

        const updateClassificationStatusText = () => {
            if (!classificationStatus) return;
            const label = getDatasetLabel(classificationState.dataset);
            classificationStatus.textContent = classificationState.active
                ? `Active classification · ${label} · ${classificationState.confidence}% confidence`
                : `Inactive · will target ${label} at ${classificationState.confidence}% confidence`;
        };

        const updateModalControls = () => {
            if (classificationDataSelect) {
                classificationDataSelect.value = classificationState.dataset;
            }
            if (classificationConfidenceInput) {
                classificationConfidenceInput.value = classificationState.confidence;
            }
            if (classificationConfidenceValue) {
                classificationConfidenceValue.textContent = `${classificationState.confidence}%`;
            }
        };

        const persistClassificationState = () => {
            try {
                localStorage.setItem('classificationState', JSON.stringify(classificationState));
            } catch (error) {
                console.warn('Unable to persist classification state:', error);
            }
        };

        const loadClassificationState = () => {
            try {
                const stored = JSON.parse(localStorage.getItem('classificationState') || 'null');
                if (stored && typeof stored === 'object') {
                    classificationState = { ...classificationState, ...stored };
                }
            } catch (error) {
                console.warn('Failed to load classification state:', error);
            }
        };

        const updateClassificationBanner = (active) => {
            if (!classificationBanner) return;
            if (active) {
                classificationBanner.style.display = 'flex';
                document.body.classList.add('classified-active');
            } else {
                classificationBanner.style.display = 'none';
                document.body.classList.remove('classified-active');
            }
        };

        const setClassificationVisuals = (active) => {
            if (!classifyOption) return;
            window.screenshotsDisabled = active;
            classifyOption.innerHTML = active
                ? '<i class="fas fa-shield-alt"></i><span>Classified</span>'
                : '<i class="fas fa-shield-alt"></i><span>Classify</span>';
            classifyOption.style.color = active ? '#ff6b6b' : '';
            updateClassificationBanner(active);
        };

        const closeClassifyModal = () => {
            if (!classifyModal) return;
            classifyModal.classList.add('hiding');
            setTimeout(() => {
                classifyModal.style.display = 'none';
                classifyModal.style.zIndex = '-1';
                classifyModal.classList.remove('hiding');
            }, 300);
        };

        const openClassifyModal = () => {
            if (!classifyModal) return;
            updateModalControls();
            updateClassificationPreview();
            updateClassificationStatusText();
            classifyModal.style.display = 'flex';
            classifyModal.style.zIndex = '1002';
        };

        classificationDataSelect?.addEventListener('change', () => {
            classificationState.dataset = classificationDataSelect.value;
            persistClassificationState();
            updateClassificationPreview();
            updateClassificationStatusText();
        });

        classificationConfidenceInput?.addEventListener('input', () => {
            const value = parseInt(classificationConfidenceInput.value, 10);
            if (!Number.isNaN(value)) {
                classificationState.confidence = value;
                classificationConfidenceValue.textContent = `${value}%`;
                persistClassificationState();
                updateClassificationPreview();
                updateClassificationStatusText();
            }
        });

        applyClassifyBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            classificationState.dataset = classificationDataSelect?.value || classificationState.dataset;
            classificationState.confidence = classificationConfidenceInput
                ? parseInt(classificationConfidenceInput.value, 10) || classificationState.confidence
                : classificationState.confidence;
            classificationState.active = true;
            persistClassificationState();
            updateClassificationPreview();
            updateClassificationStatusText();
            setClassificationVisuals(true);
            closeClassifyModal();
        });

        resetClassifyBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            classificationState = {
                active: false,
                dataset: 'all',
                confidence: 85
            };
            persistClassificationState();
            updateModalControls();
            updateClassificationPreview();
            updateClassificationStatusText();
            setClassificationVisuals(false);
        });

        cancelClassifyBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            closeClassifyModal();
        });

        classifyOption.addEventListener('click', (event) => {
            event.stopPropagation();
            console.log('️ Logo dropdown: Classify clicked');
            openClassifyModal();
        });

        loadClassificationState();
        updateModalControls();
        updateClassificationPreview();
        updateClassificationStatusText();
        setClassificationVisuals(classificationState.active);
    } else {
        console.error(' ClassifyOption not found!');
    }

    if (exportCsvOption) {
        exportCsvOption.addEventListener('click', (event) => {
            event.stopPropagation();

            if (!pazatorData || (!Array.isArray(pazatorData.humans) && !Array.isArray(pazatorData.others))) {
                showAlert('No data found to export yet.', 'Notice', 'info');
                return;
            }

            const humans = Array.isArray(pazatorData.humans) ? pazatorData.humans : [];
            const others = Array.isArray(pazatorData.others) ? pazatorData.others : [];

            if (humans.length === 0 && others.length === 0) {
                showAlert('No entries to export yet.', 'Notice', 'info');
                return;
            }

            const headers = ['Name', 'Type', 'Gender', 'Birth Date', 'Marital Status', 'Workplace', 'Nationality', 'Country of Origin', 'Immigration Status', 'Languages', 'Ethnicity', 'Religion', 'Political Views', 'Credit Score', 'Social Class', 'Income Level', 'Education Level', 'Threat Level', 'Notes', 'Tags', 'Friends', 'Family'];

            const csvEscape = (value) => {
                const raw = value == null ? '' : String(value);
                if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
                    return `"${raw.replace(/"/g, '""')}"`;
                }
                return raw;
            };

            const joinList = (value) => {
                if (!value) return '';
                if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
                return String(value);
            };

            const rows = [];
            rows.push(headers.map(csvEscape).join(','));

            humans.forEach(human => {
                rows.push([
                    human?.name || '',
                    '',
                    human?.gender || '',
                    human?.birthDate || '',
                    human?.maritalStatus || '',
                    human?.workplace || '',
                    human?.nationality || '',
                    human?.countryOfOrigin || '',
                    human?.immigrationStatus || '',
                    human?.languages || '',
                    human?.ethnicity || '',
                    human?.religion || '',
                    human?.politicalViews || '',
                    human?.credit !== undefined ? String(human.credit) : '',
                    human?.socialClass || '',
                    human?.incomeLevel || '',
                    human?.educationLevel || '',
                    human?.threatLevel || '',
                    human?.extraNotes || human?.notes || '',
                    joinList(human?.tags),
                    joinList(human?.friends),
                    joinList(human?.family)
                ].map(csvEscape).join(','));
            });

            others.forEach(other => {
                rows.push([
                    other?.name || '',
                    other?.type || '',
                    '',
                    other?.note || other?.notes || '',
                    '',
                    '',
                    ''
                ].map(csvEscape).join(','));
            });

            const pad2 = (n) => String(n).padStart(2, '0');
            const now = new Date();
            const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
            const filename = `pazator-export-${stamp}.csv`;

            const csvText = rows.join('\n');
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);

            showAlert(`Exported ${humans.length} humans and ${others.length} companies/organizations to CSV.`, 'Success', 'success');
        });
    } else {
        console.error(' ExportCsvOption not found!');
    }
}

console.log(' Checking localStorage availability...');
if (typeof (Storage) !== "undefined") {
    console.log(' localStorage is available');
} else {
    console.error(' localStorage is not available');
}

try {
    loadData();
    console.log(' Data loading completed');

    renderTags();
    console.log(' Tags rendered');

    initTabs();
    console.log(' Tabs initialized');

    startAutoSave();
    console.log(' Auto-save system started');

    if (window.pazatorWorkflow && !window.pazatorWorkflow._initialized) {
        window.pazatorWorkflow.init();
        window.pazatorWorkflow._initialized = true;
        console.log(' Workflow engine initialized');
    }

    if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
        saveData(true);
        console.log(' Initial data saved');
    }

    console.log(' Pazator app fully initialized with enhanced data persistence');
    console.log(` Current data: ${pazatorData.humans.length} humans, ${pazatorData.others.length} others`);

} catch (initError) {
    console.error(' Fatal initialization error:', initError);
    pazatorData = { humans: [], others: [] };
    window.pazatorData = pazatorData;
    tags = [];
    renderObjectCanvas();
    renderTags();
    console.log('️ Using fallback initialization');
}

const RECENT_SEARCHES_KEY = 'pazatorRecentSearches';
