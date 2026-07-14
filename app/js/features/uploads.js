const chatUploadBtn = document.getElementById('chatUploadBtn');
const chatUploadModal = document.getElementById('chatUploadModal');
const chatSource = document.getElementById('chatSource');
const chatFile = document.getElementById('chatFile');
const browseFileBtn = document.getElementById('browseFileBtn');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const chatContent = document.getElementById('chatContent');
const chatParticipants = document.getElementById('chatParticipants');
const chatContext = document.getElementById('chatContext');
const cancelChatUploadBtn = document.getElementById('cancelChatUploadBtn');
const uploadChatBtn = document.getElementById('uploadChatBtn');
const classifyModal = document.getElementById('classifyModal');

const dataUploadModal = document.getElementById('dataUploadModal');
const dataFile = document.getElementById('dataFile');
const cancelDataUploadBtn = document.getElementById('cancelDataUploadBtn');
const uploadDataBtn = document.getElementById('uploadDataBtn');
const dataUploadBtn = document.getElementById('dataUploadBtn');

function closeDataUploadModal() {
    if (!dataUploadModal) return;
    dataUploadModal.classList.add('hiding');
    setTimeout(() => {
        dataUploadModal.style.display = 'none';
        dataUploadModal.style.zIndex = '-1';
        dataUploadModal.classList.remove('hiding');
    }, 300);

    if (dataFile) dataFile.value = '';
    const fi = document.getElementById('dataUploadFileInfo');
    if (fi) fi.style.display = 'none';
    const dz = document.getElementById('dataUploadDropZone');
    if (dz) dz.classList.remove('has-file');
    if (uploadDataBtn) {
        uploadDataBtn.disabled = false;
        uploadDataBtn.innerHTML = '<span>Upload Data</span><i class="fas fa-caret-down"></i>';
    }
    closeUploadDropdown();
}

chatUploadBtn.addEventListener('click', () => {
    [humanModal, otherModal, detailViewModal, aiChatModal, typeModal].forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });

    document.getElementById('chatUploadForm').reset();
    fileNameDisplay.style.display = 'none';
    chatParticipants.innerHTML = '<p style="color: #777; text-align: center; margin: 20px 0;">Loading participants...</p>';

    chatUploadModal.style.display = 'flex';
    chatUploadModal.style.zIndex = '1000';

    setTimeout(loadChatParticipants, 500);
});

document.getElementById('chatUploadBtnSidebar')?.addEventListener('click', function () {
    document.getElementById('chatUploadBtn').click();
});

dataUploadBtn.addEventListener('click', () => {
    [humanModal, otherModal, detailViewModal, aiChatModal, typeModal, chatUploadModal].forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });

    if (dataFile) dataFile.value = '';
    const fi = document.getElementById('dataUploadFileInfo');
    if (fi) fi.style.display = 'none';
    const dz = document.getElementById('dataUploadDropZone');
    if (dz) dz.classList.remove('has-file');

    dataUploadModal.style.display = 'flex';
    dataUploadModal.style.zIndex = '1000';
});

const aiImportModal = document.getElementById('aiImportModal');
const aiImportBtn = document.getElementById('aiImportBtn');
const aiImportText = document.getElementById('aiImportText');
const aiImportDropZone = document.getElementById('aiImportDropZone');
const aiImportFileInput = document.getElementById('aiImportFileInput');
const aiImportFileList = document.getElementById('aiImportFileList');
const aiImportType = document.getElementById('aiImportType');
const aiImportStatus = document.getElementById('aiImportStatus');
const aiImportStatusText = document.getElementById('aiImportStatusText');
const cancelAiImportBtn = document.getElementById('cancelAiImportBtn');
const runAiImportBtn = document.getElementById('runAiImportBtn');

let aiImportFiles = [];

function openAiImportModal() {
    [humanModal, otherModal, detailViewModal, aiChatModal, typeModal, chatUploadModal, dataUploadModal].forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });
    aiImportModal.style.display = 'flex';
    aiImportModal.style.zIndex = '1000';
}

function closeAiImportModal() {
    if (!aiImportModal) return;
    aiImportModal.classList.add('hiding');
    setTimeout(() => {
        aiImportModal.style.display = 'none';
        aiImportModal.style.zIndex = '-1';
        aiImportModal.classList.remove('hiding');
    }, 300);
    aiImportFiles = [];
    aiImportText.value = '';
    aiImportStatus.style.display = 'none';
    if (aiImportFileInput) aiImportFileInput.value = '';
    if (aiImportFileList) aiImportFileList.innerHTML = '';
    if (runAiImportBtn) {
        runAiImportBtn.disabled = false;
        runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
    }
}

aiImportBtn?.addEventListener('click', openAiImportModal);
cancelAiImportBtn?.addEventListener('click', closeAiImportModal);
aiImportModal?.querySelector('.close')?.addEventListener('click', closeAiImportModal);

aiImportDropZone?.addEventListener('click', (e) => {
    if (e.target === aiImportDropZone || e.target.closest('.ai-import-hint')) {
        aiImportFileInput?.click();
    }
});

aiImportDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    aiImportDropZone.classList.add('dragover');
});

aiImportDropZone?.addEventListener('dragleave', () => {
    aiImportDropZone.classList.remove('dragover');
});

aiImportDropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    aiImportDropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files || []);
    handleAiImportFiles(files);
});

aiImportFileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    handleAiImportFiles(files);
});

function handleAiImportFiles(files) {
    const validTypes = ['.txt', '.json', '.csv', '.xml', '.html'];
    files.forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validTypes.includes(ext) && !file.type.startsWith('text/') && file.type !== 'application/json') {
            showAlert(`Unsupported file type: ${file.name}`, 'Error', 'error');
            return;
        }
        if (!aiImportFiles.some(f => f.name === file.name)) {
            aiImportFiles.push(file);
        }
    });
    renderAiImportFileList();
}

function renderAiImportFileList() {
    if (!aiImportFileList) return;
    aiImportFileList.innerHTML = aiImportFiles.map((file, index) => `
        <div class="ai-import-file-item">
            <i class="fas fa-file-alt"></i>
            <span>${file.name}</span>
            <span class="remove-file" data-index="${index}">&times;</span>
        </div>
    `).join('');

    aiImportFileList.querySelectorAll('.remove-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            aiImportFiles.splice(index, 1);
            renderAiImportFileList();
        });
    });
}

async function extractTextFromFiles() {
    let combinedText = '';

    for (const file of aiImportFiles) {
        try {
            const text = await file.text();
            combinedText += `\n--- ${file.name} ---\n` + text;
        } catch (error) {
            console.error(`Error reading file ${file.name}:`, error);
        }
    }

    return combinedText;
}

const AI_IMPORT_HEADERS = ['Name', 'Type', 'Gender', 'Birth Date', 'Marital Status', 'Workplace', 'Nationality', 'Country of Origin', 'Immigration Status', 'Languages', 'Ethnicity', 'Religion', 'Political Views', 'Credit Score', 'Social Class', 'Income Level', 'Education Level', 'Threat Level', 'Notes', 'Tags', 'Friends', 'Family'];

function getAiImportSystemPrompt(importType) {
    let typeInstruction = '';
    if (importType === 'humans') {
        typeInstruction = '- Type must always be blank (these are people).';
    } else if (importType === 'orgs') {
        typeInstruction = '- Type must always be filled (Company, Organization, Government, etc.).';
    } else {
        typeInstruction = '- For humans: Type must be blank. For orgs: Type must be filled (Company, Organization, Government, etc.).';
    }

    return `You convert unstructured intel text into a CSV that Pazator can import.

OUTPUT RULES:
- Output ONLY raw CSV text (no markdown, no code fences).
- Use comma as delimiter.
- First row MUST be headers EXACTLY:
Name,Type,Gender,Birth Date,Marital Status,Workplace,Nationality,Country of Origin,Immigration Status,Languages,Ethnicity,Religion,Political Views,Credit Score,Social Class,Income Level,Education Level,Threat Level,Notes,Tags,Friends,Family
${typeInstruction}
- Birth Date must be YYYY-MM-DD if known; otherwise blank.
- Credit Score must be a number 0-370 if known.
- Social Class options: low class, medium class, high class, 1%.
- Income Level: Below Poverty, Low, Middle, Upper Middle, High, Wealthy.
- Education Level: No Formal Education, Primary School, High School, Associate's Degree, Bachelor's Degree, Master's Degree, Doctorate, Post-Doctorate.
- Threat Level: None, Low, Medium, High, Critical.
- Tags/Friends/Family must be comma-separated within the cell.
- Extract as much info as possible. If unsure, leave blank.
- Escape quotes correctly if needed.
- Be thorough - extract names, relationships, locations, jobs, and any other relevant info.`;
}

async function runAiImport() {
    const fileText = await extractTextFromFiles();
    const pasteText = aiImportText?.value?.trim() || '';
    const rawInput = (fileText + '\n' + pasteText).trim();

    if (!rawInput) {
        showAlert('Please upload files or paste text first.', 'Missing Input', 'warning');
        return;
    }

    if (typeof window.geminiChat !== 'function' || !window.pazatorGemini.getApiKey()) {
        showAlert('Gemini AI is not configured. Add your API key in the sidebar first.', 'Error', 'error');
        return;
    }

    runAiImportBtn.disabled = true;
    runAiImportBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Importing...';

    try {
        const system = getAiImportSystemPrompt(aiImportType?.value || 'auto');

        const aiResponse = await geminiChat([
            { role: "system", content: system },
            { role: "user", content: rawInput }
        ]);

        let csvText = aiResponse?.content ? aiResponse.content : aiResponse;
        csvText = extractCSVFromAIResponse(csvText);

        aiImportStatus.style.display = 'flex';
        aiImportStatusText.textContent = 'CSV generated';

        const data = parseCSV(csvText, { expectedHeaders: AI_IMPORT_HEADERS, strictHeaderOrder: true });
        const result = processCSVData(data);

        closeAiImportModal();
        showAlert(`AI import complete: ${result.humans} humans, ${result.others} orgs.`, 'Success', 'success');

        markDataChanged();
        renderObjectCanvas();
    } catch (error) {
        console.error('AI import error:', error);
        const message = error?.message ? error.message : String(error);

        const retry = await showConfirm(
            `AI import failed: ${message}\n\nRetry?`,
            'AI Import Failed',
            'question'
        );

        if (retry) {
            runAiImportBtn.disabled = false;
            runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
            return await runAiImport();
        }

        showAlert(`AI import failed: ${message}`, 'Error', 'error');
    } finally {
        runAiImportBtn.disabled = false;
        runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
    }
}

runAiImportBtn?.addEventListener('click', runAiImport);

browseFileBtn.addEventListener('click', () => {
    chatFile.click();
});

document.getElementById('analyzeDiscordBtn')?.addEventListener('click', async () => {
    const chatContent = document.getElementById('chatContent').value.trim();

    if (!chatContent) {
        showAlert('Please paste Discord chat content first.');
        return;
    }

    const analyzeBtn = document.getElementById('analyzeDiscordBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing... ';

    try {
        const result = await ChatAnalysisService.analyze(chatContent, 'discord');

        let message = `=== Discord Chat Security Analysis ===\n\n`;
        message += `Suspicious: ${result.isSuspicious ? 'YES' : 'NO'}\n`;
        message += `Risk Level: ${result.riskLevel?.toUpperCase() || 'UNKNOWN'}\n\n`;

        if (result.redFlags && result.redFlags.length > 0) {
            message += "Red Flags Found:\n" + result.redFlags.map(flag => "• " + flag).join("\n") + "\n\n";
        }

        if (result.entities) {
            if (result.entities.urls?.length > 0) {
                message += `URLs Found: ${result.entities.urls.length}\n`;
            }
            if (result.entities.emails?.length > 0) {
                message += `Emails Found: ${result.entities.emails.length}\n`;
            }
            if (result.entities.phones?.length > 0) {
                message += `Phone Numbers Found: ${result.entities.phones.length}\n`;
            }
            if (result.entities.urls?.length > 0 || result.entities.emails?.length > 0 || result.entities.phones?.length > 0) {
                message += '\n';
            }
        }

        message += `Summary: ${result.summary || 'No specific concerns identified'}\n\n`;

        if (result.recommendations && result.recommendations.length > 0) {
            message += `Recommendations:\n${result.recommendations.map(rec => `• ${rec}`).join('\n')}`;
        }

        showAlert(message, 'Analysis Result', 'info');

    } catch (error) {
        console.error('Error analyzing Discord chat:', error);
        showAlert('Error analyzing chat. Please try again.', 'Error', 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Discord Chat for Suspicious Content';
    }
});

chatFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = `Selected: ${file.name}`;
        fileNameDisplay.style.display = 'block';

        const reader = new FileReader();
        reader.onload = (event) => {
            chatContent.value = event.target.result;
        };
        reader.readAsText(file);
    }
});

function loadChatParticipants() {
    if (pazatorData.humans.length === 0) {
        chatParticipants.innerHTML = '<p style="color: #777; text-align: center; margin: 20px 0;">No people in your database yet. Add some people first.</p>';
        return;
    }

    chatParticipants.innerHTML = '';

    pazatorData.humans.forEach(human => {
        const participantDiv = document.createElement('div');
        participantDiv.style.display = 'flex';
        participantDiv.style.alignItems = 'center';
        participantDiv.style.marginBottom = '10px';
        participantDiv.style.padding = '8px';
        participantDiv.style.borderRadius = '5px';
        participantDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        participantDiv.style.cursor = 'pointer';
        participantDiv.style.transition = 'all 0.2s ease';

        participantDiv.innerHTML = `
                    <input type="checkbox" id="participant_${human.id}" value="${human.id}" style="margin-right: 10px;">
                    <label for="participant_${human.id}" style="flex: 1; cursor: pointer;">[${human.id}] ${human.name}</label>
                    <span style="font-size: 0.8rem; color: #666;">${human.credit !== undefined ? Math.round(human.credit) : 'N/A'}</span>
                `;

        participantDiv.addEventListener('mouseenter', () => {
            participantDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        participantDiv.addEventListener('mouseleave', () => {
            participantDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        chatParticipants.appendChild(participantDiv);
    });
}

cancelChatUploadBtn.addEventListener('click', () => {
    chatUploadModal.style.display = 'none';
    chatUploadModal.style.zIndex = '-1';
});

document.getElementById('chatUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const source = chatSource.value;
    const content = chatContent.value.trim();
    const context = chatContext.value.trim();

    const selectedParticipants = [];
    document.querySelectorAll('#chatParticipants input[type="checkbox"]:checked').forEach(checkbox => {
        const human = pazatorData.humans.find(h => h.id === checkbox.value);
        if (human) {
            selectedParticipants.push({
                id: human.id,
                name: human.name,
                credit: human.credit
            });
        }
    });

    if (selectedParticipants.length === 0) {
        showAlert('Please select at least one participant from your database.');
        return;
    }

    if (!content) {
        showAlert('Please provide chat content either by uploading a file or pasting content.');
        return;
    }

    uploadChatBtn.disabled = true;
    uploadChatBtn.textContent = 'Processing...';

    try {
        const rawChatData = {
            source: source,
            content: content,
            context: context,
            participants: selectedParticipants
        };

        const validation = ChatValidator.validateChatData(rawChatData);
        if (!validation.isValid) {
            showAlert(`Validation failed:\n${validation.errors.join('\n')}`, 'Validation Error', 'error');
            return;
        }

        const sanitizedChatData = ChatValidator.sanitizeChatData(rawChatData);
        const parsedChat = ChatParser.parse(content, source);

        const chatData = {
            ...sanitizedChatData,
            timestamp: new Date().toISOString(),
            parsed: {
                messageCount: parsedChat.messages.length,
                participants: parsedChat.participants,
                metadata: parsedChat.metadata,
                entities: ChatParser.extractEntities(parsedChat.messages)
            }
        };

        ChatStorageManager.saveChat(chatData);
        addChatContextToAI(chatData);

        const storageStats = ChatStorageManager.getStorageStats();
        let message = `Successfully processed chat with ${selectedParticipants.length} participants!`;
        if (storageStats.isNearLimit) {
            message += `\n\nWarning: Storage is at ${storageStats.totalSizeMB}MB`;
        }
        showAlert(message, 'Success', 'success');

        chatUploadModal.style.display = 'none';
        chatUploadModal.style.zIndex = '-1';

        postChatProcessingCleanup();

    } catch (error) {
        console.error('Error processing chat:', error);
        showAlert('Error processing chat. Please try again.', 'Error', 'error');
    } finally {
        uploadChatBtn.disabled = false;
        uploadChatBtn.textContent = 'Process Chat';
    }
});

cancelDataUploadBtn.addEventListener('click', () => {
    closeDataUploadModal();
});

const preciseInstructionsBtn = document.getElementById('preciseInstructionsBtn');
const dataPrecisePanel = document.getElementById('dataPrecisePanel');

if (preciseInstructionsBtn && dataPrecisePanel) {
    preciseInstructionsBtn.addEventListener('click', () => {
        const isVisible = dataPrecisePanel.style.display !== 'none';
        dataPrecisePanel.style.display = isVisible ? 'none' : '';
        preciseInstructionsBtn.classList.toggle('active', !isVisible);
    });
}

const dataFileBrowseBtn = document.getElementById('dataFileBrowseBtn');
const dataUploadDropZone = document.getElementById('dataUploadDropZone');
const dataUploadFileInfo = document.getElementById('dataUploadFileInfo');
const dataUploadFileName = document.getElementById('dataUploadFileName');

if (dataFileBrowseBtn && dataFile) {
    dataFileBrowseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dataFile.click();
    });
}

if (dataUploadDropZone && dataFile) {
    dataUploadDropZone.addEventListener('click', () => {
        dataFile.click();
    });

    dataUploadDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dataUploadDropZone.classList.add('dragover');
    });

    dataUploadDropZone.addEventListener('dragleave', () => {
        dataUploadDropZone.classList.remove('dragover');
    });

    dataUploadDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dataUploadDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            dataFile.files = e.dataTransfer.files;
            dataFile.dispatchEvent(new Event('change'));
        }
    });
}

if (dataFile) {
    dataFile.addEventListener('change', () => {
        if (!dataUploadFileInfo || !dataUploadFileName || !dataUploadDropZone) return;
        if (dataFile.files.length) {
            dataUploadFileName.textContent = dataFile.files[0].name;
            dataUploadFileInfo.style.display = '';
            dataUploadDropZone.classList.add('has-file');
        } else {
            dataUploadFileInfo.style.display = 'none';
            dataUploadDropZone.classList.remove('has-file');
        }
    });
}

// ── Upload / Test dropdown ──
const uploadBtnDropdown = document.getElementById('uploadBtnDropdown');
const uploadDropdownMenu = document.getElementById('uploadDropdownMenu');

function closeUploadDropdown() {
    if (uploadDropdownMenu) uploadDropdownMenu.classList.remove('show');
}

document.addEventListener('click', (e) => {
    if (uploadBtnDropdown && !uploadBtnDropdown.contains(e.target)) {
        closeUploadDropdown();
    }
});

if (uploadDataBtn && uploadBtnDropdown) {
    uploadDataBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (uploadDataBtn.disabled) return;
        uploadDropdownMenu.classList.toggle('show');
    });
}

async function doUpload() {
    const file = dataFile.files[0];
    if (!file) {
        showAlert('Please select a CSV file.', 'Error', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('Please select a valid CSV file.', 'Error', 'error');
        return;
    }

    closeUploadDropdown();
    uploadDataBtn.disabled = true;
    uploadDataBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Processing...';

    try {
        const text = await file.text();
        var data;
        if (text.length > 100000 && window.PazatorWorker) {
            if (window.PazatorUI) PazatorUI.showLoading('Parsing CSV with background worker...');
            const parsed = await PazatorWorker.parseCSV(text);
            data = parsed.rows || [];
            if (window.PazatorUI) PazatorUI.hideLoading();
        } else {
            data = parseCSV(text);
        }
        const result = processCSVData(data);

        closeDataUploadModal();

        showAlert(`Successfully uploaded ${result.humans} humans and ${result.others} companies/organizations.`, 'Success', 'success');

        markDataChanged();
        renderObjectCanvas();

    } catch (error) {
        console.error('Error uploading data:', error);
        showAlert(`Error processing CSV file: ${error.message}`, 'Error', 'error');
    } finally {
        uploadDataBtn.disabled = false;
        uploadDataBtn.innerHTML = '<span>Upload Data</span><i class="fas fa-caret-down"></i>';
    }
}

async function testUpload() {
    const file = dataFile.files[0];
    if (!file) {
        showAlert('Please select a CSV file.', 'Error', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('Please select a valid CSV file.', 'Error', 'error');
        return;
    }

    closeUploadDropdown();
    uploadDataBtn.disabled = true;
    uploadDataBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Testing...';

    try {
        const text = await file.text();
        var rows;
        if (text.length > 100000 && window.PazatorWorker) {
            if (window.PazatorUI) PazatorUI.showLoading('Parsing CSV with background worker...');
            const parsed = await PazatorWorker.parseCSV(text);
            rows = parsed.rows || [];
            if (window.PazatorUI) PazatorUI.hideLoading();
        } else {
            rows = parseCSV(text);
        }

        if (!rows.length) {
            showAlert('No data rows found in CSV.', 'Test Results', 'warning');
            return;
        }

        const headers = Object.keys(rows[0]);
        let humans = 0, orgs = 0;
        rows.forEach(r => {
            if (String(r.Type || r.type || '').trim()) orgs++;
            else humans++;
        });

        const lines = text.trim().split('\n').length;
        const html = [
            `<div style="line-height:1.7;">`,
            `<strong>${rows.length}</strong> data rows parsed`,
            ` (<strong>${lines - 1}</strong> non-empty lines in file)<br>`,
            `<strong>${humans}</strong> human entries &middot; <strong>${orgs}</strong> organization entries`,
            `<br><br>`,
            `<span style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Headers found:</span><br>`,
            `<code style="font-size:0.8rem;color:rgba(255,255,255,0.6);">${headers.join(', ')}</code>`,
            `</div>`
        ].join('');

        showModal({ title: 'Test Results', html, type: 'info', buttons: [{ text: 'OK', primary: true }] });

    } catch (error) {
        console.error('Error testing CSV:', error);
        showAlert(`CSV test failed: ${error.message}`, 'Error', 'error');
    } finally {
        uploadDataBtn.disabled = false;
        uploadDataBtn.innerHTML = '<span>Upload Data</span><i class="fas fa-caret-down"></i>';
    }
}

if (uploadDropdownMenu) {
    uploadDropdownMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.btn-dropdown-item');
        if (!item) return;
        const action = item.dataset.action;
        if (action === 'upload') doUpload();
        else if (action === 'test') testUpload();
    });
}

function extractCSVFromAIResponse(text) {
    let out = String(text || '').trim();
    out = out.replace(/```(?:csv)?/gi, '').replace(/```/g, '').trim();
    // If the model adds a leading label line, try to drop it.
    if (out.toLowerCase().startsWith('csv')) {
        const lines = out.split('\n');
        if (lines.length > 1 && lines[0].toLowerCase().includes('csv')) {
            out = lines.slice(1).join('\n').trim();
        }
    }
    return out;
}

function parseCSV(csvText, options = {}) {
    if (!csvText || !String(csvText).trim()) {
        throw new Error('CSV file is empty.');
    }

    const expectedHeadersRaw = Array.isArray(options.expectedHeaders) ? options.expectedHeaders : null;
    const strictHeaderOrder = Boolean(options.strictHeaderOrder);

    const text = String(csvText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let currentRow = [];
    let currentValue = '';
    let inQuotes = false;

    const pushValue = () => {
        currentRow.push(currentValue);
        currentValue = '';
    };

    const pushRow = () => {
        const hasNonEmpty = currentRow.some(v => String(v || '').trim() !== '');
        if (hasNonEmpty) rows.push(currentRow);
        currentRow = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                currentValue += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (!inQuotes && ch === ',') {
            pushValue();
            continue;
        }

        if (!inQuotes && ch === '\n') {
            pushValue();
            pushRow();
            continue;
        }

        currentValue += ch;
    }

    if (inQuotes) {
        throw new Error('CSV parsing error: unterminated quoted field.');
    }

    pushValue();
    pushRow();

    if (rows.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row.');
    }

    const normalizeHeader = (header) => String(header || '')
        .replace(/^\uFEFF/, '')
        .trim();

    const headers = rows[0].map(normalizeHeader);

    if (expectedHeadersRaw) {
        const expectedHeaders = expectedHeadersRaw.map(normalizeHeader);

        if (strictHeaderOrder) {
            const sameLength = headers.length === expectedHeaders.length;
            const sameOrder = sameLength && headers.every((h, idx) => h === expectedHeaders[idx]);
            if (!sameOrder) {
                throw new Error(
                    `CSV header mismatch.\nExpected: ${expectedHeaders.join(',')}\nGot: ${headers.join(',')}`
                );
            }
        } else {
            const gotSet = new Set(headers.map(h => h.toLowerCase()));
            const missing = expectedHeaders.filter(h => !gotSet.has(h.toLowerCase()));
            if (missing.length > 0) {
                throw new Error(`CSV header missing required columns: ${missing.join(', ')}`);
            }
        }
    }

    const data = [];
    const errors = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const values = rows[rowIndex].map(v => String(v ?? '').trim());

        if (values.length !== headers.length) {
            errors.push(`Row ${rowIndex + 1}: Expected ${headers.length} columns, found ${values.length}.`);
            continue;
        }

        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        data.push(row);
    }

    if (errors.length > 0) {
        throw new Error(`CSV parsing errors:\n${errors.join('\n')}`);
    }

    if (data.length === 0) {
        throw new Error('No valid data rows found in CSV file.');
    }

    return data;
}

function processCSVData(data) {
    let humansAdded = 0;
    let othersAdded = 0;
    let relationshipStubsAdded = 0;
    const errors = [];

    const normalizeNameKey = (name) => String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const nameToId = new Map();
    const knownIds = new Set();
    pazatorData.humans.forEach(h => {
        if (!h || !h.id) return;
        knownIds.add(String(h.id));
        const key = normalizeNameKey(h.name);
        if (key && !nameToId.has(key)) {
            nameToId.set(key, String(h.id));
        }
    });

    const importedHumans = [];

    const parseList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
        return String(value)
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
    };

    const isHumanId = (value) => /^PZI\d{4}\d{2}$/.test(String(value || '').trim());

    const resolveHumanRef = (token) => {
        const raw = String(token || '').trim();
        if (!raw) return null;

        if (isHumanId(raw) && knownIds.has(raw)) {
            return raw;
        }

        const key = normalizeNameKey(raw);
        if (key && nameToId.has(key)) {
            return nameToId.get(key);
        }

        // Create a stub person so relationships render and resolve in detail view.
        const stub = {
            id: generatePersonId(raw, ''),
            name: raw,
            birthDate: '',
            extraNotes: '',
            tags: [],
            chats: [],
            cases: [],
            friends: [],
            family: []
        };
        pazatorData.humans.push(stub);
        importedHumans.push(stub);
        humansAdded++;
        relationshipStubsAdded++;
        knownIds.add(stub.id);
        if (key) nameToId.set(key, stub.id);
        return stub.id;
    };

    data.forEach((row, index) => {
        const typeCell = row.Type ? String(row.Type).trim() : '';

        if (typeCell) {
            // It's an "other" entry
            if (!row.Name || !String(row.Name).trim()) {
                errors.push(`Row ${index + 2}: Company/Organization entry missing required 'Name' field.`);
                return;
            }
            const other = {
                id: generateOtherId(),
                name: String(row.Name).trim(),
                type: typeCell,
                note: String(row.Notes || row.Note || '').trim(),
                tags: row.Tags ? parseList(row.Tags) : []
            };
            pazatorData.others.push(other);
            othersAdded++;
            return;
        }

        // It's a human
        if (!row.Name || !String(row.Name).trim()) {
            errors.push(`Row ${index + 2}: Human entry missing required 'Name' field.`);
            return;
        }
        const name = String(row.Name).trim();
        const birthDate = String(row['Birth Date'] || '').trim();

        const human = {
            id: generatePersonId(name, birthDate),
            name,
            gender: String(row.Gender || '').trim() || undefined,
            birthDate,
            maritalStatus: String(row['Marital Status'] || '').trim() || undefined,
            workplace: String(row.Workplace || '').trim() || undefined,
            nationality: String(row.Nationality || '').trim() || undefined,
            countryOfOrigin: String(row['Country of Origin'] || '').trim() || undefined,
            immigrationStatus: String(row['Immigration Status'] || '').trim() || undefined,
            languages: String(row.Languages || '').trim() || undefined,
            ethnicity: String(row.Ethnicity || '').trim() || undefined,
            religion: String(row.Religion || '').trim() || undefined,
            politicalViews: String(row['Political Views'] || '').trim() || undefined,
            credit: row['Credit Score'] !== undefined && row['Credit Score'] !== '' ? parseFloat(row['Credit Score']) : undefined,
            socialClass: String(row['Social Class'] || '').trim() || undefined,
            incomeLevel: String(row['Income Level'] || '').trim() || undefined,
            educationLevel: String(row['Education Level'] || '').trim() || undefined,
            threatLevel: String(row['Threat Level'] || '').trim() || undefined,
            extraNotes: String(row.Notes || '').trim(),
            tags: row.Tags ? parseList(row.Tags) : [],
            friends: [],
            family: [],
            _friendsRaw: parseList(row.Friends),
            _familyRaw: parseList(row.Family)
        };

        pazatorData.humans.push(human);
        importedHumans.push(human);
        humansAdded++;
        knownIds.add(human.id);
        const key = normalizeNameKey(human.name);
        if (key && !nameToId.has(key)) nameToId.set(key, human.id);
    });

    // Resolve relationships (names → ids) after all people exist.
    importedHumans.forEach(human => {
        const friends = Array.isArray(human._friendsRaw) ? human._friendsRaw : [];
        const family = Array.isArray(human._familyRaw) ? human._familyRaw : [];

        const resolvedFriends = friends
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);
        const resolvedFamily = family
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);

        human.friends = [...new Set(resolvedFriends)];
        human.family = [...new Set(resolvedFamily)];

        delete human._friendsRaw;
        delete human._familyRaw;
    });

    if (errors.length > 0) {
        throw new Error(`Data validation errors:\n${errors.join('\n')}`);
    }

    return { humans: humansAdded, others: othersAdded, relationshipStubs: relationshipStubsAdded };
}

function addChatContextToAI(chatData) {
    const chatSummary = {
        type: 'chat_context',
        source: chatData.source,
        participants: chatData.participants.map(p => p.name).join(', '),
        messageCount: chatData.parsed?.messageCount || null,
        wordCount: chatData.content.split(' ').length,
        context: chatData.context || 'No additional context provided',
        timestamp: chatData.timestamp
    };

    ChatStorageManager.saveAIContext(chatSummary);
}

function ensureDataPersistence() {
    const storedData = localStorage.getItem('pazatorData');
    if (storedData) {
        const parsedData = JSON.parse(storedData);
        if (parsedData.pazatorData) {
            var newHumans = (parsedData.pazatorData.humans || []).filter(function (h) {
                return !pazatorData.humans.some(function (existing) { return existing.id === h.id; });
            });
            for (var hi = 0; hi < newHumans.length; hi++) pazatorData.humans.push(newHumans[hi]);

            var newOthers = (parsedData.pazatorData.others || []).filter(function (o) {
                return !pazatorData.others.some(function (existing) { return existing.id === o.id; });
            });
            for (var oi = 0; oi < newOthers.length; oi++) pazatorData.others.push(newOthers[oi]);

            var mergedTags = {};
            for (var ti = 0; ti < tags.length; ti++) mergedTags[tags[ti]] = true;
            for (var ti = 0; ti < (parsedData.tags || []).length; ti++) mergedTags[parsedData.tags[ti]] = true;
            var allTags = Object.keys(mergedTags);
            tags.splice(0, tags.length);
            for (var ti = 0; ti < allTags.length; ti++) tags.push(allTags[ti]);
        }
    }
    saveData();
    renderObjectCanvas();
}

function postChatProcessingCleanup() {
    setTimeout(() => {
        ensureDataPersistence();
        renderObjectCanvas();
    }, 100);
}
