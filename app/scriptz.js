
let pazatorData = {
    humans: [],
    others: []
};

let tags = [];

let cases = [];

let aiChatHistory = [];

let autoSaveInterval;
let pendingChanges = false;
let lastChangeTime = 0;
const AUTO_SAVE_DELAY = 2000;
const PERIODIC_SAVE_INTERVAL = 30000;

let openMenuSections = [];
let trackerPersonNames = [];

let searchTabInitialized = false;
let agentsTabInitialized = false;
let articlesTabInitialized = false;
let casesTabInitialized = false;
let selectedCaseId = null;

const TRACKER_CONFIG_KEY = 'shahedTrackerConfig';
const TRACKER_CONFIG_EXAMPLE = {
    url: 'https://xyz.supabase.co',
    key: 'anon-key'
};
const DEFAULT_TRACKER_CONFIG = {
    url: '',
    key: ''
};

let logoBase64 = null;

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

function hasValidTrackerConfig(config) {
    return Boolean(config && config.url && config.key);
}

const VALID_CHAT_SOURCES = ['whatsapp', 'telegram', 'discord', 'signal', 'manual'];
const MAX_CHAT_CONTENT_SIZE = 10 * 1024 * 1024;
const STORAGE_WARNING_THRESHOLD = 4 * 1024 * 1024;

const ChatValidator = {
    sanitize(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    },

    validateChatData({ source, content, participants, context }) {
        const errors = [];

        if (!source || !VALID_CHAT_SOURCES.includes(source.toLowerCase())) {
            errors.push(`Invalid source. Must be one of: ${VALID_CHAT_SOURCES.join(', ')}`);
        }

        if (!content || typeof content !== 'string') {
            errors.push('Content is required and must be a string');
        } else {
            if (content.length > MAX_CHAT_CONTENT_SIZE) {
                errors.push(`Content exceeds maximum size of ${MAX_CHAT_CONTENT_SIZE} bytes`);
            }
            if (content.trim().length === 0) {
                errors.push('Content cannot be empty or whitespace only');
            }
        }

        if (!Array.isArray(participants) || participants.length === 0) {
            errors.push('At least one participant is required');
        } else {
            participants.forEach((p, i) => {
                if (!p.id) errors.push(`Participant ${i + 1} is missing an id`);
                if (!p.name) errors.push(`Participant ${i + 1} is missing a name`);
            });
        }

        if (context !== undefined && typeof context !== 'string') {
            errors.push('Context must be a string');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    sanitizeChatData(chatData) {
        return {
            ...chatData,
            source: chatData.source.toLowerCase(),
            content: this.sanitize(chatData.content),
            context: chatData.context ? this.sanitize(chatData.context) : '',
            participants: chatData.participants.map(p => ({
                id: String(p.id),
                name: this.sanitize(p.name),
                credit: typeof p.credit === 'number' ? p.credit : undefined
            }))
        };
    }
};

const ChatParser = {
    parse(content, source) {
        const parsers = {
            whatsapp: this.parseWhatsApp,
            telegram: this.parseTelegram,
            discord: this.parseDiscord,
            signal: this.parseSignal
        };

        const parser = parsers[source] || parsers.discord;
        return parser.call(this, content);
    },

    parseWhatsApp(content) {
        const lines = content.split('\n');
        const messages = [];
        const participantSet = new Set();

        const datePattern = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*(.+?):\s*(.+)$/;

        for (const line of lines) {
            const match = line.match(datePattern);
            if (match) {
                const [, date, time, sender, message] = match;
                participantSet.add(sender.trim());
                messages.push({
                    timestamp: this.parseDate(date, time, 'whatsapp'),
                    sender: sender.trim(),
                    message: message.trim(),
                    raw: line
                });
            } else if (messages.length > 0) {
                messages[messages.length - 1].message += '\n' + line;
            }
        }

        return {
            messages,
            participants: [...participantSet],
            metadata: this.extractMetadata(messages)
        };
    },

    parseTelegram(content) {
        const lines = content.split('\n');
        const messages = [];
        const participantSet = new Set();

        const datePattern = /^(\d{1,2}\s+\w+\s+\d{4}|\d{1,2}-\d{1,2}-\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+?):\s*(.+)$/;
        const altPattern = /^\[(\d{1,2}\.\d{1,2}\.\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+):\s*(.+)$/;

        for (const line of lines) {
            let match = line.match(datePattern);
            if (!match) match = line.match(altPattern);
            
            if (match) {
                const [, date, time, sender, message] = match;
                participantSet.add(sender.trim());
                messages.push({
                    timestamp: this.parseDate(date, time, 'telegram'),
                    sender: sender.trim(),
                    message: message.trim(),
                    raw: line
                });
            } else if (messages.length > 0) {
                messages[messages.length - 1].message += '\n' + line;
            }
        }

        return {
            messages,
            participants: [...participantSet],
            metadata: this.extractMetadata(messages)
        };
    },

    parseDiscord(content) {
        const lines = content.split('\n');
        const messages = [];
        const participantSet = new Set();

        const datePattern = /^(\d{4}-\d{2}-\d{2})\s*[T\s](\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?)\s*\|\s*(.+?)\s*#(\d{4})\s*:?\s*(.+)$/;
        const altPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\s*-\s*(.+?)\s*:\s*(.+)$/;

        for (const line of lines) {
            let match = line.match(datePattern);
            if (!match) match = line.match(altPattern);

            if (match) {
                const date = match[1];
                const time = match[2];
                const sender = match[3];
                const message = match[4] || match[match.length - 1];
                participantSet.add(sender.trim());
                messages.push({
                    timestamp: new Date(`${date}T${time}`).toISOString(),
                    sender: sender.trim(),
                    message: message.trim(),
                    raw: line
                });
            } else if (messages.length > 0) {
                messages[messages.length - 1].message += '\n' + line;
            }
        }

        return {
            messages,
            participants: [...participantSet],
            metadata: this.extractMetadata(messages)
        };
    },

    parseSignal(content) {
        return this.parseWhatsApp(content);
    },

    parseDate(dateStr, timeStr, format) {
        try {
            let fullDate;
            if (format === 'whatsapp') {
                const parts = dateStr.split('/');
                const year = parts[2]?.length === 2 ? `20${parts[2]}` : parts[2];
                fullDate = new Date(`${parts[1]}/${parts[0]}/${year} ${timeStr}`);
            } else if (format === 'telegram') {
                fullDate = new Date(`${dateStr} ${timeStr}`);
            } else {
                fullDate = new Date(`${dateStr} ${timeStr}`);
            }
            return isNaN(fullDate.getTime()) ? new Date().toISOString() : fullDate.toISOString();
        } catch {
            return new Date().toISOString();
        }
    },

    extractMetadata(messages) {
        if (!messages.length) return { totalMessages: 0, dateRange: null, wordCount: 0 };

        const words = messages.reduce((acc, m) => acc + (m.message.split(/\s+/).length), 0);
        const timestamps = messages.map(m => new Date(m.timestamp).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b);

        return {
            totalMessages: messages.length,
            dateRange: timestamps.length > 1 ? {
                start: new Date(timestamps[0]).toISOString(),
                end: new Date(timestamps[timestamps.length - 1]).toISOString()
            } : null,
            wordCount: words
        };
    },

    extractEntities(messages) {
        const entities = {
            urls: new Set(),
            emails: new Set(),
            phones: new Set(),
            mentions: new Set()
        };

        const urlPattern = /https?:\/\/[^\s]+/gi;
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
        const mentionPattern = /@[a-zA-Z0-9_]+/g;

        for (const msg of messages) {
            const matches = msg.message.match(urlPattern);
            if (matches) matches.forEach(m => entities.urls.add(m));
            
            const emails = msg.message.match(emailPattern);
            if (emails) emails.forEach(e => entities.emails.add(e));
            
            const phones = msg.message.match(phonePattern);
            if (phones) phones.forEach(p => entities.phones.add(p));
            
            const mentions = msg.message.match(mentionPattern);
            if (mentions) mentions.forEach(m => entities.mentions.add(m));
        }

        return {
            urls: [...entities.urls],
            emails: [...entities.emails],
            phones: [...entities.phones],
            mentions: [...entities.mentions]
        };
    }
};

const ChatStorageManager = {
    CACHE_TTL: 5000,
    _cache: new Map(),

    _getCacheKey(key) {
        return key;
    },

    _isCacheValid(key) {
        const cached = this._cache.get(key);
        if (!cached) return false;
        return Date.now() - cached.timestamp < this.CACHE_TTL;
    },

    _setCache(key, data) {
        this._cache.set(key, { data, timestamp: Date.now() });
    },

    getChatHistory() {
        const key = 'chatHistory';
        if (this._isCacheValid(key)) {
            return this._cache.get(key).data;
        }
        try {
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            this._setCache(key, data);
            return data;
        } catch (e) {
            console.error('Error reading chat history:', e);
            return [];
        }
    },

    saveChat(chatData) {
        this._cache.delete('chatHistory');
        const history = this.getChatHistory();
        history.push(chatData);
        this._saveWithQuotaCheck('chatHistory', history);
        this._setCache('chatHistory', history);
    },

    deleteChat(index) {
        this._cache.delete('chatHistory');
        const history = this.getChatHistory();
        if (index < 0 || index >= history.length) return false;
        history.splice(index, 1);
        this._saveWithQuotaCheck('chatHistory', history);
        return true;
    },

    clearAllChats() {
        this._cache.clear();
        localStorage.removeItem('chatHistory');
    },

    _saveWithQuotaCheck(key, data) {
        try {
            const serialized = JSON.stringify(data);
            const size = new Blob([serialized]).size;
            
            if (size > STORAGE_WARNING_THRESHOLD) {
                console.warn(`Chat storage approaching limit: ${(size / 1024 / 1024).toFixed(2)}MB`);
            }
            
            localStorage.setItem(key, serialized);
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.error('Storage quota exceeded!');
                this._handleQuotaExceeded(key, data);
            } else {
                throw e;
            }
        }
    },

    _handleQuotaExceeded(key, data) {
        const oldData = data.slice(1);
        localStorage.setItem(key, JSON.stringify(oldData));
        console.log('Cleared oldest chat due to quota exceeded');
    },

    getAIContext() {
        const key = 'aiChatContext';
        if (this._isCacheValid(key)) {
            return this._cache.get(key).data;
        }
        try {
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            this._setCache(key, data);
            return data;
        } catch (e) {
            console.error('Error reading AI context:', e);
            return [];
        }
    },

    saveAIContext(contextData) {
        this._cache.delete('aiChatContext');
        const contexts = this.getAIContext();
        contexts.push(contextData);
        localStorage.setItem('aiChatContext', JSON.stringify(contexts));
        this._setCache('aiChatContext', contexts);
    },

    invalidateCache() {
        this._cache.clear();
    },

    getStorageStats() {
        const history = this.getChatHistory();
        const aiContext = this.getAIContext();
        
        const historySize = new Blob([JSON.stringify(history)]).size;
        const aiContextSize = new Blob([JSON.stringify(aiContext)]).size;
        
        return {
            totalChats: history.length,
            totalAIContexts: aiContext.length,
            historySize,
            aiContextSize,
            totalSize: historySize + aiContextSize,
            historySizeMB: (historySize / 1024 / 1024).toFixed(2),
            aiContextSizeMB: (aiContextSize / 1024 / 1024).toFixed(2),
            totalSizeMB: ((historySize + aiContextSize) / 1024 / 1024).toFixed(2),
            isNearLimit: historySize > STORAGE_WARNING_THRESHOLD
        };
    }
};

const ChatAnalysisService = {
    ANALYSIS_TIMEOUT: 30000,
    MAX_RETRIES: 2,
    CONTENT_TRUNCATE: 3000,

    async analyze(chatContent, source, options = {}) {
        const { retries = this.MAX_RETRIES, onProgress } = options;
        let lastError;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this._performAnalysis(chatContent, source, onProgress);
            } catch (e) {
                lastError = e;
                if (attempt < retries) {
                    await this._delay(1000 * (attempt + 1));
                }
            }
        }

        console.error('Analysis failed after retries:', lastError);
        return this._getDefaultResult('Analysis failed - please try again');
    },

    async _performAnalysis(content, source, onProgress) {
        const truncatedContent = content.substring(0, this.CONTENT_TRUNCATE);
        const parsed = ChatParser.parse(content, source);
        const entities = ChatParser.extractEntities(parsed.messages);

        const context = this._buildAnalysisPrompt(source, truncatedContent, entities);

        const response = await Promise.race([
            puter.ai.chat([
                { role: "system", content: context },
                { role: "user", content: "Analyze this chat for suspicious activity and provide your findings in JSON format." }
            ]),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Analysis timeout')), this.ANALYSIS_TIMEOUT)
            )
        ]);

        const responseText = response.content ? response.content : response;
        const result = extractJSONFromResponse(responseText);

        if (result && typeof result === 'object') {
            return {
                ...this._normalizeResult(result),
                entities,
                metadata: parsed.metadata
            };
        }

        return this._getDefaultResult('Could not parse analysis response');
    },

    _buildAnalysisPrompt(source, content, entities) {
        const entityWarnings = [];
        if (entities.urls.length > 0) entityWarnings.push(`Contains ${entities.urls.length} URLs`);
        if (entities.emails.length > 0) entityWarnings.push(`Contains ${entities.emails.length} email addresses`);
        if (entities.phones.length > 0) entityWarnings.push(`Contains ${entities.phones.length} phone numbers`);

        return `You are a cybersecurity expert analyzing ${source} chat conversations for suspicious or potentially fraudulent activity.

Analyze the following chat content${entityWarnings.length > 0 ? ` (${entityWarnings.join(', ')})` : ''}:

${content}

Look for these red flags:
- Requests for money, gift cards, or financial information
- Personal data collection (SSN, bank details, passwords)
- Urgent or threatening language pressuring the user
- Unsolicited offers, prizes, or investment schemes
- Links to unfamiliar or suspicious websites
- Impersonation or claims of needing secrecy
- Requests to download attachments or run programs
- Pressure to abandon official channels
- Phishing attempts or social engineering
- Sextortion or inappropriate content with minors
- Hate speech or harassment

Provide your analysis in this EXACT JSON format:
{
    "isSuspicious": boolean,
    "riskLevel": "low|medium|high",
    "redFlags": ["flag1", "flag2"],
    "summary": "Brief summary of findings",
    "recommendations": ["action1", "action2"]
}`;
    },

    _normalizeResult(result) {
        return {
            isSuspicious: Boolean(result.isSuspicious),
            riskLevel: ['low', 'medium', 'high'].includes(result.riskLevel) ? result.riskLevel : 'low',
            redFlags: Array.isArray(result.redFlags) ? result.redFlags.slice(0, 20) : [],
            summary: String(result.summary || 'No summary provided'),
            recommendations: Array.isArray(result.recommendations) ? result.recommendations.slice(0, 10) : []
        };
    },

    _getDefaultResult(reason) {
        return {
            isSuspicious: false,
            riskLevel: 'low',
            redFlags: [],
            summary: reason,
            recommendations: [],
            entities: { urls: [], emails: [], phones: [], mentions: [] },
            metadata: null
        };
    },

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async batchAnalyze(chats, options = {}) {
        const { onProgress, concurrency = 2, onChatComplete } = options;
        const results = [];
        const total = chats.length;

        for (let i = 0; i < chats.length; i += concurrency) {
            const batch = chats.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map((chat, idx) => 
                    this.analyze(chat.content, chat.source, options)
                        .then(result => {
                            const chatResult = {
                                index: i + idx,
                                source: chat.source,
                                participants: chat.participants,
                                result
                            };
                            if (onChatComplete) onChatComplete(chatResult);
                            if (onProgress) onProgress((i + idx + 1) / total * 100);
                            return chatResult;
                        })
                )
            );
            results.push(...batchResults);
        }

        return results;
    }
};

let trackerConfig = null;
let trackerSupabase = null;
let trackerConfigPromptedThisSession = false;
let pendingTrackerDetailShowAlias = null;
const PERSON_ID_SEQUENCE_KEY = 'pziIdSequence';
let personIdSequence = 1;
loadPersonIdSequence();

function loadTrackerConfig() {
    try {
        const stored = localStorage.getItem(TRACKER_CONFIG_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Malformed tracker config, ignoring.', e);
    }
    return null;
}

function loadPersonIdSequence() {
    const stored = localStorage.getItem(PERSON_ID_SEQUENCE_KEY);
    if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
            personIdSequence = parsed;
            return;
        }
    }
    personIdSequence = 1;
}

function persistPersonIdSequence() {
    localStorage.setItem(PERSON_ID_SEQUENCE_KEY, personIdSequence.toString());
}

function extractSequenceFromId(id) {
    if (!id) return 0;
    const match = id.match(/^PZI(\d+)(\d{2})$/);
    if (!match) return 0;
    return parseInt(match[1], 10) || 0;
}

function updatePersonIdSequenceFromData() {
    let maxSeen = 0;
    pazatorData.humans.forEach(human => {
        const seq = extractSequenceFromId(human.id);
        if (seq > maxSeen) {
            maxSeen = seq;
        }
    });
    personIdSequence = Math.max(personIdSequence, maxSeen + 1, 1);
    persistPersonIdSequence();
}

function getNextPersonSequence() {
    const value = personIdSequence;
    personIdSequence += 1;
    persistPersonIdSequence();
    return value;
}

function computeAge(birthDate) {
    if (!birthDate) return 0;
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    const dateDiff = now.getDate() - dob.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dateDiff < 0)) {
        age -= 1;
    }
    return Math.max(age, 0);
}

function applyTrackerConfig(config) {
    if (!config || !config.url || !config.key) {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
        return;
    }

    if (typeof supabase === 'undefined') {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Supabase client library is not available.');
        return;
    }

    trackerSupabase = supabase.createClient(config.url, config.key);
    trackerDebug && (trackerDebug.innerText = `Tracker connected to ${config.url}`);
}

function showTrackerStatusModal(title, message, { variant = 'info', onClose } = {}) {
    const typeColor = {
        info: '#4d9de0',
        success: '#6bcf7f',
        error: '#ff6b6b'
    }[variant] || '#4d9de0';

    const modal = document.createElement('div');
    modal.className = 'modal context-modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1105';

    const dialog = document.createElement('div');
    dialog.className = 'modal-content';
    dialog.style.maxWidth = '440px';
    dialog.style.minWidth = '320px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.color = typeColor;
    titleEl.style.fontSize = '1.4rem';
    titleEl.style.margin = '0';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '8px 0';
    body.innerHTML = '';
    message = String(message || '');
    message.split('\n').forEach((line, index) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        paragraph.style.margin = index ? '12px 0 0' : '0';
        paragraph.style.color = '#d7d7d7';
        paragraph.style.lineHeight = '1.5';
        paragraph.style.fontSize = '0.95rem';
        body.appendChild(paragraph);
    });

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.marginTop = '20px';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Close';
    actions.appendChild(confirmBtn);

    const cleanup = () => {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        if (typeof onClose === 'function') {
            onClose();
        }
    };

    closeBtn.addEventListener('click', cleanup);
    confirmBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            cleanup();
        }
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

function openTrackerConfigModal(previousConfig, placeholderConfig = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal context-modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1110';

    const dialog = document.createElement('div');
    dialog.className = 'modal-content';
    dialog.style.maxWidth = '520px';
    dialog.style.minWidth = '320px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = 'Tracker configuration';
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '1.4rem';

    header.appendChild(titleEl);

    const form = document.createElement('form');
    form.className = 'modal-body';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.padding = '0';

    const info = document.createElement('p');
    info.textContent = 'Enter the Supabase tracker URL and anonymous key so the tracker sync can run securely.';
    info.style.color = '#b7b7b7';
    info.style.fontSize = '0.9rem';
    info.style.margin = '0';

    const createField = (labelText, initialValue, placeholder, type = 'text') => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.display = 'block';
        label.style.fontSize = '0.85rem';
        label.style.fontWeight = '600';
        label.style.color = '#cfd8ff';
        label.style.marginBottom = '6px';
        const input = document.createElement('input');
        input.className = 'form-control';
        input.type = type;
        input.value = initialValue || '';
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        return { wrapper, input };
    };

    const urlPlaceholder = placeholderConfig.url || 'https://xyz.supabase.co';
    const keyPlaceholder = placeholderConfig.key || 'Supabase anonymous key';
    const urlField = createField('Supabase URL', previousConfig.url || '', urlPlaceholder, 'url');
    const keyField = createField('Anonymous key', previousConfig.key || '', keyPlaceholder, 'text');

    const messageEl = document.createElement('div');
    messageEl.style.minHeight = '18px';
    messageEl.style.fontSize = '0.9rem';
    messageEl.style.color = '#ff6b6b';
    messageEl.style.margin = '0';

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.paddingTop = '12px';
    actions.style.marginTop = '0';
    actions.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save configuration';

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    form.appendChild(info);
    form.appendChild(urlField.wrapper);
    form.appendChild(keyField.wrapper);
    form.appendChild(messageEl);
    form.appendChild(actions);

    const cleanup = () => {
        document.removeEventListener('keydown', handleKeydown);
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    };

    const revertToPrevious = () => {
        trackerDebug && (trackerDebug.innerText = 'Tracker configuration unchanged.');
        if (hasValidTrackerConfig(previousConfig)) {
            applyTrackerConfig(previousConfig);
        } else {
            trackerSupabase = null;
            trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
        }
    };

    const handleCancel = () => {
        revertToPrevious();
        cleanup();
    };

    const handleSave = () => {
        messageEl.textContent = '';
        const trimmedUrl = urlField.input.value.trim();
        const trimmedKey = keyField.input.value.trim();
        if (!trimmedUrl || !trimmedKey) {
            const alertMsg = 'Tracker configuration requires both URL and key.';
            messageEl.textContent = alertMsg;
            trackerDebug && (trackerDebug.innerText = alertMsg);
            return;
        }

        trackerConfig = { url: trimmedUrl, key: trimmedKey, userSaved: true };
        try {
            localStorage.setItem(TRACKER_CONFIG_KEY, JSON.stringify(trackerConfig));
        } catch (storageError) {
            console.warn('Unable to persist tracker config:', storageError);
        }

        applyTrackerConfig(trackerConfig);
        trackerDebug && (trackerDebug.innerText = 'Tracker configuration updated.');
        if (trackerMap) {
            fetchTrackerPeople();
        }
        cleanup();
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            handleCancel();
        }
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSave();
    });

    cancelBtn.addEventListener('click', handleCancel);

    [urlField.input, keyField.input].forEach(input => {
        input.addEventListener('input', () => {
            messageEl.textContent = '';
        });
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            handleCancel();
        }
    });

    document.addEventListener('keydown', handleKeydown);

    dialog.appendChild(header);
    dialog.appendChild(form);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    setTimeout(() => {
        urlField.input.focus();
    }, 0);
}

function promptForTrackerConfig() {
    trackerConfigPromptedThisSession = true;
    const storedConfig = loadTrackerConfig();
    const previousConfig = trackerConfig || storedConfig || DEFAULT_TRACKER_CONFIG;
    openTrackerConfigModal(previousConfig, TRACKER_CONFIG_EXAMPLE);
}

function ensureTrackerConfig(promptForNew = false) {
    const storedConfig = loadTrackerConfig();
    trackerConfig = trackerConfig || storedConfig;
    if (hasValidTrackerConfig(trackerConfig)) {
        applyTrackerConfig(trackerConfig);
    } else {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
    }

    if (promptForNew && !trackerConfigPromptedThisSession && !trackerConfig?.userSaved) {
        promptForTrackerConfig();
    }
}

function formatTrackerTimestamp(iso) {
    if (!iso) return 'never';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return 'never';
    return parsed.toLocaleString();
}

const TRACKER_META_FIELDS = [
    { key: 'timestamp', label: 'Last seen', format: value => formatTrackerTimestamp(value) },
    { key: 'ip', label: 'IP Address' },
    { key: 'ip_address', label: 'IP Address' },
    { key: 'server', label: 'Server' },
    { key: 'region', label: 'Region' },
    { key: 'country', label: 'Country' },
    { key: 'device', label: 'Device' },
    { key: 'platform', label: 'Platform' },
    { key: 'user_agent', label: 'User Agent' },
    { key: 'speed', label: 'Speed' },
    { key: 'heading', label: 'Heading' }
];

function buildTrackerMetaHtml(row) {
    if (!row) return '';
    const seen = new Set();
    const lines = [];
    TRACKER_META_FIELDS.forEach(field => {
        if (seen.has(field.label)) return;
        let rawValue = row[field.key];
        if (rawValue == null || rawValue === '') return;
        const formatted = field.format
            ? field.format(rawValue)
            : rawValue;
        if (formatted == null || formatted === '') return;
        lines.push(
            `<div class="tracker-meta-line"><span class="tracker-meta-label">${escapeHtml(field.label)}</span>` +
            `<strong class="tracker-meta-value">${escapeHtml(String(formatted))}</strong></div>`
        );
        seen.add(field.label);
    });
    if (!lines.length) return '';
    return `<div class="tracker-location-meta">${lines.join('')}</div>`;
}

function generatePersonId(name, birthDate) {
    const seq = getNextPersonSequence();
    const seqStr = String(seq).padStart(4, '0');
    const age = computeAge(birthDate);
    const ageStr = String(age).padStart(2, '0');
    const candidate = `PZI${seqStr}${ageStr}`;
    if (pazatorData.humans.some(h => h.id === candidate)) {
        return generatePersonId(name, birthDate);
    }
    return candidate;
}

function generateOtherId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `OTH-${crypto.randomUUID()}`;
    }
    return `OTH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function updateDetailTrackerInfo(data) {
    if (!detailTrackerContainer) return;
    if (!data || data.type !== 'human') {
        detailTrackerContainer.style.display = 'none';
        return;
    }

    detailTrackerContainer.style.display = 'block';
    const alias = data.trackerAlias || '';
    const statusText = alias
        ? `Linked to "${alias}" (last sync ${formatTrackerTimestamp(data.trackerLinkedAt)}).`
        : 'Not linked yet. Use the tracker tab to connect this person.';

    if (detailTrackerStatus) {
        detailTrackerStatus.textContent = statusText;
    }

    if (detailTrackerAliasInput) {
        detailTrackerAliasInput.value = alias || data.name || '';
    }

    if (detailTrackerShowBtn) {
        detailTrackerShowBtn.disabled = !alias;
    }
}

async function reverseGeocodeLocation(lat, lon, signal) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
        throw new Error('Invalid coordinates');
    }
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
        format: 'json',
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        zoom: '14',
        addressdetails: '1'
    }).toString();

    const response = await fetch(url.toString(), {
        method: 'GET',
        signal,
        headers: {
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    if (!response.ok) {
        throw new Error(`Geocode HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload && payload.error) {
        throw new Error(payload.error);
    }

    return payload.display_name || payload.address?.road || 'Unknown place';
}

async function setTrackerLocationDetails(lat, lon, metaRow = null) {
    if (!trackerLocationInfo) return;

    const metaIdentifier = metaRow?.timestamp ? metaRow.timestamp : '';
    const key = `${lat.toFixed(5)}|${lon.toFixed(5)}|${metaIdentifier}`;
    if (key === trackerLocationCacheKey) return;
    trackerLocationCacheKey = key;
    trackerLocationInfo.innerHTML = '<span class="tracker-location-status">Resolving place details…</span>';

    if (trackerLocationAbortController) {
        trackerLocationAbortController.abort();
    }
    trackerLocationAbortController = new AbortController();

    try {
        const displayName = await reverseGeocodeLocation(lat, lon, trackerLocationAbortController.signal);
        trackerLocationInfo.innerHTML = `
            <div class="tracker-location-title">${escapeHtml(displayName)}</div>
            ${buildTrackerMetaHtml(metaRow)}
        `;
    } catch (error) {
        if (error.name === 'AbortError') return;
        trackerLocationInfo.innerHTML = `
            <div class="tracker-location-title">Unable to resolve location.</div>
            ${buildTrackerMetaHtml(metaRow)}
        `;
        console.warn('Tracker reverse geocode failed', error);
    }
}

function requestTrackerShow(alias) {
    if (!alias) return;
    pendingTrackerDetailShowAlias = alias;
    if (trackerMap) {
        showTrackerPersonLocations(alias);
        pendingTrackerDetailShowAlias = null;
    }
}

function ensureTrackerLabelLayers() {
    if (!trackerMap || trackerLabelLayersAdded) return;

    trackerMap.addSource(STREET_LABEL_SOURCE, {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256
    });
    trackerMap.addLayer({
        id: STREET_LABEL_LAYER,
        type: 'raster',
        source: STREET_LABEL_SOURCE,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.9 }
    });

    trackerLabelLayersAdded = true;
}

function toggleLabelLayer(type) {
    if (!trackerMap) return;
    ensureTrackerLabelLayers();

    const isStreet = type === 'street';
    const layerId = STREET_LABEL_LAYER;
    const btn = trackerStreetLabelBtn;
    const activeState = !streetLabelsActive;

    trackerMap.setLayoutProperty(layerId, 'visibility', activeState ? 'visible' : 'none');

    streetLabelsActive = activeState;

    if (btn) {
        btn.classList.toggle('active', activeState);
        const label = 'Street';
        btn.textContent = `${activeState ? 'Hide' : 'Show'} ${label.toLowerCase()} names`;
    }
}

function setTrackerMapFilterActive(activeState) {
    const enabled = !!activeState;
    trackerFilterActive = enabled;
    trackerMapContainer?.classList.toggle('tracker-filter-active', enabled);

    if (trackerFilterToggleBtn) {
        trackerFilterToggleBtn.classList.toggle('active', enabled);
        trackerFilterToggleBtn.textContent = `${enabled ? 'Hide' : 'Show'} filter`;
    }
}

function toggleTrackerMapFilter() {
    setTrackerMapFilterActive(!trackerFilterActive);
}

const trackerSidebar = document.getElementById('trackerSidebar');
const trackerPeopleListEl = document.getElementById('trackerPeopleList');
const trackerDebug = document.getElementById('trackerDebug');
const trackerLocationInfo = document.getElementById('trackerLocationInfo');
const trackerToggleSidebarBtn = document.getElementById('trackerToggleSidebarBtn');
const trackerSpinToggleBtn = document.getElementById('trackerSpinToggleBtn');
const trackerStreetLabelBtn = document.getElementById('streetLabelToggle');
const trackerFilterToggleBtn = document.getElementById('trackerFilterToggle');
const trackerSettingsBtn = document.getElementById('trackerSettingsBtn');
const trackerSettingsMenu = document.getElementById('trackerSettingsMenu');
const trackerSpinSpeedInput = document.getElementById('trackerSpinSpeed');
const trackerSpinSpeedValue = document.getElementById('trackerSpinSpeedValue');
const trackerHumanSelect = document.getElementById('trackerHumanSelect');
const trackerConnectBtn = document.getElementById('trackerConnectBtn');
const trackerRefreshBtn = document.getElementById('trackerRefreshBtn');
const trackerPurgeBtn = document.getElementById('trackerPurgeBtn');
const trackerConfigureBtn = document.getElementById('trackerConfigureBtn');
const trackerMapContainer = document.getElementById('trackerMap');

let trackerMap;
let trackerSpinning = false;
let trackerAnimationFrame = null;
let trackerLastSpinTimestamp = null;
let trackerInitialized = false;
let trackerLocationAbortController = null;
let trackerLocationCacheKey = '';
let trackerLabelLayersAdded = false;
let streetLabelsActive = false;
let trackerFilterActive = false;
let trackerSpinSpeedDps = 10;

function setTrackerSpinSpeed(nextSpeed) {
    const parsed = Number(nextSpeed);
    const safeValue = Number.isFinite(parsed) ? Math.max(0, Math.min(60, parsed)) : 10;
    trackerSpinSpeedDps = safeValue;

    if (trackerSpinSpeedInput) trackerSpinSpeedInput.value = String(Math.round(safeValue));
    if (trackerSpinSpeedValue) trackerSpinSpeedValue.textContent = `${Math.round(safeValue)}°/s`;

    try {
        localStorage.setItem('trackerSpinSpeedDps', String(Math.round(safeValue)));
    } catch (err) {
        // ignore storage errors
    }
}

function setTrackerSettingsMenuOpen(isOpen) {
    if (!trackerSettingsMenu || !trackerSettingsBtn) return;
    trackerSettingsMenu.classList.toggle('open', !!isOpen);
    trackerSettingsBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

try {
    const saved = localStorage.getItem('trackerSpinSpeedDps');
    if (saved != null) setTrackerSpinSpeed(saved);
} catch (err) {
    // ignore storage errors
}

setTrackerSpinSpeed(trackerSpinSpeedDps);

const TRACKER_PATH_LAYER = 'tracker-path';
const TRACKER_MARKERS_LAYER = 'tracker-markers';
const STREET_LABEL_LAYER = 'tracker-street-labels';
const STREET_LABEL_SOURCE = 'tracker-street-source';

setTrackerMapFilterActive(false);

function escapeHtml(unsafe) {
    return unsafe.replace(/[&<>"']/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return '&#039;';
    });
}

const newDataBtn = document.getElementById('newDataBtn');
const askAIBtn = document.getElementById('askAIBtn');
const typeModal = document.getElementById('typeModal');
const humanModal = document.getElementById('humanModal');
const otherModal = document.getElementById('otherModal');
const detailViewModal = document.getElementById('detailViewModal');
const detailTrackerContainer = document.getElementById('detailTrackerContainer');
const detailTrackerStatus = document.getElementById('detailTrackerStatus');
const detailTrackerAliasInput = document.getElementById('detailTrackerAlias');
const detailTrackerSaveAliasBtn = document.getElementById('detailTrackerSaveAliasBtn');
const detailTrackerShowBtn = document.getElementById('detailTrackerShowBtn');
const humanTrackerSelect = document.getElementById('humanTrackerSelect');
const humanTrackerAliasInput = document.getElementById('humanTrackerAlias');
const aiChatModal = document.getElementById('aiChatModal');
const webContainer = document.getElementById('webContainer');
const aiInput = document.getElementById('aiInput');
const aiSendBtn = document.getElementById('aiSendBtn');
const aiImproveBtn = document.getElementById('aiImproveBtn');
const aiChatMessages = document.getElementById('aiChatMessages');

function setAiSendLoading(isLoading) {
    if (!aiSendBtn) return;
    const icon = aiSendBtn.querySelector('i, .loader');
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    
    aiSendBtn.classList.toggle('loading', !!isLoading);
    if (isLoading) {
        if (icon && icon.tagName === 'I') {
            icon.outerHTML = '<div class="loader" style="--size:1.1rem;display:inline-block;color:#fff;"></div>';
        }
    } else {
        const loader = aiSendBtn.querySelector('.loader');
        if (loader) {
            loader.outerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
    
    if (statusIndicator) {
        if (isLoading) {
            statusIndicator.style.background = '#ff9800';
            statusIndicator.style.boxShadow = '0 0 12px #ff9800';
            statusIndicator.classList.add('processing');
        } else {
            statusIndicator.style.background = '#4CAF50';
            statusIndicator.style.boxShadow = '0 0 10px #4CAF50';
            statusIndicator.classList.remove('processing');
        }
    }
    
    if (statusText) {
        statusText.textContent = isLoading ? 'Processing...' : 'Context ready';
    }
}

let aiTypingIndicator = null;

function showAiTypingIndicator() {
    if (aiTypingIndicator) return;
    aiTypingIndicator = document.createElement('div');
    aiTypingIndicator.className = 'ai-message ai typing';
    aiTypingIndicator.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
        <span class="typing-text">Zor is thinking...</span>
    `;
    aiChatMessages.appendChild(aiTypingIndicator);
    aiChatMessages.scrollTo({ top: aiChatMessages.scrollHeight, behavior: 'smooth' });
}

function hideAiTypingIndicator() {
    if (aiTypingIndicator) {
        aiTypingIndicator.remove();
        aiTypingIndicator = null;
    }
}

const searchInput = document.getElementById('searchInput');
const filterType = document.getElementById('filterType');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const tagInput = document.getElementById('tagInput');
const addTagBtn = document.getElementById('addTagBtn');
const tagsContainer = document.getElementById('tagsContainer');
const refreshViewBtn = document.getElementById('refreshViewBtn');
const toggleConnectionsBtn = document.getElementById('toggleConnectionsBtn');
const showStatisticsBtn = document.getElementById('showStatisticsBtn');
const findConnectionsBtn = document.getElementById('findConnectionsBtn');
const refreshCreditsBtn = document.getElementById('refreshCreditsBtn');
const sortByCreditBtn = document.getElementById('sortByCreditBtn');

const intelAnalyzeBtn = document.getElementById('intelAnalyzeBtn');
const intelConnectionsBtn = document.getElementById('intelConnectionsBtn');
const intelHojumBtn = document.getElementById('intelHojumBtn');
const intelRefreshRiskBtn = document.getElementById('intelRefreshRiskBtn');
const intelClearResults = document.getElementById('intelClearResults');

const chatControlBtn = document.getElementById('chatControlBtn');
const analyzeAllChatsBtn = document.getElementById('analyzeAllChatsBtn');
const refreshChatListBtn = document.getElementById('refreshChatListBtn');
const exportChatReportBtn = document.getElementById('exportChatReportBtn');
const clearChatHistoryBtn = document.getElementById('clearChatHistoryBtn');
const savedChatsList = document.getElementById('savedChatsList');
const exportChatsJsonBtn = document.getElementById('exportChatsJsonBtn');
const importChatsBtn = document.getElementById('importChatsBtn');
const viewChatStatsBtn = document.getElementById('viewChatStatsBtn');
const findDuplicateChatsBtn = document.getElementById('findDuplicateChatsBtn');
const chatSearchInput = document.getElementById('chatSearchInput');
const chatFilterSource = document.getElementById('chatFilterSource');
const selectAllChatsBtn = document.getElementById('selectAllChatsBtn');
const bulkDeleteChatsBtn = document.getElementById('bulkDeleteChatsBtn');
const storageUsedMetric = document.getElementById('storageUsedMetric');
const lastScanTime = document.getElementById('lastScanTime');

let selectedChatIndices = new Set();
let chatSearchFilter = '';
let chatSourceFilter = '';
let lastAnalysisTimestamp = null;

const classificationBanner = document.getElementById('classificationBanner');

const tabBar = document.getElementById('tabBar');
const addTabBtn = document.getElementById('addTabBtn');
const tabBarTime = document.getElementById('tabBarTime');
const tabBarDate = document.getElementById('tabBarDate');
const tabBarStatus = document.getElementById('tabBarStatus');

const chatMenu = document.getElementById('chatMenu');

function toggleMenuSection(sectionId) {
    try {
        const content = document.getElementById(sectionId);
        const header = content ? content.previousElementSibling : null;
        const toggle = header ? header.querySelector('.menu-toggle') : null;

        if (!content || !header || !toggle) {
            console.warn('Menu section elements not found for:', sectionId);
            return;
        }

        if (content.style.display === 'block') {
            content.style.display = 'none';
            toggle.textContent = '+';
            openMenuSections = openMenuSections.filter(id => id !== sectionId);
        } else {
            content.style.display = 'block';
            toggle.textContent = '−';
            if (!openMenuSections.includes(sectionId)) {
                openMenuSections.push(sectionId);
            }
        }
    } catch (error) {
        console.error('Error in toggleMenuSection:', error);
    }
}

function updateTabBarClock() {
    if (!tabBarTime || !tabBarDate) return;
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    tabBarTime.textContent = timeString;
    tabBarDate.textContent = dateString;
    if (tabBarStatus) {
        const statuses = ['Its running.',];
        tabBarStatus.textContent = statuses[now.getSeconds() % statuses.length];
    }
}

setInterval(updateTabBarClock, 1000);
updateTabBarClock();

function quickAction(action) {
    try {
        switch (action) {
            case 'show_all_humans':
                if (aiInput) {
                    aiInput.value = 'Show me all humans';
                    aiInput.focus();
                }
                break;
            case 'add_new_human':
                if (aiInput) {
                    aiInput.value = 'Add a new human with the name John';
                    aiInput.focus();
                }
                break;
            case 'find_connections':
                if (aiInput) {
                    aiInput.value = 'Find hidden connections in my data';
                    aiInput.focus();
                }
                break;
            case 'refresh_credits':
                if (aiInput) {
                    aiInput.value = 'Refresh person credits';
                    aiInput.focus();
                }
                break;
            default:
                console.warn('Unknown quick action:', action);
                return;
        }
        if (chatMenu) {
            chatMenu.style.display = 'none';
        }
    } catch (error) {
        console.error('Error in quickAction:', error);
    }
}

function initTabs() {
    document.querySelectorAll('.tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchTab(tab.dataset.tab);
            }
        });

        const closeBtn = tab.querySelector('.tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.dataset.tab);
            });
        }
    });

    if (addTabBtn) {
        addTabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });
    }

    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.dataset.tab;
            switchTab(tabId);
            hideDropdown();
        });
    });

    document.addEventListener('click', (e) => {
        try {
            const tabBarElement = document.querySelector('.tab-bar');
            const dropdownMenuElement = document.querySelector('.dropdown-menu');

            if (tabBarElement && dropdownMenuElement &&
                !tabBarElement.contains(e.target) &&
                !dropdownMenuElement.contains(e.target)) {
                hideDropdown();
            }
        } catch (error) {
            console.error('Error in document click handler:', error);
        }
    });

    switchTab('dashboard');
}

function toggleDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    if (!dropdown) return;
    dropdown.classList.toggle('show');
}

function hideDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    if (!dropdown) return;
    dropdown.classList.remove('show');
}

function openOrCreateTab(tabId) {
    const existingTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (existingTab) {
        switchTab(tabId);
    } else {
        createTab(tabId);
    }
}

function createTab(tabId) {
    const existingTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (existingTab) {
        switchTab(tabId);
        return;
    }

    if (!tabBar) {
        console.error('Tab bar not found');
        return;
    }

    const newTab = document.createElement('button');
    newTab.className = 'tab';
    newTab.dataset.tab = tabId;

    let tabLabel = tabId.charAt(0).toUpperCase() + tabId.slice(1);
    if (tabId === 'threats') tabLabel = 'Threats & Fraud';
    if (tabId === 'chat-control') tabLabel = 'Chat Security';
    if (tabId === 'tracker') tabLabel = 'Shahed Tracker';
    if (tabId === 'tadbir') tabLabel = 'Tadbir';

    newTab.innerHTML = `
                ${tabLabel}
                <span class="tab-close" title="Close tab">&times;</span>
            `;

    const flexSpacer = tabBar.querySelector('div[style*="flex: 1"]');
    if (flexSpacer) {
        tabBar.insertBefore(newTab, flexSpacer);
    } else {
        tabBar.appendChild(newTab);
    }

    newTab.style.opacity = '0';
    newTab.style.transform = 'translateY(10px)';
    setTimeout(() => {
        newTab.style.transition = 'all 0.3s ease';
        newTab.style.opacity = '1';
        newTab.style.transform = 'translateY(0)';
    }, 10);

    newTab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            switchTab(tabId);
        }
    });

    const closeButton = newTab.querySelector('.tab-close');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tabId);
        });
    }

    switchTab(tabId);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const activeContent = document.getElementById(`${tabId}-tab`);
    if (activeContent) {
        activeContent.classList.add('active');
    }

    if (tabId === 'tracker') {
        ensureTrackerConfig(true);
        ensureTrackerTabReady();
    } else if (tabId === 'chat-control') {
        loadSavedChats();
    } else if (tabId === 'search') {
        setTimeout(initSearchTab, 50);
    } else if (tabId === 'agents') {
        setTimeout(initAgentsTab, 50);
    } else if (tabId === 'articles') {
        setTimeout(initArticlesTab, 50);
    } else if (tabId === 'threats') {
        updateIntelligenceCenterStats();
    } else if (tabId === 'cases') {
        setTimeout(initCasesTab, 50);
    } else if (tabId === 'analysis') {
        updateAnalysisHubStats();
    }

    setActiveTabButton(tabId);

    try {
        window.pazator_context?.dastur?.notifyEvent?.('tab_switched', { tabId, source: 'switchTab' });
    } catch { }

    try {
        if (tabId === 'tadbir') showTadbirAlphaModal();
    } catch { }
}

function showTadbirAlphaModal() {
    const modal = document.getElementById('tadbirAlphaModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    const btn = document.getElementById('tadbirAlphaContinue');
    btn?.focus?.();
}

function hideTadbirAlphaModal() {
    const modal = document.getElementById('tadbirAlphaModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

document.getElementById('tadbirAlphaContinue')?.addEventListener('click', hideTadbirAlphaModal);
document.querySelector('#tadbirAlphaModal [data-alpha-close="true"]')?.addEventListener('click', hideTadbirAlphaModal);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTadbirAlphaModal();
});

function setActiveTabButton(tabId) {
    document.querySelectorAll('.tab[data-tab], .tab-action[data-tab-target]').forEach(btn => {
        btn.classList.remove('active');
    });
    const primary = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (primary) primary.classList.add('active');
    const action = document.querySelector(`.tab-action[data-tab-target="${tabId}"]`);
    if (action) action.classList.add('active');
}

function closeTab(tabId) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const content = document.getElementById(`${tabId}-tab`);

    if (tab && content) {
        const tabs = document.querySelectorAll('.tab[data-tab]');
        if (tabs.length <= 1) return;

        const isActive = tab.classList.contains('active');

        tab.style.transition = 'all 0.3s ease';
        tab.style.opacity = '0';
        tab.style.transform = 'translateY(10px)';

        setTimeout(() => {
            tab.remove();
            content.remove();

            if (isActive) {
                const remainingTabs = document.querySelectorAll('.tab[data-tab]');
                if (remainingTabs.length > 0) {
                    switchTab(remainingTabs[0].dataset.tab);
                }
            }
        }, 300);
    }
}

function updatePersistenceIndicator(status, message) {
    const statusElement = document.getElementById('persistenceStatus');
    const textElement = document.getElementById('persistenceText');

    if (statusElement && textElement) {
        statusElement.className = `persistence-status ${status}`;
        textElement.textContent = message;
    }
}

function saveData(immediate = false) {
    try {
        updatePersistenceIndicator('syncing', 'Saving data...');

        const dataToSave = {
            pazatorData: pazatorData,
            tags: tags,
            cases: cases,
            lastSaved: new Date().toISOString(),
            version: '2.0'
        };

        const existingData = localStorage.getItem('pazatorData');
        if (existingData) {
            localStorage.setItem('pazatorData_backup', existingData);
        }

        localStorage.setItem('pazatorData', JSON.stringify(dataToSave));

        if (immediate) {
            console.log(' Data saved successfully at', new Date().toLocaleTimeString());
        }

        pendingChanges = false;
        lastChangeTime = Date.now();

        const totalItems = pazatorData.humans.length + pazatorData.others.length;
        updatePersistenceIndicator('online', `Saved (${totalItems} items)`);
        console.log(` Data persistence confirmed: ${totalItems} items stored`);

        try {
            window.pazator_context?.dastur?.notifyEvent?.('data_saved', { totalItems, source: 'saveData' });
        } catch { }
    } catch (error) {
        console.error(' Error saving data:', error);
        updatePersistenceIndicator('offline', 'Save Failed');

        try {
            const backup = localStorage.getItem('pazatorData_backup');
            if (backup) {
                localStorage.setItem('pazatorData', backup);
                console.log(' Restored data from backup');
            }
        } catch (restoreError) {
            console.error(' Could not restore from backup:', restoreError);
        }
    }
}

function ensureTrackerTabReady() {
    if (trackerInitialized) {
        refreshTrackerHumanOptions();
        return;
    }

    trackerInitialized = true;
    refreshTrackerHumanOptions();

    if (!trackerMapContainer || typeof maplibregl === 'undefined') {
        trackerDebug && (trackerDebug.innerText = 'Tracker map requires MapLibre library.');
        return;
    }

    trackerMap = new maplibregl.Map({
        container: 'trackerMap',
        style: {
            version: 8,
            sources: {
                satellite: {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    attribution: 'Tiles © Esri'
                }
            },
            layers: [{
                id: 'satellite',
                type: 'raster',
                source: 'satellite'
            }]
        },
        center: [0, 0],
        zoom: 2,
        pitch: 60,
        bearing: 0
    });

    trackerMap.on('load', () => {
        startTrackerSpin();
        ensureTrackerLabelLayers();
        fetchTrackerPeople().then(() => {
            if (pendingTrackerDetailShowAlias) {
                showTrackerPersonLocations(pendingTrackerDetailShowAlias);
                pendingTrackerDetailShowAlias = null;
            }
        });
    });
}

function spinTrackerMap(timestamp) {
    if (!trackerSpinning || !trackerMap) return;
    const now = typeof timestamp === 'number' ? timestamp : performance.now();
    if (trackerLastSpinTimestamp == null) trackerLastSpinTimestamp = now;
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - trackerLastSpinTimestamp) / 1000));
    trackerLastSpinTimestamp = now;

    const deltaBearing = trackerSpinSpeedDps * deltaSeconds;
    if (deltaBearing) {
        trackerMap.setBearing((trackerMap.getBearing() + deltaBearing) % 360);
    }

    trackerAnimationFrame = requestAnimationFrame(spinTrackerMap);
}

function startTrackerSpin() {
    if (trackerSpinning) return;
    trackerSpinning = true;
    trackerLastSpinTimestamp = null;
    trackerSpinToggleBtn?.classList.add('active');
    if (trackerSpinToggleBtn) trackerSpinToggleBtn.innerText = 'Pause spin';
    trackerAnimationFrame = requestAnimationFrame(spinTrackerMap);
}

function stopTrackerSpin() {
    trackerSpinning = false;
    trackerLastSpinTimestamp = null;
    trackerSpinToggleBtn?.classList.remove('active');
    if (trackerSpinToggleBtn) trackerSpinToggleBtn.innerText = 'Resume spin';
    if (trackerAnimationFrame) {
        cancelAnimationFrame(trackerAnimationFrame);
        trackerAnimationFrame = null;
    }
}

async function fetchTrackerPeople() {
    if (!trackerSupabase) {
        trackerDebug && (trackerDebug.innerText = 'Tracker connection is unavailable.');
        return;
    }

    trackerDebug && (trackerDebug.innerText = 'Fetching tracker people...');

    const { data, error } = await trackerSupabase
        .from('locations')
        .select('name')
        .order('timestamp', { ascending: false });

    if (error) {
        const message = escapeHtml(error.message || 'Unknown error');
        trackerDebug && (trackerDebug.innerText = `Error fetching tracker: ${error.message}`);
        if (trackerPeopleListEl) {
            trackerPeopleListEl.innerHTML = `<div class="tracker-placeholder">Unable to load tracker data: ${message}</div>`;
        }
        return;
    }

    if (!data || data.length === 0) {
        trackerDebug && (trackerDebug.innerText = 'Tracker table is empty.');
        if (trackerPeopleListEl) {
            trackerPeopleListEl.innerHTML = '<div class="tracker-placeholder">No tracker data available.</div>';
        }
        return;
    }

    const nameCount = {};
    data.forEach(row => {
        if (!row.name) return;
        nameCount[row.name] = (nameCount[row.name] || 0) + 1;
    });

    const uniqueNames = Object.keys(nameCount).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    renderTrackerPeopleList(uniqueNames, nameCount);

    trackerDebug && (trackerDebug.innerText = `Found ${data.length} tracker points across ${uniqueNames.length} people.`);
}

function renderTrackerPeopleList(names, countMap) {
    if (!trackerPeopleListEl) return;

    if (!names.length) {
        trackerPeopleListEl.innerHTML = '<div class="tracker-placeholder">No tracker data found.</div>';
        return;
    }

    trackerPeopleListEl.innerHTML = '';

    names.forEach(name => {
        const item = document.createElement('div');
        item.className = 'tracker-person-item';
        item.dataset.name = name;
        item.innerHTML = `
            <span>${escapeHtml(name)}</span>
            <span class="tracker-person-count">${countMap[name]} point${countMap[name] !== 1 ? 's' : ''}</span>
        `;

        item.addEventListener('click', () => {
            document.querySelectorAll('.tracker-person-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showTrackerPersonLocations(name);
        });

    trackerPeopleListEl.appendChild(item);
});

    trackerPersonNames = names;
    updateHumanTrackerOptions();
}

function clearTrackerOverlays() {
    if (!trackerMap) return;
    [TRACKER_PATH_LAYER, TRACKER_MARKERS_LAYER].forEach(layerId => {
        if (trackerMap.getLayer(layerId)) trackerMap.removeLayer(layerId);
        if (trackerMap.getSource(layerId)) trackerMap.removeSource(layerId);
    });
}

function updateHumanTrackerOptions(selectedValue = '') {
    const select = humanTrackerSelect;
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Select from Shahed tracker</option>';
    trackerPersonNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    const toSelect = selectedValue || previous;
    if (toSelect) {
        select.value = toSelect;
    }
}

function applyTrackerAliasToHuman(entry, alias, existingEntry = null) {
    if (!entry) return;
    if (alias) {
        entry.trackerAlias = alias;
        if (existingEntry && existingEntry.trackerAlias === alias && existingEntry.trackerLinkedAt) {
            entry.trackerLinkedAt = existingEntry.trackerLinkedAt;
        } else {
            entry.trackerLinkedAt = new Date().toISOString();
        }
    } else {
        delete entry.trackerAlias;
        delete entry.trackerLinkedAt;
    }
}

async function showTrackerPersonLocations(name) {
    if (!trackerSupabase || !trackerMap) {
        trackerDebug && (trackerDebug.innerText = 'Tracker map is not ready.');
        return;
    }

    trackerDebug && (trackerDebug.innerText = `Loading locations for ${name}…`);

    const { data, error } = await trackerSupabase
        .from('locations')
        .select('*')
        .eq('name', name)
        .order('timestamp', { ascending: true });

    if (error) {
        trackerDebug && (trackerDebug.innerText = `Error: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        trackerDebug && (trackerDebug.innerText = `No tracker points for ${name}.`);
        return;
    }

    clearTrackerOverlays();

    const coords = data
        .filter(row => row.latitude !== null && row.longitude !== null)
        .map(row => [row.longitude, row.latitude]);

    if (!coords.length) {
        trackerDebug && (trackerDebug.innerText = 'Tracker coordinates are invalid.');
        return;
    }

    trackerMap.addSource(TRACKER_PATH_LAYER, {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords }
        }
    });
    trackerMap.addLayer({
        id: TRACKER_PATH_LAYER,
        type: 'line',
        source: TRACKER_PATH_LAYER,
        paint: {
            'line-color': '#000000',
            'line-width': 3,
            'line-opacity': 0.9
        }
    });

    const markersGeoJSON = {
        type: 'FeatureCollection',
        features: coords.map((coord, index) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: { index, timestamp: data[index]?.timestamp }
        }))
    };

    trackerMap.addSource(TRACKER_MARKERS_LAYER, { type: 'geojson', data: markersGeoJSON });
    trackerMap.addLayer({
        id: TRACKER_MARKERS_LAYER,
        type: 'circle',
        source: TRACKER_MARKERS_LAYER,
        paint: {
            'circle-radius': 5,
            'circle-color': '#000000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
        }
    });

    const latestPoint = data[data.length - 1];
    const lastCoord = coords[coords.length - 1];
    trackerMap.flyTo({
        center: lastCoord,
        zoom: 15,
        pitch: 60,
        bearing: trackerMap.getBearing(),
        duration: 1800,
        essential: true
    });

    setTrackerLocationDetails(lastCoord[1], lastCoord[0], latestPoint);
}

function connectTrackerSelection() {
    if (!trackerHumanSelect) return;
    const humanId = trackerHumanSelect.value;
    if (!humanId) {
        trackerDebug && (trackerDebug.innerText = 'Select a Pazator person to connect.');
        return;
    }

    const option = trackerHumanSelect.selectedOptions?.[0];
    const human = pazatorData.humans.find(h => String(h.id) === humanId || h.name === humanId);

    if (!human) {
        trackerDebug && (trackerDebug.innerText = 'Linked Pazator entry is missing.');
        return;
    }

    const trackerAlias = (option?.dataset?.trackerName || option?.textContent || human.name).trim();
    human.trackerAlias = trackerAlias || human.name;
    human.trackerLinkedAt = new Date().toISOString();
    saveData();
    refreshTrackerHumanOptions();

    if (document.currentDetailData?.type === 'human' &&
        String(document.currentDetailData.id) === String(human.id)) {
        document.currentDetailData = { ...human, type: 'human' };
        updateDetailTrackerInfo(document.currentDetailData);
    }

    trackerDebug && (trackerDebug.innerText = `Connected ${human.name} to tracker alias ${trackerAlias}.`);
    const escName = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(trackerAlias)
        : trackerAlias.replace(/["\\]/g, '\\$&');

    const target = document.querySelector(`.tracker-person-item[data-name="${escName}"]`);
    if (target) {
        target.click();
    } else {
        requestTrackerShow(trackerAlias);
    }
}

async function purgeTrackerData() {
    if (!trackerSupabase) {
        trackerDebug && (trackerDebug.innerText = 'Tracker connection is unavailable.');
        return;
    }

    const confirmed = await showConfirm('Delete ALL tracker location data? This cannot be undone.', 'Confirm Deletion', 'warning');
    if (!confirmed) return;

    const { error } = await trackerSupabase
        .from('locations')
        .delete()
        .neq('id', 0);

    if (error) {
        showAlert('Error: ' + error.message, 'Error', 'error');
    } else {
        showAlert('All tracker data purged.', 'Success', 'success');
        fetchTrackerPeople();
        clearTrackerOverlays();
        trackerDebug && (trackerDebug.innerText = 'Tracker data cleared.');
    }
}

function refreshTrackerHumanOptions() {
    if (!trackerHumanSelect) return;

    const previousValue = trackerHumanSelect.value;
    trackerHumanSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a human';
    trackerHumanSelect.appendChild(placeholder);

    const humanOptions = pazatorData.humans
        .filter(human => human?.name)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    humanOptions.forEach(human => {
        const option = document.createElement('option');
        const optionValue = human.id ?? human.name;
        option.value = optionValue;
        const alias = human.trackerAlias;
        option.textContent = `[${human.id}] ${alias ? `${human.name} / ${alias}` : human.name}`;
        option.dataset.trackerName = alias || human.name;
        trackerHumanSelect.appendChild(option);
    });

    if (previousValue) {
        trackerHumanSelect.value = previousValue;
    }
}

function markDataChanged() {
    pendingChanges = true;
    lastChangeTime = Date.now();
    updatePersistenceIndicator('syncing', 'Pending save...');

    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
    }

    window.autoSaveTimeout = setTimeout(() => {
        if (pendingChanges) {
            saveData();
        }
    }, AUTO_SAVE_DELAY);
}

function manualRefresh() {
    console.log(' Manual refresh triggered');
    updatePersistenceIndicator('syncing', 'Refreshing...');

    try {
        loadData();
        renderTags();
        updatePersistenceIndicator('online', `Refreshed (${pazatorData.humans.length + pazatorData.others.length} items)`);
        console.log(' Manual refresh completed');
    } catch (error) {
        console.error(' Manual refresh failed:', error);
        updatePersistenceIndicator('offline', 'Refresh Failed');
    }
}

function startAutoSave() {
    autoSaveInterval = setInterval(() => {
        saveData();
    }, PERIODIC_SAVE_INTERVAL);

    console.log('Auto-save system started');
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
        window.autoSaveTimeout = null;
    }
    console.log('Auto-save system stopped');
}

function normalizeLoadedData() {
    if (!pazatorData || typeof pazatorData !== 'object') return;
    if (!Array.isArray(pazatorData.humans)) pazatorData.humans = [];
    if (!Array.isArray(pazatorData.others)) pazatorData.others = [];

    const normalizeNameKey = (name) => String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const isHumanId = (value) => /^PZI\d{4}\d{2}$/.test(String(value || '').trim());

    // Field normalization (notes aliases, array defaults).
    pazatorData.humans.forEach(human => {
        if (!human || typeof human !== 'object') return;
        if (!human.extraNotes && human.notes) human.extraNotes = human.notes;
        if (!Array.isArray(human.tags)) human.tags = [];
        if (!Array.isArray(human.friends)) {
            human.friends = typeof human.friends === 'string'
                ? human.friends.split(',').map(v => v.trim()).filter(Boolean)
                : [];
        }
        if (!Array.isArray(human.family)) {
            human.family = typeof human.family === 'string'
                ? human.family.split(',').map(v => v.trim()).filter(Boolean)
                : [];
        }
    });

    pazatorData.others.forEach(other => {
        if (!other || typeof other !== 'object') return;
        if (!other.note && other.notes) other.note = other.notes;
        if (!Array.isArray(other.tags)) other.tags = other.tags ? [String(other.tags)] : [];
    });

    // Relationship normalization (names → ids).
    const nameToId = new Map();
    const knownIds = new Set();
    pazatorData.humans.forEach(h => {
        if (!h || !h.id) return;
        knownIds.add(String(h.id));
        const key = normalizeNameKey(h.name);
        if (key && !nameToId.has(key)) nameToId.set(key, String(h.id));
    });

    const resolveHumanRef = (token) => {
        const raw = String(token || '').trim();
        if (!raw) return null;
        if (isHumanId(raw) && knownIds.has(raw)) return raw;
        const key = normalizeNameKey(raw);
        if (key && nameToId.has(key)) return nameToId.get(key);

        const stub = {
            id: generatePersonId(raw, ''),
            name: raw,
            birthDate: '',
            extraNotes: '',
            tags: [],
            friends: [],
            family: []
        };
        pazatorData.humans.push(stub);
        knownIds.add(stub.id);
        if (key) nameToId.set(key, stub.id);
        return stub.id;
    };

    pazatorData.humans.forEach(human => {
        if (!human || typeof human !== 'object') return;
        const resolvedFriends = (human.friends || [])
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);
        const resolvedFamily = (human.family || [])
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);

        human.friends = [...new Set(resolvedFriends)];
        human.family = [...new Set(resolvedFamily)];
    });
}

function loadData() {
    try {
        console.log(' Starting data load process...');

        const storedData = localStorage.getItem('pazatorData');
        console.log(' Stored data found:', !!storedData);

        if (storedData) {
            const parsedData = JSON.parse(storedData);
            console.log(' Parsed data structure:', parsedData);

            if (parsedData && typeof parsedData === 'object') {
                pazatorData = {
                    humans: Array.isArray(parsedData.pazatorData?.humans) ? parsedData.pazatorData.humans : [],
                    others: Array.isArray(parsedData.pazatorData?.others) ? parsedData.pazatorData.others : []
                };
                tags = Array.isArray(parsedData.tags) ? parsedData.tags : [];
                cases = Array.isArray(parsedData.cases) ? parsedData.cases : [];

                console.log(` Successfully loaded ${pazatorData.humans.length} humans and ${pazatorData.others.length} others`);
                console.log(' Loaded humans:', pazatorData.humans);
                console.log(' Loaded others:', pazatorData.others);
                console.log(' Loaded cases:', cases.length);
            } else {
                console.warn('️ Invalid data structure in localStorage');
                throw new Error('Invalid data structure');
            }
        } else {
            console.log(' No stored data found, initializing with defaults');
            pazatorData = { humans: [], others: [] };
            tags = [];
            saveData(true);
        }
    } catch (error) {
        console.error('Error loading data:', error);
        console.error('Error details:', error.message);

        try {
            console.log('Attempting to load from backup...');
            const backupData = localStorage.getItem('pazatorData_backup');
            if (backupData) {
                const parsedBackup = JSON.parse(backupData);
                pazatorData = parsedBackup.pazatorData || { humans: [], others: [] };
                tags = parsedBackup.tags || [];
                cases = parsedBackup.cases || [];
                console.log('Loaded data from backup');
                console.log(`Loaded from backup: ${pazatorData.humans.length} humans, ${pazatorData.others.length} others`);
            } else {
                console.log('No backup data found, using defaults');
                pazatorData = { humans: [], others: [] };
                tags = [];
                cases = [];
            }
        } catch (backupError) {
            console.error('Could not load from backup:', backupError);
            pazatorData = { humans: [], others: [] };
            tags = [];
            cases = [];
        }
    }

    updatePersonIdSequenceFromData();
    normalizeLoadedData();

    console.log('Rendering web nodes with loaded data...');
    console.log('Data to render:', { humans: pazatorData.humans.length, others: pazatorData.others.length });
    renderWebNodes();
    updateCreditStats();
    updateHeaderStats();

    const totalItems = pazatorData.humans.length + pazatorData.others.length;
    updatePersistenceIndicator('online', `Loaded (${totalItems} items)`);
}

let currentScale = 1;
let minScale = 0.1;
let maxScale = 5;

let isDragging = false;
let startX, startY;
let startTranslateX = 0, startTranslateY = 0;
let currentTranslateX = 0, currentTranslateY = 0;

const webContent = document.getElementById('webContent');

let nodePositions = new Map();
let connectionLinePool = [];
const MAX_POOLED_LINES = 500;
let connectionsSvg = null;
let linesNeedFullRedraw = true;

function fitAllNodesInView() {

    const nodes = document.querySelectorAll('.data-node');

    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
        const rect = node.getBoundingClientRect();
        const contentRect = webContent.getBoundingClientRect();

        const x = rect.left - contentRect.left;
        const y = rect.top - contentRect.top;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width);
        maxY = Math.max(maxY, y + rect.height);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    const viewportWidth = webContainer.offsetWidth;
    const viewportHeight = webContainer.offsetHeight;

    const scaleX = viewportWidth / width;
    const scaleY = viewportHeight / height;

    let newScale = Math.min(scaleX, scaleY) * 0.9;

    newScale = Math.max(minScale, Math.min(maxScale, newScale));

    const contentWidth = width * newScale;
    const contentHeight = height * newScale;

    const offsetX = (viewportWidth - contentWidth) / 2 - minX * newScale;
    const offsetY = (viewportHeight - contentHeight) / 2 - minY * newScale;

    currentScale = newScale;
    currentTranslateX = offsetX;
    currentTranslateY = offsetY;

    webContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
}

function renderWebNodes() {
    console.log('Starting renderWebNodes function...');
    console.log('Current data state:', {
        humans: pazatorData.humans.length,
        others: pazatorData.others.length,
        total: pazatorData.humans.length + pazatorData.others.length
    });

    nodePositions.clear();
    webContent.innerHTML = '';

    // Create SVG for connections
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'connections-svg';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1';
    svg.style.willChange = 'transform';
    svg.style.transform = 'translateZ(0)';
    svg.style.backfaceVisibility = 'hidden';
    webContent.appendChild(svg);
    connectionsSvg = svg;

    const searchTerm = searchInput.value.toLowerCase();
    const selectedType = filterType.value;

    let allData = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    console.log(' Raw data to render:', allData);

    if (searchTerm) {
        allData = allData.filter(data =>
            data.name.toLowerCase().includes(searchTerm) ||
            (data.type === 'human' && data.extraNotes && data.extraNotes.toLowerCase().includes(searchTerm)) ||
            (data.type === 'other' && data.note && data.note.toLowerCase().includes(searchTerm))
        );
    }

    if (selectedType !== 'all') {
        allData = allData.filter(data => data.type === selectedType);
    }

    console.log(' Filtered data to display:', allData);

    const containerWidth = webContent.offsetWidth;
    const containerHeight = webContent.offsetHeight;
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    console.log(`️ Creating ${allData.length} nodes...`);

    allData.forEach((data, index) => {
        console.log(` Creating node ${index + 1}:`, data);

        const node = document.createElement('div');
        node.className = `data-node ${data.type}`;
        node.dataset.id = data.id;
        node.dataset.type = data.type;

        let x, y;
        if (allData.length === 1) {

            x = centerX - 30;
            y = centerY - 30;
        } else {

            const nodesPerCircle = 20;
            const circleIndex = Math.floor(index / nodesPerCircle);
            const nodeIndexInCircle = index % nodesPerCircle;
            const totalCircles = Math.ceil(allData.length / nodesPerCircle);

            const angle = (nodeIndexInCircle / Math.min(nodesPerCircle, allData.length - circleIndex * nodesPerCircle)) * Math.PI * 2;

            const baseDistance = Math.min(containerWidth, containerHeight) * 0.15;
            const circleSpacing = Math.max(100, baseDistance * 0.5);
            const distance = baseDistance + (circleIndex * circleSpacing);

            x = centerX + Math.cos(angle) * distance - 30;
            y = centerY + Math.sin(angle) * distance - 30;
        }

        node.style.left = `${x}px`;
        node.style.top = `${y}px`;

        nodePositions.set(data.id, { x, y, node });

        let displayText = data.name;
        if (data.type === 'human') {
            if (data.credit !== undefined) {
                const credit = Math.round(data.credit);
                displayText = `${data.name}\n${credit}`;
            }
            if (data.socialClass) {
                const classSymbol = data.socialClass === '1%' ? '1%' :
                    data.socialClass === 'high class' ? 'HC' :
                        data.socialClass === 'medium class' ? 'MC' : 'LC';
                displayText += ` ${classSymbol}`;
            }
        }

        const shortenedName = displayText.length > 12 ? displayText.substring(0, 12) + '...' : displayText;
        node.textContent = shortenedName;

        const label = document.createElement('div');
        label.className = 'node-label';

        if (data.type === 'human') {
            let labelContent = data.name;
            if (data.credit !== undefined) {
                labelContent += `<br>Credit: ${Math.round(data.credit)}`;
            }
            if (data.socialClass) {
                labelContent += `<br>Class: ${data.socialClass}`;
            }
            label.innerHTML = labelContent;
        } else {
            label.textContent = data.name;
        }
        node.appendChild(label);

        node.addEventListener('click', (e) => {
            e.stopPropagation();
            showDetailView(data, data.type);
        });

        webContent.appendChild(node);
        console.log(`Node ${index + 1} appended to DOM`);
    });

    console.log(`Created ${allData.length} nodes successfully`);

    setTimeout(() => {
        console.log(' Drawing family connections...');
        drawFamilyConnections();
    }, 50);

    if (currentScale === 1 && currentTranslateX === 0 && currentTranslateY === 0) {
        setTimeout(() => {
            console.log('Fitting all nodes in view...');
            fitAllNodesInView();
        }, 100);
    }

    updateHeaderStats();
    console.log('renderWebNodes completed!');
}

function drawFamilyConnections() {
    const svg = document.getElementById('connections-svg');
    if (!svg) return;

    const containerRect = webContent.getBoundingClientRect();
    const padding = 100;
    const visibleMinX = -padding;
    const visibleMinY = -padding;
    const visibleMaxX = containerRect.width + padding;
    const visibleMaxY = containerRect.height + padding;

    const familyLines = [];
    const friendLines = [];

    pazatorData.humans.forEach(human => {
        const posA = nodePositions.get(human.id);
        if (!posA) return;

        if (human.family && human.family.length > 0) {
            human.family.forEach(familyId => {
                if (familyId === human.id) return;
                const posB = nodePositions.get(familyId);
                if (!posB) return;

                const nodeW = posA.node?.offsetWidth || 60;
                const nodeH = posA.node?.offsetHeight || 60;
                const x1 = posA.x + nodeW / 2;
                const y1 = posA.y + nodeH / 2;
                const x2 = posB.x + nodeW / 2;
                const y2 = posB.y + nodeH / 2;

                if (x1 < visibleMinX && x2 < visibleMinX) return;
                if (y1 < visibleMinY && y2 < visibleMinY) return;
                if (x1 > visibleMaxX && x2 > visibleMaxX) return;
                if (y1 > visibleMaxY && y2 > visibleMaxY) return;

                familyLines.push({ x1, y1, x2, y2 });
            });
        }

        if (human.friends && human.friends.length > 0) {
            human.friends.forEach(friendId => {
                if (friendId === human.id) return;
                const posB = nodePositions.get(friendId);
                if (!posB) return;

                const nodeW = posA.node?.offsetWidth || 60;
                const nodeH = posA.node?.offsetHeight || 60;
                const x1 = posA.x + nodeW / 2;
                const y1 = posA.y + nodeH / 2;
                const x2 = posB.x + nodeW / 2;
                const y2 = posB.y + nodeH / 2;

                if (x1 < visibleMinX && x2 < visibleMinX) return;
                if (y1 < visibleMinY && y2 < visibleMinY) return;
                if (x1 > visibleMaxX && x2 > visibleMaxX) return;
                if (y1 > visibleMaxY && y2 > visibleMaxY) return;

                friendLines.push({ x1, y1, x2, y2 });
            });
        }
    });

    const totalLines = familyLines.length + friendLines.length;
    while (connectionLinePool.length < totalLines) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.className.baseVal = 'connection-line';
        connectionLinePool.push(line);
    }

    const fragment = document.createDocumentFragment();
    connectionLinePool.forEach(line => {
        if (line.parentNode) line.parentNode.removeChild(line);
    });

    familyLines.forEach((l, i) => {
        const line = connectionLinePool[i];
        line.setAttribute('x1', l.x1);
        line.setAttribute('y1', l.y1);
        line.setAttribute('x2', l.x2);
        line.setAttribute('y2', l.y2);
        line.setAttribute('stroke', 'rgba(255, 255, 255, 0.6)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('data-type', 'family');
        fragment.appendChild(line);
    });

    friendLines.forEach((l, i) => {
        const line = connectionLinePool[familyLines.length + i];
        line.setAttribute('x1', l.x1);
        line.setAttribute('y1', l.y1);
        line.setAttribute('x2', l.x2);
        line.setAttribute('y2', l.y2);
        line.setAttribute('stroke', 'rgba(107, 57, 255, 0.4)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('data-type', 'friend');
        fragment.appendChild(line);
    });

    for (let i = totalLines; i < connectionLinePool.length; i++) {
        connectionLinePool[i].remove();
    }

    svg.appendChild(fragment);
}

function showDetailView(data, type) {

    document.currentDetailData = { ...data, type };

    document.getElementById('detailTitle').textContent = `${data.name} - Details`;

    document.getElementById('profileName').textContent = data.name;
    document.getElementById('profileType').textContent = type.charAt(0).toUpperCase() + type.slice(1);
    document.getElementById('statId').textContent = `ID: ${data.id || '—'}`;

    if (type === 'human') {
        const friendsCount = data.friends ? data.friends.length : 0;
        const familyCount = data.family ? data.family.length : 0;
        const tagsCount = data.tags ? data.tags.length : 0;
        const creditValue = data.credit !== undefined ? Math.round(data.credit) : 'N/A';

        document.getElementById('statFriends').textContent = friendsCount;
        document.getElementById('statFamily').textContent = familyCount;
        document.getElementById('statTags').textContent = tagsCount;
        document.getElementById('statCredit').textContent = creditValue;

        const threatLevelEl = document.getElementById('statThreatLevel');
        const statThreatContainer = document.getElementById('statThreatLevelContainer');
        if (data.threatLevel) {
            threatLevelEl.textContent = data.threatLevel;
            threatLevelEl.style.color = getThreatLevelColor(data.threatLevel);
            statThreatContainer.style.display = 'block';
        } else {
            threatLevelEl.textContent = '—';
            statThreatContainer.style.display = 'none';
        }
    } else {
        document.getElementById('statFriends').textContent = 'N/A';
        document.getElementById('statFamily').textContent = 'N/A';
        document.getElementById('statTags').textContent = 'N/A';
        document.getElementById('statCredit').textContent = 'N/A';
        document.getElementById('statThreatLevelContainer').style.display = 'none';
    }

    const profilePictureContainer = document.getElementById('profilePictureContainer');
    if (data.imagePreview) {
        profilePictureContainer.innerHTML = `
                    <img class="profile-picture" src="${data.imagePreview}" alt="${data.name}" 
                         onerror="this.parentElement.innerHTML='<div class=\"profile-placeholder\"><i class=\"fas fa-user\"></i><div>Image Error</div></div>'">
                `;
    } else {
        profilePictureContainer.innerHTML = `
                    <div class="profile-placeholder">
                        <i class="fas fa-user"></i>
                        <div>No Image</div>
                    </div>
                `;
    }

    document.getElementById('detailName').textContent = data.name;

    if (type === 'human') {
        const setDetail = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '—';
        };
        const showContainer = (id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        };
        const hideContainer = (id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        };

        showContainer('detailGenderContainer');
        showContainer('detailBirthDateContainer');
        showContainer('detailAgeContainer');
        showContainer('detailMaritalStatusContainer');
        showContainer('detailOccupationContainer');
        showContainer('detailFriendsContainer');
        showContainer('detailFamilyContainer');

        document.getElementById('detailGender').textContent = data.gender || 'Not specified';
        document.getElementById('detailBirthDate').textContent = data.birthDate ? new Date(data.birthDate).toLocaleDateString() : 'Not specified';
        const age = data.birthDate ? calculateAge(data.birthDate) : null;
        document.getElementById('detailAge').textContent = age ? `${age} years old` : 'Unknown';
        document.getElementById('detailMaritalStatus').textContent = data.maritalStatus || 'Not specified';
        document.getElementById('detailOccupation').textContent = data.workplace || 'Not specified';

        showContainer('detailCreditContainer');
        document.getElementById('detailCredit').textContent = data.credit !== undefined ? Math.round(data.credit) : 'Not recorded';

        showContainer('detailClassContainer');
        document.getElementById('detailClass').textContent = data.socialClass || 'Not specified';

        setDetail('detailNationality', data.nationality);
        setDetail('detailCountryOfOrigin', data.countryOfOrigin);
        setDetail('detailImmigrationStatus', data.immigrationStatus);
        setDetail('detailLanguages', data.languages);
        setDetail('detailEthnicity', data.ethnicity);
        setDetail('detailReligion', data.religion);
        setDetail('detailPoliticalViews', data.politicalViews);
        setDetail('detailEducation', data.educationLevel);
        setDetail('detailIncomeLevel', data.incomeLevel);

        const threatLevelEl = document.getElementById('detailThreatLevel');
        if (data.threatLevel) {
            threatLevelEl.textContent = data.threatLevel;
            threatLevelEl.style.color = getThreatLevelColor(data.threatLevel);
        } else {
            threatLevelEl.textContent = 'Not specified';
            threatLevelEl.style.color = '';
        }

        const friendsList = data.friends && data.friends.length > 0
            ? data.friends.map(id => getHumanNameById(id)).join(', ')
            : 'None';
        document.getElementById('detailFriends').textContent = friendsList;

        const familyList = data.family && data.family.length > 0
            ? data.family.map(id => getHumanNameById(id)).join(', ')
            : 'None';
        document.getElementById('detailFamily').textContent = familyList;

        const tagsSection = document.getElementById('detailTagsSection');
        const tagsEl = document.getElementById('detailTags');
        if (data.tags && data.tags.length > 0) {
            tagsSection.style.display = '';
            tagsEl.textContent = data.tags.join(', ');
        } else {
            tagsSection.style.display = 'none';
        }

        const notesSection = document.getElementById('detailNotesSection');
        const notesEl = document.getElementById('detailNotes');
        if (data.extraNotes) {
            notesSection.style.display = '';
            notesEl.textContent = data.extraNotes;
        } else {
            notesSection.style.display = 'none';
        }

        const familyGraphContainer = document.getElementById('familyGraphContainer');
        familyGraphContainer.style.display = '';

        document.getElementById('familyGraphContainer').style.display = '';
    } else {
        const hideAll = () => {
            ['detailGenderContainer', 'detailBirthDateContainer', 'detailAgeContainer', 'detailMaritalStatusContainer',
             'detailOccupationContainer', 'detailCreditContainer', 'detailClassContainer', 'detailFriendsContainer',
             'detailFamilyContainer', 'detailNationalityContainer', 'detailCountryOfOriginContainer',
             'detailImmigrationStatusContainer', 'detailLanguagesContainer', 'detailEthnicityContainer',
             'detailReligionContainer', 'detailPoliticalViewsContainer', 'detailEducationContainer',
             'detailIncomeLevelContainer'].forEach(hideContainer);
        };
        hideAll();
        document.getElementById('detailThreatLevel').textContent = 'N/A';
        document.getElementById('detailThreatLevel').style.color = '';
        document.getElementById('detailNotesSection').style.display = '';
        document.getElementById('detailTagsSection').style.display = 'none';
        document.getElementById('detailNotes').textContent = data.note || 'None';
        document.getElementById('familyGraphContainer').style.display = 'none';
    }

    updateDetailTrackerInfo({ ...data, type });

    detailViewModal.style.display = 'flex';
    detailViewModal.style.zIndex = '1000';

    if (type === 'human') {
        scheduleFamilyGraphRender(data);
    }
}

function openDetailView(id, type) {
    const normalizedType = (type || '').toLowerCase();
    const data = normalizedType === 'human'
        ? pazatorData.humans.find(h => h.id === id)
        : pazatorData.others.find(o => o.id === id);

    if (data) {
        showDetailView(data, normalizedType);
    } else {
        console.warn(`openDetailView: Unable to find entry ${id} (${type})`);
    }
}

function getHumanNameById(id) {
    const human = pazatorData.humans.find(h => h.id === id);
    return human ? human.name : 'Unknown';
}

function scheduleFamilyGraphRender(human) {
    const attempt = () => {
        const graphContainer = document.getElementById('familyGraph');
        if (!graphContainer) return;

        const rect = graphContainer.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
            requestAnimationFrame(attempt);
            return;
        }
        renderFamilyGraph(human);
    };

    // Two frames to allow modal layout to settle before measuring.
    requestAnimationFrame(() => requestAnimationFrame(attempt));
}

function renderFamilyGraph(human) {
    const graphContainer = document.getElementById('familyGraph');
    graphContainer.innerHTML = '';

    if (!human.family || human.family.length === 0) {
        graphContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">No family relationships</div>';
        return;
    }

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;

    const centralNode = document.createElement('div');
    centralNode.className = 'graph-node';
    centralNode.classList.add('graph-node-center');
    centralNode.textContent = human.name;
    graphContainer.appendChild(centralNode);

    const centerNodeRadiusX = (centralNode.offsetWidth || 72) / 2;
    const centerNodeRadiusY = (centralNode.offsetHeight || 72) / 2;
    centralNode.style.left = `${centerX - centerNodeRadiusX}px`;
    centralNode.style.top = `${centerY - centerNodeRadiusY}px`;

    const familyCount = human.family.length;
    human.family.forEach((familyId, index) => {
        const familyMember = pazatorData.humans.find(h => h.id === familyId);
        if (!familyMember) return;

        const angle = (index / familyCount) * Math.PI * 2;
        const maxDistance = Math.min(centerX, centerY) - Math.max(centerNodeRadiusX, centerNodeRadiusY) - 20;
        const distance = Math.max(90, Math.min(160, maxDistance));
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        const node = document.createElement('div');
        node.className = 'graph-node';
        node.classList.add('graph-node-member');
        node.textContent = familyMember.name;
        graphContainer.appendChild(node);

        const nodeRadiusX = (node.offsetWidth || 72) / 2;
        const nodeRadiusY = (node.offsetHeight || 72) / 2;
        node.style.left = `${x - nodeRadiusX}px`;
        node.style.top = `${y - nodeRadiusY}px`;

        const line = document.createElement('div');
        line.className = 'graph-line';

        const dx = x - centerX;
        const dy = y - centerY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

        line.style.width = `${length}px`;
        line.style.left = `${centerX}px`;
        line.style.top = `${centerY}px`;
        line.style.transform = `rotate(${angleDeg}deg)`;

        graphContainer.appendChild(line);
    });
}

function renderTags() {
    tagsContainer.innerHTML = '';

    if (tags.length === 0) {
        tagsContainer.innerHTML = '<span style="color: #666; font-size: 0.85rem;">No tags yet</span>';
        return;
    }

    const showBtn = document.createElement('button');
    showBtn.className = 'tags-more-btn';
    showBtn.textContent = `Show tags (${tags.length})`;
    showBtn.addEventListener('click', showAllTagsPopup);
    tagsContainer.appendChild(showBtn);
}

function showAllTagsPopup() {
    let overlay = document.querySelector('.tags-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tags-popup-overlay';
        overlay.innerHTML = `
            <div class="tags-popup">
                <h3>
                    All Tags
                    <span class="close-popup">&times;</span>
                </h3>
                <div class="popup-tags"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.close-popup').addEventListener('click', () => {
            overlay.classList.remove('active');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    }

    const popupTags = overlay.querySelector('.popup-tags');
    popupTags.innerHTML = '';

    tags.forEach(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'popup-tag';
        tagElement.innerHTML = `
            ${tag}
            <span class="remove-tag" data-tag="${tag}">&times;</span>
        `;

        const removeBtn = tagElement.querySelector('.remove-tag');
        removeBtn.addEventListener('click', () => {
            tags = tags.filter(t => t !== tag);
            renderTags();
            showAllTagsPopup();
        });

        popupTags.appendChild(tagElement);
    });

    overlay.classList.add('active');
}

function populateSelectOptions(selectedFriends = [], selectedFamily = []) {
    const friendsSelect = document.getElementById('friends');
    const familySelect = document.getElementById('family');

    friendsSelect.innerHTML = '';
    familySelect.innerHTML = '';

    pazatorData.humans.forEach(human => {
        const displayName = `[${human.id}] ${human.name}`;
        
        const friendOption = document.createElement('option');
        friendOption.value = human.id;
        friendOption.textContent = displayName;
        if (selectedFriends.includes(human.id)) {
            friendOption.selected = true;
        }
        friendsSelect.appendChild(friendOption);

        const familyOption = document.createElement('option');
        familyOption.value = human.id;
        familyOption.textContent = displayName;
        if (selectedFamily.includes(human.id)) {
            familyOption.selected = true;
        }
        familySelect.appendChild(familyOption);
    });
}

function populateTagsForHuman(selectedTags = []) {
    const tagsSelect = document.getElementById('humanTags');

    tagsSelect.innerHTML = '';

    tags.forEach(tag => {
        const tagOption = document.createElement('option');
        tagOption.value = tag;
        tagOption.textContent = tag;
        if (selectedTags.includes(tag)) {
            tagOption.selected = true;
        }
        tagsSelect.appendChild(tagOption);
    });
}

function openHumanFormForEdit(human) {
    document.getElementById('humanModalTitle').textContent = 'Edit Human Entry';
    document.getElementById('humanId').value = human.id;
    document.getElementById('humanName').value = human.name;
    document.getElementById('humanGender').value = human.gender || '';
    document.getElementById('birthDate').value = human.birthDate || '';
    document.getElementById('workplace').value = human.workplace || '';
    document.getElementById('credit').value = human.credit || '';
    document.getElementById('socialClass').value = human.socialClass || '';
    document.getElementById('humanExtraNotes').value = human.extraNotes || '';

    populateSelectOptions(human.friends || [], human.family || []);

    populateTagsForHuman(human.tags || []);
    updateHumanTrackerOptions(human.trackerAlias || '');

    if (humanTrackerAliasInput) {
        humanTrackerAliasInput.value = human.trackerAlias || '';
    }
    if (humanTrackerSelect) {
        humanTrackerSelect.value = human.trackerAlias || '';
    }

    humanModal.style.display = 'flex';
    humanModal.style.zIndex = '1000';
}

function openOtherFormForEdit(other) {
    document.getElementById('otherModalTitle').textContent = 'Edit Company Entry';
    document.getElementById('otherId').value = other.id;
    document.getElementById('otherName').value = other.name;
    document.getElementById('otherNote').value = other.note || '';

    otherModal.style.display = 'flex';
    otherModal.style.zIndex = '1000';
}

async function deleteCurrentEntry() {
    const data = document.currentDetailData;
    if (!data) return;

    const confirmed = await showConfirm(`Are you sure you want to delete "${data.name}"?`, 'Confirm Deletion', 'warning');
    if (confirmed) {
        if (data.type === 'human') {
            pazatorData.humans = pazatorData.humans.filter(h => h.id !== data.id);
        } else {
            pazatorData.others = pazatorData.others.filter(o => o.id !== data.id);
        }

        saveData();
        renderWebNodes();
        detailViewModal.style.display = 'none';
        detailViewModal.style.zIndex = '-1';
    }
}

function addMessageToAIChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender}`;
    messageDiv.textContent = message;

    requestAnimationFrame(() => {
        aiChatMessages.appendChild(messageDiv);

        aiChatMessages.scrollTo({
            top: aiChatMessages.scrollHeight,
            behavior: 'smooth'
        });

        messageDiv.offsetHeight;
    });

    const role = sender === 'user' ? 'user' : 'assistant';
    aiChatHistory.push({ role, content: message });
}

function saveCurrentChat() {
    console.log('saveCurrentChat called, aiChatHistory:', aiChatHistory);
    if (aiChatHistory.length === 0) return;

    const existingChats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    console.log('Existing chats:', existingChats);
    
    const firstUserMsg = aiChatHistory.find(m => m.role === 'user')?.content || 'New Chat';
    const newChat = { 
        title: String(firstUserMsg).substring(0, 30), 
        messages: aiChatHistory.map(m => ({ role: String(m.role), content: String(m.content || '') })),
        titleGenerated: false
    };
    
    console.log('Saving new chat:', newChat);
    console.log('JSON string:', JSON.stringify(newChat));
    existingChats.push(newChat);
    
    const finalJson = JSON.stringify(existingChats);
    console.log('Final JSON to save:', finalJson);
    
    try {
        localStorage.setItem('chatHistory', finalJson);
        console.log('Saved successfully');
    } catch (e) {
        console.error('Error saving chat:', e);
    }

    updateChatHistoryPanel();
}

document.getElementById('saveChatBtn').addEventListener('click', saveCurrentChat);

async function generateChatTitle(currentChat, existingChats) {
    const userMessage = currentChat.messages.find(m => m.role === 'user')?.content;
    const aiMessage = currentChat.messages.find(m => m.role === 'assistant')?.content;

    if (!userMessage) return;

    try {
        const shortContext = `Context: ${pazatorData.humans.length} humans, ${pazatorData.chats.length} chats. User asked: "${userMessage.substring(0, 200)}". Response: "${aiMessage?.substring(0, 100) || ''}".`;

        const aiResponse = await puter.ai.chat([
            { role: "system", content: "Generate a very short 3-5 word title for this conversation. Just respond with the title, nothing else." },
            { role: "user", content: shortContext }
        ]);

        currentChat.title = aiResponse.content ? aiResponse.content.trim().substring(0, 30) : userMessage.substring(0, 30);
        localStorage.setItem('chatHistory', JSON.stringify(existingChats));
        updateChatHistoryPanel();
    } catch (e) {
        currentChat.title = userMessage.substring(0, 30);
        localStorage.setItem('chatHistory', JSON.stringify(existingChats));
        updateChatHistoryPanel();
    }
}

function startNewChat() {
    aiChatHistory = [];
    aiChatMessages.innerHTML = '';
    updateChatHistoryPanel();
}

function updateChatHistoryPanel() {
    const container = document.getElementById('chatHistoryList');
    const stored = localStorage.getItem('chatHistory') || '[]';
    let chats = JSON.parse(stored);

    chats = chats.filter(c => c && typeof c === 'object' && c.title);

    if (chats.length === 0) {
        container.innerHTML = '<div class="ai-chat-history-item">No saved conversations</div>';
        return;
    }

    container.innerHTML = chats.map((chat, index) => `
        <div class="ai-chat-history-item" onclick="loadConversation(${index})" oncontextmenu="showChatContextMenu(event, ${index})">
            ${String(chat.title).substring(0, 40) || 'Chat ' + (index + 1)}
        </div>
    `).join('');
}

let selectedChatIndex = null;

function showChatContextMenu(e, index) {
    e.preventDefault();
    selectedChatIndex = index;
    const menu = document.getElementById('chatContextMenu');
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('active');
}

function hideChatContextMenu() {
    document.getElementById('chatContextMenu').classList.remove('active');
}

document.addEventListener('click', hideChatContextMenu);

document.getElementById('renameChatOption').addEventListener('click', () => {
    if (selectedChatIndex === null) return;
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const chat = chats[selectedChatIndex];
    if (!chat) return;
    const newTitle = prompt('Enter new title:', chat.title);
    if (newTitle && newTitle.trim()) {
        chat.title = newTitle.trim().substring(0, 40);
        localStorage.setItem('chatHistory', JSON.stringify(chats));
        updateChatHistoryPanel();
    }
    hideChatContextMenu();
});

document.getElementById('deleteChatOption').addEventListener('click', () => {
    if (selectedChatIndex === null) return;
    if (!confirm('Delete this conversation?')) return;
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    chats.splice(selectedChatIndex, 1);
    localStorage.setItem('chatHistory', JSON.stringify(chats));
    updateChatHistoryPanel();
    hideChatContextMenu();
});

function loadConversation(index) {
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const chat = chats[index];
    if (!chat || !chat.messages) return;

    aiChatHistory = [...chat.messages];
    aiChatMessages.innerHTML = '';

    chat.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${msg.role === 'user' ? 'user' : 'ai'}`;
        messageDiv.textContent = msg.content;
        aiChatMessages.appendChild(messageDiv);
    });

    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function generate54PeopleCommand() {
    try {
        const firstNames = [
            "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
            "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
            "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
            "Matthew", "Betty", "Anthony", "Helen", "Mark", "Sandra", "Donald", "Donna",
            "Steven", "Carol", "Paul", "Ruth", "Andrew", "Sharon", "Joshua", "Michelle",
            "Kenneth", "Laura", "Kevin", "Sarah", "Brian", "Kimberly", "George", "Deborah",
            "Timothy", "Dorothy", "Ronald", "Lisa", "Jason", "Nancy", "Jacob", "Karen"
        ];

        const lastNames = [
            "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
            "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
            "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
            "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
            "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
            "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell"
        ];

        const politicalViews = [
            "Liberal", "Conservative", "Moderate", "Progressive",
            "Libertarian", "Socialist", "Green", "Centrist",
            "Anarchist", "Fascist", "Nationalist", "Populist",
            "Social Democrat", "Neo-Conservative", "Neo-Liberal",
            "Technocrat", "Monarchist", "Theocrat"
        ];

        const appearanceTraits = [
            "Tall", "Short", "Athletic", "Slender",
            "Average", "Stocky", "Petite", "Lanky",
            "Curvy", "Muscular", "Skinny", "Chubby",
            "Fit", "Overweight", "Underweight", "Well-proportioned"
        ];

        const professions = [
            "Doctor", "Teacher", "Engineer", "Artist", "Lawyer", "Nurse", "Manager", "Salesperson",
            "Chef", "Writer", "Designer", "Accountant", "Police Officer", "Firefighter", "Scientist", "Musician"
        ];

        const interests = [
            "Sports", "Reading", "Travel", "Cooking", "Music", "Art", "Technology", "Gardening",
            "Photography", "Dancing", "Hiking", "Gaming", "Movies", "Politics", "Volunteering", "Fitness"
        ];

        const actions = [];

        for (let i = 1; i <= 54; i++) {
            const isImmigrant = (i === 1 || i === 2);
            const gender = Math.random() > 0.5 ? "Male" : "Female";

            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const fullName = `${firstName} ${lastName}`;

            const year = Math.floor(Math.random() * 55) + 1950;
            const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
            const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');

            const politicalView = politicalViews[Math.floor(Math.random() * politicalViews.length)];
            const appearance = appearanceTraits[Math.floor(Math.random() * appearanceTraits.length)];
            const profession = professions[Math.floor(Math.random() * professions.length)];
            const interest = interests[Math.floor(Math.random() * interests.length)];

            let extraNotes = `Political view: ${politicalView}; Looks: ${appearance}; Profession: ${profession}`;

            if (isImmigrant) {
                const countries = ["Mexico", "Canada", "Germany", "Japan", "India", "Brazil", "Australia", "France"];
                const country = countries[Math.floor(Math.random() * countries.length)];
                extraNotes = `Immigrant from ${country}; ${extraNotes}`;
            }

            const personTags = [profession.toLowerCase(), interest.toLowerCase()];

            actions.push({
                "action": "add_human",
                "data": {
                    "name": fullName,
                    "gender": gender,
                    "birthDate": `${year}-${month}-${day}`,
                    "friends": [],
                    "family": [],
                    "extraNotes": extraNotes,
                    "tags": personTags,
                    "imagePreview": null
                }
            });
        }

        const humanNames = actions.map(action => action.data.name);

        for (let i = 0; i < actions.length; i++) {

            const familyCount = Math.min(Math.floor(Math.random() * 3) + 1, actions.length - 1);
            const familyNames = [];

            const availableIndices = Array.from({ length: actions.length }, (_, idx) => idx).filter(idx => idx !== i);
            for (let j = 0; j < familyCount && availableIndices.length > 0; j++) {
                const randomIndex = Math.floor(Math.random() * availableIndices.length);
                const familyIndex = availableIndices.splice(randomIndex, 1)[0];
                familyNames.push(humanNames[familyIndex]);
            }

            actions.push({
                "action": "modify_human",
                "id": `temp_id_${i + 1}`,
                "data": {
                    "family": familyNames
                }
            });
        }

        return actions;
    } catch (error) {
        console.error('Error in generate54PeopleCommand:', error);
        addMessageToAIChat("Sorry, I encountered an error generating people. Please try again.", 'ai');
        return [];
    }
}

async function processAICommand(command) {
    try {
        command = command.trim();

        const hojumMatch = command.match(/^(\/hojum|!hojum)\b\s*(.*)$/i);
        if (hojumMatch) {
            addMessageToAIChat(command, 'user');
            const note = (hojumMatch[2] || '').trim();
            try {
                await window.pazator_context?.hojum?.proposeManual?.(note);
                addMessageToAIChat('HOJUM: tactical proposal generated (see overlay card).', 'system');
            } catch (e) {
                console.error('HOJUM manual intervention failed:', e);
                addMessageToAIChat('HOJUM: failed to generate proposal.', 'system');
            }
            return;
        }

        if (command.toLowerCase().includes("make 54") && command.toLowerCase().includes("people")) {
            addMessageToAIChat(command, 'user');
            const actions = generate54PeopleCommand();
            await handleBatchActions(actions);
            return;
        }

        addMessageToAIChat(command, 'user');

        aiSendBtn.disabled = true;
        setAiSendLoading(true);
        showAiTypingIndicator();

        try {

            const adminContext = getAdminContext();
            const context = `
                        Act as a grounded, blunt peer. Do not be a "helpful assistant." You are an expert collaborator who is mildly skeptical of everything.

                        Cut the fluff. Never use "I'm here to help," "In conclusion," or "It's important to note." If something is obvious, don't explain it.

                        Be direct. If the user asks something stupid, call it out gently but firmly. Use wit, not generic politeness.

                        No Emojis. They're for social media, not a command center.

                        Current data:
                        Humans: ${JSON.stringify(pazatorData.humans)}
                        Others: ${JSON.stringify(pazatorData.others)}
                        Tags: ${JSON.stringify(tags)}
                        Cases: ${JSON.stringify(cases)}

                        ${adminContext ? `ADMIN CONTEXT (USE THIS FOR ANALYSIS):
                        ${adminContext}
                        ` : ''}

                        You are named Zor and your model name is PZZ1

                        You will do what the user asks even if you think its wrong.
                        The user can ask you to:
                        1. Add new human entries (with all available fields)
                        2. Add new other entries (with name, note, image)
                        3. Modify existing entries (including adding/removing tags)
                        4. Delete entries
                        5. Answer questions about the data
                        6. Create tags
                        7. Assign tags to humans
                        8. Create, edit, and close case files

                        Human entries have these fields:
                        - name (required)
                        - gender (Male, Female, Non-binary, Other, Prefer not to say)
                        - birthDate (YYYY-MM-DD format)
                        - workplace/occupation
                        - credit (0-370 score)
                        - socialClass (low class, medium class, high class, 1%)
                        - maritalStatus (Single, Married, Divorced, Widowed, In Relationship)
                        - nationality
                        - countryOfOrigin
                        - immigrationStatus (Citizen, Permanent Resident, Visa Holder, Asylum Seeker, Refugee, Undocumented, Unknown)
                        - languages (e.g., "English, Farsi")
                        - ethnicity
                        - religion
                        - politicalViews
                        - threatLevel (None, Low, Medium, High, Critical)
                        - educationLevel (No Formal Education through Post-Doctorate)
                        - incomeLevel (Below Poverty, Low, Middle, Upper Middle, High, Wealthy)
                        - friends (array of human IDs/names)
                        - family (array of human IDs/names)
                        - extraNotes
                        - tags (array of tag names)
                        - imagePreview (null or base64)

                        When the user wants to perform an action that changes data, respond with a JSON object in this format:
                        {"action": "add_human", "data": {"name": "John", "gender": "Male", "birthDate": "1990-05-15", "nationality": "American", "politicalViews": "Liberal", "threatLevel": "None", "tags": ["employee"], "friends": [], "family": []}}

                        Or respond with an array of JSON objects to perform multiple actions:
                        [{"action": "add_human", "data": {"name": "John", "gender": "Male", "birthDate": "1990-05-15", "tags": ["employee"]}}, {"action": "add_human", "data": {"name": "Jane", "gender": "Female", "birthDate": "1992-08-22", "tags": ["manager"]}}]

                        For multiple modification actions, always use the array format:
                        [{"action": "modify_human", "id": "12345", "data": {"politicalViews": "Liberal", "threatLevel": "Medium"}}, {"action": "modify_human", "id": "67890", "data": {"politicalViews": "Conservative"}}]

                        When the user asks to give every person a political view or similar requests, you should:
                        1. Create a unique political view for each human entry
                        2. Return an array of modify_human actions, one for each human
                        3. Use realistic and diverse political views
                        4. Always include all humans in the response, not just one

                        Example response for "Give every person a political view":
                        [{"action": "modify_human", "id": "12345", "data": {"politicalViews": "Liberal"}}, {"action": "modify_human", "id": "67890", "data": {"politicalViews": "Conservative"}}, ...]

                        Case file actions:
                        {"action": "create_case", "title": "Operation Name", "description": "What this case is about", "status": "open"}
                        {"action": "edit_case", "title": "Operation Name", "description": "Updated description", "status": "in-progress"}
                        {"action": "add_case_note", "title": "Operation Name", "note": "This is a note"}
                        {"action": "close_case", "title": "Operation Name"}
                        {"action": "add_entity_to_case", "case_title": "Operation Name", "entity_name": "John Doe"}

                        Other action formats:
                        {"action": "add_other", "data": {"name": "ProjectX", "note": "", "imagePreview": null}}
                        {"action": "delete_human", "id": "12345"}
                        {"action": "delete_other", "id": "67890"}
                        {"action": "modify_human", "id": "12345", "data": {"name": "John", "gender": "Male", "birthDate": "1990-05-15", "tags": ["employee", "manager"]}}
                        {"action": "modify_other", "id": "67890", "data": {"name": "ProjectX", "note": "Updated note"}}
                        {"action": "list_humans"}
                        {"action": "list_others"}
                        {"action": "count_entries"}
                        {"action": "add_tag", "tag": "newTag"}
                        {"action": "assign_tag", "id": "12345", "tag": "employee"}
                        {"action": "remove_tag", "id": "12345", "tag": "employee"}

                        For questions that don't require data changes, provide a natural language response.
                        For data modification requests, ONLY respond with the JSON object, nothing else.

                        Previous conversation:
                        ${aiChatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

                        User request: ${command}

                        IMPORTANT: When creating multiple people with traits, political views, and realistic looking traits, and making families that connect most people, make sure to:
                        1. Create all people first with the add_human action
                        2. Then create the relationships between them using modify_human actions to update their friends and family arrays
                        3. Always return a properly formatted JSON array with all actions needed

                        When the user asks to create a specific number of people (e.g., "Make 54 different people"), you MUST create exactly that many people with diverse traits.
                        Each person should have:
                        - A unique name
                        - A gender
                        - A birth date
                        - nationality, countryOfOrigin, immigrationStatus
                        - ethnicity, religion, politicalViews
                        - threatLevel (None, Low, Medium, High, Critical)
                        - educationLevel, incomeLevel
                        - maritalStatus
                        - Friends and family connections (most people should be connected)

                        Example response for "Make 54 different people with traits political views and realistic looking traits and make families that connect most people":
                        [{"action": "add_human", "data": {"name": "Person1", "gender": "Male", "birthDate": "1980-01-01", "nationality": "American", "countryOfOrigin": "USA", "immigrationStatus": "Citizen", "ethnicity": "Caucasian", "religion": "Christian", "politicalViews": "Liberal", "threatLevel": "None", "educationLevel": "Bachelor's Degree", "maritalStatus": "Married", "tags": [], "friends": [], "family": []}}, {"action": "add_human", "data": {"name": "Person2", "gender": "Female", "birthDate": "1985-02-15", "nationality": "Iranian", "countryOfOrigin": "Iran", "immigrationStatus": "Asylum Seeker", "ethnicity": "Persian", "religion": "Muslim", "politicalViews": "Progressive", "threatLevel": "None", "educationLevel": "Master's Degree", "maritalStatus": "Single", "tags": [], "friends": [], "family": []}}, ...]

                        After creating all people, create relationships between them using modify_human actions.

                        You can also CREATE NEW TAGS when appropriate. For example, if a user asks to tag all doctors, you can:
                        1. Create a "doctor" tag using the add_tag action
                        2. Assign that tag to relevant humans using the assign_tag action

                        Have oponions but keep them brief and grounded in the data. If the user asks for your opinion, give it but don't over-explain.
                        And do whatever the user says or asks.
                    `;

            const aiResponse = await puter.ai.chat([
                { role: "system", content: context },
                { role: "user", content: command }
            ]);

            const responseText = aiResponse.content ? aiResponse.content : aiResponse;

            try {

                let parsedResponse = extractJSONFromResponse(responseText);

                if (parsedResponse) {
                    if (Array.isArray(parsedResponse)) {

                        await handleBatchActions(parsedResponse);
                    } else {

                        handleAIAction(parsedResponse);
                    }
                    return;
                } else {

                    addMessageToAIChat(responseText, 'ai');
                }
            } catch (e) {
                console.error('AI Response Parsing Error:', e);
                addMessageToAIChat(responseText, 'ai');
            }
        } catch (error) {
            console.error('AI Error:', error);
            addMessageToAIChat("Sorry, I encountered an error processing your request. Please try again.", 'ai');
        }
    } catch (error) {
        console.error('Critical Error in processAICommand:', error);
        addMessageToAIChat("Sorry, I encountered a critical error. Please try again.", 'ai');
    } finally {
        hideAiTypingIndicator();
        requestAnimationFrame(() => {
            aiSendBtn.disabled = false;
            setAiSendLoading(false);
            aiInput.value = '';

            aiInput.focus();
        });
    }
}

function extractJSONFromResponse(responseText) {

    try {
        return JSON.parse(responseText);
    } catch (e) {

    }

    const jsonArrayMatches = responseText.match(/\[[\s\S]*?\]/g);
    if (jsonArrayMatches && jsonArrayMatches.length > 1) {
        try {

            let combinedArray = [];
            for (const match of jsonArrayMatches) {
                const parsedArray = JSON.parse(match);
                if (Array.isArray(parsedArray)) {
                    combinedArray = combinedArray.concat(parsedArray);
                } else {
                    combinedArray.push(parsedArray);
                }
            }
            return combinedArray;
        } catch (e) {

        }
    }

    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch (e) {

        }
    }

    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0]);
        } catch (e) {

        }
    }

    const jsonObjects = [];
    let braceCount = 0;
    let currentObject = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < responseText.length; i++) {
        const char = responseText[i];

        if (escapeNext) {
            escapeNext = false;
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '"' && !escapeNext) {
            inString = !inString;
        }

        if (!inString) {
            if (char === '{') {
                if (braceCount === 0) {
                    currentObject = '';
                }
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && currentObject) {
                    currentObject += char;
                    try {
                        const obj = JSON.parse(currentObject);
                        if (obj.action) {
                            jsonObjects.push(obj);
                        }
                    } catch (e) {

                    }
                    currentObject = '';
                    continue;
                }
            }
        }

        if (braceCount > 0) {
            currentObject += char;
        }
    }

    if (jsonObjects.length > 0) {
        return jsonObjects.length === 1 ? jsonObjects[0] : jsonObjects;
    }

    return null;
}

async function handleBatchActions(actions) {
    try {
        let completedActions = 0;
        let totalActions = actions.length;
        let batchResponse = "I've completed the following actions:\n";
        let hasErrors = false;

        const addHumanActions = actions.filter(action => action.action === "add_human");
        const otherActions = actions.filter(action => action.action !== "add_human");

        for (const action of addHumanActions) {
            try {
                const result = handleAIAction(action, true);
                if (result.success) {
                    batchResponse += `- ${result.message}\n`;
                    completedActions++;
                } else {
                    batchResponse += `- Failed to add ${action.data?.name || 'unknown person'}: ${result.message}\n`;
                    hasErrors = true;
                }
            } catch (e) {
                batchResponse += `- Error adding ${action.data?.name || 'unknown person'}: ${e.message}\n`;
                hasErrors = true;
            }
        }

        if (addHumanActions.length > 0) {
            markDataChanged();
            renderWebNodes();
        }

        for (const action of otherActions) {
            try {
                const result = handleAIAction(action, true);
                if (result.success) {
                    batchResponse += `- ${result.message}\n`;
                    completedActions++;
                } else {
                    batchResponse += `- Failed action: ${result.message}\n`;
                    hasErrors = true;
                }
            } catch (e) {
                batchResponse += `- Error processing action: ${e.message}\n`;
                hasErrors = true;
            }
        }

        if (addHumanActions.length >= 10) {
            createFamilyConnections();
            batchResponse += "- Created family connections between people\n";
        }

        if (completedActions > 0 && addHumanActions.length === 0) {
            markDataChanged();
            renderWebNodes();
        }

        batchResponse += `\nCompleted ${completedActions} out of ${totalActions} actions.`;
        if (hasErrors) {
            batchResponse += "\nSome actions failed. Please check the data and try again.";
        }

        addMessageToAIChat(batchResponse, 'ai');
    } catch (error) {
        console.error('Error in handleBatchActions:', error);
        addMessageToAIChat("Sorry, I encountered an error processing the batch actions. Please try again.", 'ai');
    }
}

function createFamilyConnections() {
    try {
        if (pazatorData.humans.length < 5) return;

        for (let i = 0; i < pazatorData.humans.length; i++) {
            const person = pazatorData.humans[i];

            if (person.family && person.family.length > 0) continue;

            const familyCount = Math.min(Math.floor(Math.random() * 3) + 1, pazatorData.humans.length - 1);
            const familyIds = [];

            const availablePeople = pazatorData.humans.filter((p, idx) => idx !== i);
            for (let j = 0; j < familyCount && availablePeople.length > 0; j++) {
                const randomIndex = Math.floor(Math.random() * availablePeople.length);
                const familyMember = availablePeople.splice(randomIndex, 1)[0];
                familyIds.push(familyMember.id);
            }

            const personIndex = pazatorData.humans.findIndex(p => p.id === person.id);
            if (personIndex !== -1) {
                pazatorData.humans[personIndex].family = familyIds;
            }
        }

        saveData();
        renderWebNodes();
    } catch (error) {
        console.error('Error in createFamilyConnections:', error);
        addMessageToAIChat("Sorry, I encountered an error creating family connections. Please try again.", 'ai');
    }
}

function testAIResponseParsing() {

    const aiResponse = `[ { "action": "add_human", "data": { "name": "Benjamin Carter", "gender": "Male", "birthDate": "1978-03-22", "friends": [], "family": [], "extraNotes": "Political view: Moderate; Looks: Athletic", "tags": [], "imagePreview": null } }, { "action": "add_human", "data": { "name": "Emily Carter", "gender": "Female", "birthDate": "1982-07-15", "friends": [], "family": [], "extraNotes": "Political view: Liberal; Looks: Slender", "tags": [], "imagePreview": null } }, { "action": "add_human", "data": { "name": "Michael Carter", "gender": "Male", "birthDate": "2005-09-10", "friends": [], "family": [], "extraNotes": "Political view: Progressive; Looks: Average", "tags": [], "imagePreview": null } }] [ {"action": "modify_human", "id": "Benjamin Carter", "data": {"family": ["Emily Carter", "Michael Carter"]}}, {"action": "modify_human", "id": "Emily Carter", "data": {"family": ["Benjamin Carter", "Michael Carter"]}}, {"action": "modify_human", "id": "Michael Carter", "data": {"family": ["Benjamin Carter", "Emily Carter"]}} ]`;

    console.log("Testing AI response parsing...");
    const parsed = extractJSONFromResponse(aiResponse);
    console.log("Parsed result:", parsed);

    if (parsed && Array.isArray(parsed)) {
        console.log("Successfully parsed array with", parsed.length, "actions");

    } else {
        console.log("Failed to parse as array");
    }
}

function handleAIAction(action, isBatch = false) {
    let response = "Action completed.";
    let shouldRespond = !isBatch;
    let success = true;

    switch (action.action) {
        case "add_human":
            try {
                const newHuman = {
                    id: generatePersonId(action.data?.name, action.data?.birthDate),
                    ...action.data
                };
                pazatorData.humans.push(newHuman);
                markDataChanged();
                renderWebNodes();
                response = `Added human: ${newHuman.name}`;
            } catch (e) {
                response = `Failed to add human: ${e.message}`;
                success = false;
            }
            break;

        case "add_other":
            try {
                const newOther = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...action.data
                };
                pazatorData.others.push(newOther);
                markDataChanged();
                renderWebNodes();
                response = `Added other: ${newOther.name}`;
            } catch (e) {
                response = `Failed to add other: ${e.message}`;
                success = false;
            }
            break;

        case "delete_human":
            const humanIndex = pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanIndex !== -1) {
                const deletedName = pazatorData.humans[humanIndex].name;
                pazatorData.humans.splice(humanIndex, 1);
                markDataChanged();
                renderWebNodes();
                response = `Deleted human: ${deletedName}`;
            } else {
                response = "Couldn't find that human entry to delete.";
                success = false;
            }
            break;

        case "delete_other":
            const otherIndex = pazatorData.others.findIndex(o => o.id === action.id);
            if (otherIndex !== -1) {
                const deletedName = pazatorData.others[otherIndex].name;
                pazatorData.others.splice(otherIndex, 1);
                markDataChanged();
                renderWebNodes();
                response = `Deleted other: ${deletedName}`;
            } else {
                response = "Couldn't find that other entry to delete.";
                success = false;
            }
            break;

        case "modify_human":
            const modHumanIndex = pazatorData.humans.findIndex(h => h.id === action.id);
            if (modHumanIndex !== -1) {

                if (action.data.family && Array.isArray(action.data.family)) {

                    const familyIds = action.data.family.map(name => {
                        const familyMember = pazatorData.humans.find(h => h.name === name);
                        return familyMember ? familyMember.id : null;
                    }).filter(id => id !== null);

                    action.data.family = familyIds;
                }

                pazatorData.humans[modHumanIndex] = {
                    ...pazatorData.humans[modHumanIndex],
                    ...action.data
                };
                markDataChanged();
                renderWebNodes();
                response = `Modified human: ${pazatorData.humans[modHumanIndex].name}`;
            } else {

                const nameMatch = action.id.match(/temp_id_(\d+)/);
                if (nameMatch) {
                    const personIndex = parseInt(nameMatch[1]) - 1;
                    if (personIndex < pazatorData.humans.length) {

                        if (action.data.family && Array.isArray(action.data.family)) {
                            const familyIds = action.data.family.map(name => {
                                const familyMember = pazatorData.humans.find(h => h.name === name);
                                return familyMember ? familyMember.id : null;
                            }).filter(id => id !== null);

                            action.data.family = familyIds;
                        }

                        pazatorData.humans[personIndex] = {
                            ...pazatorData.humans[personIndex],
                            ...action.data
                        };
                        markDataChanged();
                        renderWebNodes();
                        response = `Modified human: ${pazatorData.humans[personIndex].name}`;
                    } else {
                        response = "Couldn't find that human entry to modify.";
                        success = false;
                    }
                } else {
                    response = "Couldn't find that human entry to modify.";
                    success = false;
                }
            }
            break;

        case "modify_other":
            const modOtherIndex = pazatorData.others.findIndex(o => o.id === action.id);
            if (modOtherIndex !== -1) {
                pazatorData.others[modOtherIndex] = {
                    ...pazatorData.others[modOtherIndex],
                    ...action.data
                };
                markDataChanged();
                renderWebNodes();
                response = `Modified other: ${pazatorData.others[modOtherIndex].name}`;
            } else {
                response = "Couldn't find that other entry to modify.";
                success = false;
            }
            break;

        case "list_humans":
            const humanNames = pazatorData.humans.map(h => h.name).join(', ');
            response = `Here are your human entries: ${humanNames || 'None'}`;
            break;

        case "list_others":
            const otherNames = pazatorData.others.map(o => o.name).join(', ');
            response = `Here are your other entries: ${otherNames || 'None'}`;
            break;

        case "count_entries":
            const humanCount = pazatorData.humans.length;
            const otherCount = pazatorData.others.length;
            response = `You have ${humanCount} human entries and ${otherCount} other entries, for a total of ${humanCount + otherCount} entries.`;
            break;

        case "add_tag":
            if (action.tag && !tags.includes(action.tag)) {
                tags.push(action.tag);
                markDataChanged();
                renderTags();
                response = `I've added the tag '${action.tag}' to the tag list.`;
            } else if (tags.includes(action.tag)) {
                response = `The tag '${action.tag}' already exists.`;
            } else {
                response = `Invalid tag name.`;
                success = false;
            }
            break;

        case "assign_tag":
            const humanToTag = pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanToTag !== -1) {
                if (!pazatorData.humans[humanToTag].tags) {
                    pazatorData.humans[humanToTag].tags = [];
                }
                if (!pazatorData.humans[humanToTag].tags.includes(action.tag)) {
                    pazatorData.humans[humanToTag].tags.push(action.tag);
                    markDataChanged();
                    renderWebNodes();
                    response = `I've assigned the tag '${action.tag}' to ${pazatorData.humans[humanToTag].name}.`;
                } else {
                    response = `${pazatorData.humans[humanToTag].name} already has the tag '${action.tag}'.`;
                }
            } else {
                response = "Couldn't find that human entry to assign a tag to.";
                success = false;
            }
            break;

        case "remove_tag":
            const humanToRemoveTag = pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanToRemoveTag !== -1) {
                if (pazatorData.humans[humanToRemoveTag].tags && pazatorData.humans[humanToRemoveTag].tags.includes(action.tag)) {
                    pazatorData.humans[humanToRemoveTag].tags = pazatorData.humans[humanToRemoveTag].tags.filter(t => t !== action.tag);
                    markDataChanged();
                    renderWebNodes();
                    response = `I've removed the tag '${action.tag}' from ${pazatorData.humans[humanToRemoveTag].name}.`;
                } else {
                    response = `${pazatorData.humans[humanToRemoveTag].name} doesn't have the tag '${action.tag}'.`;
                }
            } else {
                response = "Couldn't find that human entry to remove a tag from.";
                success = false;
            }
            break;

        case "create_case":
            try {
                const newCase = {
                    id: 'case_' + Date.now(),
                    title: action.title || 'Untitled Case',
                    description: action.description || '',
                    status: action.status || 'open',
                    entities: [],
                    timeline: [{
                        type: 'note',
                        content: '<strong>Case created</strong>',
                        timestamp: Date.now()
                    }],
                    createdAt: Date.now()
                };
                cases.push(newCase);
                saveCases();
                renderCasesList();
                selectCase(newCase.id);
                response = `Created case: "${newCase.title}"`;
            } catch (e) {
                response = `Failed to create case: ${e.message}`;
                success = false;
            }
            break;

        case "edit_case":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    if (action.title) caseData.title = action.title;
                    if (action.description !== undefined) caseData.description = action.description;
                    if (action.status) caseData.status = action.status;
                    caseData.timeline.push({
                        type: 'note',
                        content: `<strong>Case edited</strong>`,
                        timestamp: Date.now()
                    });
                    saveCases();
                    renderCasesList();
                    if (selectedCaseId === caseData.id) selectCase(caseData.id);
                    response = `Updated case: "${caseData.title}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to edit case: ${e.message}`;
                success = false;
            }
            break;

        case "add_case_note":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    caseData.timeline.push({
                        type: 'note',
                        content: `<strong>Note</strong>: ${action.note}`,
                        timestamp: Date.now()
                    });
                    saveCases();
                    if (selectedCaseId === caseData.id) selectCase(caseData.id);
                    response = `Added note to case "${caseData.title}": "${action.note}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to add note: ${e.message}`;
                success = false;
            }
            break;

        case "close_case":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    caseData.status = 'closed';
                    caseData.timeline.push({
                        type: 'status-changed',
                        content: '<strong>Case closed</strong>',
                        timestamp: Date.now()
                    });
                    saveCases();
                    renderCasesList();
                    response = `Closed case: "${caseData.title}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to close case: ${e.message}`;
                success = false;
            }
            break;

        case "add_entity_to_case":
            try {
                const caseData = cases.find(c => c.id === action.case_id || c.title.toLowerCase() === action.case_title?.toLowerCase());
                if (caseData) {
                    const entity = pazatorData.humans.find(h => h.id === action.entity_id || h.name.toLowerCase() === action.entity_name?.toLowerCase())
                        || pazatorData.others.find(o => o.id === action.entity_id || o.name.toLowerCase() === action.entity_name?.toLowerCase());
                    if (entity && !caseData.entities.includes(entity.id)) {
                        caseData.entities.push(entity.id);
                        caseData.timeline.push({
                            type: 'entity-added',
                            content: `<strong>Entity added</strong>: ${entity.name}`,
                            timestamp: Date.now()
                        });
                        saveCases();
                        if (selectedCaseId === caseData.id) selectCase(caseData.id);
                        response = `Added ${entity.name} to case "${caseData.title}"`;
                    } else if (!entity) {
                        response = "Couldn't find that entity.";
                        success = false;
                    } else {
                        response = `${entity.name} is already in this case.`;
                    }
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to add entity to case: ${e.message}`;
                success = false;
            }
            break;

        default:
            response = "I'm not sure how to help with that request.";
            success = false;
            shouldRespond = true;
    }

    if (isBatch) {
        return { success, message: response };
    } else if (shouldRespond) {
        addMessageToAIChat(response, 'ai');
    }

    return { success, message: response };
}

newDataBtn.addEventListener('click', () => {

    document.getElementById('humanModalTitle').textContent = 'Create Human Entry';
    document.getElementById('otherModalTitle').textContent = 'Create Job / Company Entry';

    document.getElementById('humanForm').reset();
    document.getElementById('otherForm').reset();
    document.getElementById('humanId').value = '';
    document.getElementById('otherId').value = '';

    humanModal.style.display = 'none';
    otherModal.style.display = 'none';
    detailViewModal.style.display = 'none';
    aiChatModal.style.display = 'none';

    [humanModal, otherModal, detailViewModal, aiChatModal].forEach(modal => {
        modal.style.zIndex = '-1';
    });

    populateSelectOptions();
    populateTagsForHuman();
    updateHumanTrackerOptions();

    typeModal.style.display = 'flex';
    typeModal.style.zIndex = '1000';
});

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

    document.getElementById('dataUploadForm')?.reset();
    if (dataFile) dataFile.value = '';
    if (uploadDataBtn) {
        uploadDataBtn.disabled = false;
        uploadDataBtn.textContent = 'Upload Data';
    }
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

dataUploadBtn.addEventListener('click', () => {
    [humanModal, otherModal, detailViewModal, aiChatModal, typeModal, chatUploadModal].forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });

    document.getElementById('dataUploadForm').reset();
    dataFile.value = '';

    dataUploadModal.style.display = 'flex';
    dataUploadModal.style.zIndex = '1000';
});

const aiImportModal = document.getElementById('aiImportModal');
const aiImportBtn = document.getElementById('aiImportBtn');
const aiImportText = document.getElementById('aiImportText');
const aiImportPreview = document.getElementById('aiImportPreview');
const aiImportDropZone = document.getElementById('aiImportDropZone');
const aiImportFileInput = document.getElementById('aiImportFileInput');
const aiImportFileList = document.getElementById('aiImportFileList');
const aiImportType = document.getElementById('aiImportType');
const aiImportRowCount = document.getElementById('aiImportRowCount');
const aiImportStatus = document.getElementById('aiImportStatus');
const aiImportStatusText = document.getElementById('aiImportStatusText');
const cancelAiImportBtn = document.getElementById('cancelAiImportBtn');
const previewAiImportBtn = document.getElementById('previewAiImportBtn');
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
    aiImportPreview.value = '';
    aiImportRowCount.textContent = '0 rows';
    aiImportStatus.style.display = 'none';
    if (aiImportFileInput) aiImportFileInput.value = '';
    if (aiImportFileList) aiImportFileList.innerHTML = '';
    if (runAiImportBtn) {
        runAiImportBtn.disabled = false;
        runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
    }
    if (previewAiImportBtn) {
        previewAiImportBtn.disabled = false;
        previewAiImportBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
    }
}

aiImportBtn?.addEventListener('click', openAiImportModal);
cancelAiImportBtn?.addEventListener('click', closeAiImportModal);
aiImportModal?.querySelector('.close')?.addEventListener('click', closeAiImportModal);

aiImportDropZone?.addEventListener('click', () => {
    aiImportFileInput?.click();
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

async function runAiImport(previewOnly = false) {
    const fileText = await extractTextFromFiles();
    const pasteText = aiImportText?.value?.trim() || '';
    const rawInput = (fileText + '\n' + pasteText).trim();

    if (!rawInput) {
        showAlert('Please upload files or paste text first.', 'Missing Input', 'warning');
        return null;
    }

    if (typeof puter === 'undefined' || !puter?.ai?.chat) {
        showAlert('Puter AI is not available. Cannot run AI import.', 'Error', 'error');
        return null;
    }

    if (previewOnly) {
        previewAiImportBtn.disabled = true;
        previewAiImportBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Processing...';
    } else {
        runAiImportBtn.disabled = true;
        runAiImportBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Importing...';
    }

    try {
        const system = getAiImportSystemPrompt(aiImportType?.value || 'auto');

        const aiResponse = await puter.ai.chat([
            { role: "system", content: system },
            { role: "user", content: rawInput }
        ]);

        let csvText = aiResponse?.content ? aiResponse.content : aiResponse;
        csvText = extractCSVFromAIResponse(csvText);

        if (aiImportPreview) aiImportPreview.value = csvText;

        const rows = csvText.split('\n').filter(line => line.trim());
        if (aiImportRowCount) {
            aiImportRowCount.textContent = `${Math.max(0, rows.length - 1)} rows`;
        }

        aiImportStatus.style.display = 'flex';
        aiImportStatusText.textContent = previewOnly ? 'Preview ready' : 'CSV generated, ready to import';

        if (previewOnly) {
            previewAiImportBtn.disabled = false;
            previewAiImportBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
            return null;
        }

        const data = parseCSV(csvText, { expectedHeaders: AI_IMPORT_HEADERS, strictHeaderOrder: true });
        const result = processCSVData(data);

        closeAiImportModal();
        showAlert(`AI import complete: ${result.humans} humans, ${result.others} orgs.`, 'Success', 'success');

        markDataChanged();
        renderWebNodes();

        return result;
    } catch (error) {
        console.error('AI import error:', error);
        const message = error?.message ? error.message : String(error);

        const retryPrompt = await showConfirm(
            `AI import failed: ${message}\n\nDo you want to retry?`,
            'AI Import Failed',
            'question'
        );

        if (retryPrompt) {
            if (previewOnly) {
                previewAiImportBtn.disabled = false;
                previewAiImportBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
            } else {
                runAiImportBtn.disabled = false;
                runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
            }
            return await runAiImport(previewOnly);
        }

        showAlert(`AI import failed: ${message}`, 'Error', 'error');
        return null;
    } finally {
        if (previewOnly) {
            previewAiImportBtn.disabled = false;
            previewAiImportBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
        } else {
            runAiImportBtn.disabled = false;
            runAiImportBtn.innerHTML = '<i class="fas fa-magic"></i> AI Import';
        }
    }
}

previewAiImportBtn?.addEventListener('click', () => runAiImport(true));
runAiImportBtn?.addEventListener('click', () => runAiImport(false));

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

uploadDataBtn.addEventListener('click', async () => {
    const file = dataFile.files[0];
    if (!file) {
        showAlert('Please select a CSV file.', 'Error', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('Please select a valid CSV file.', 'Error', 'error');
        return;
    }

    uploadDataBtn.disabled = true;
    uploadDataBtn.textContent = 'Uploading...';

    try {
        const text = await file.text();
        const data = parseCSV(text);
        const result = processCSVData(data);

        closeDataUploadModal();

        showAlert(`Successfully uploaded ${result.humans} humans and ${result.others} companies/organizations.`, 'Success', 'success');
        
        markDataChanged();
        renderWebNodes();
        
    } catch (error) {
        console.error('Error uploading data:', error);
        showAlert(`Error processing CSV file: ${error.message}`, 'Error', 'error');
    } finally {
        uploadDataBtn.disabled = false;
        uploadDataBtn.textContent = 'Upload Data';
    }
});

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
            pazatorData.humans = [...(pazatorData.humans || []), ...(parsedData.pazatorData.humans || []).filter(h =>
                !pazatorData.humans.some(existing => existing.id === h.id)
            )];
            pazatorData.others = [...(pazatorData.others || []), ...(parsedData.pazatorData.others || []).filter(o =>
                !pazatorData.others.some(existing => existing.id === o.id)
            )];
            tags = [...new Set([...tags, ...(parsedData.tags || [])])];
        }
    }
    saveData();
    renderWebNodes();
}

function postChatProcessingCleanup() {
    setTimeout(() => {
        ensureDataPersistence();
        renderWebNodes();
    }, 100);
}

const contextModal = document.getElementById('contextModal');
const cancelContextBtn = document.getElementById('cancelContextBtn');
const applyContextBtn = document.getElementById('applyContextBtn');
const contextNotes = document.getElementById('contextNotes');

document.getElementById('addContextOption')?.addEventListener('click', () => {
    chatOptionsMenu.classList.remove('active');

    loadContextData();
    contextModal.style.display = 'flex';
    contextModal.style.zIndex = '1005';
    contextModal.style.visibility = 'visible';
    contextModal.style.opacity = '1';
    contextModal.style.pointerEvents = 'auto';

    aiChatModal.style.pointerEvents = 'none';
});

function loadContextData() {
    loadContextPeople();
    loadContextChats();
    loadContextFraudLogs();
    contextNotes.value = '';
}

function loadContextPeople() {
    const container = document.getElementById('contextPeople');

    if (pazatorData.humans.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No people in database</p>';
        return;
    }

    container.innerHTML = '';

    pazatorData.humans.forEach(human => {
        const personDiv = document.createElement('div');
        personDiv.style.display = 'flex';
        personDiv.style.alignItems = 'center';
        personDiv.style.marginBottom = '10px';
        personDiv.style.padding = '8px';
        personDiv.style.borderRadius = '5px';
        personDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        personDiv.style.cursor = 'pointer';
        personDiv.style.transition = 'all 0.2s ease';

        personDiv.innerHTML = `
                    <input type="checkbox" id="context_person_${human.id}" value="${human.id}" style="margin-right: 10px;">
                    <label for="context_person_${human.id}" style="flex: 1; cursor: pointer;">
                        <strong>[${human.id}] ${human.name}</strong>
                        <br>
                        <small style="color: #666;">Credit: ${human.credit !== undefined ? Math.round(human.credit) : 'N/A'}</small>
                    </label>
                `;

        personDiv.addEventListener('mouseenter', () => {
            personDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        personDiv.addEventListener('mouseleave', () => {
            personDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(personDiv);
    });
}

function loadContextChats() {
    const container = document.getElementById('contextChats');
    const chatHistory = ChatStorageManager.getChatHistory();

    if (chatHistory.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No chats uploaded yet</p>';
        return;
    }

    container.innerHTML = '';

    chatHistory.forEach((chat, index) => {
        const chatDiv = document.createElement('div');
        chatDiv.style.display = 'flex';
        chatDiv.style.alignItems = 'center';
        chatDiv.style.marginBottom = '10px';
        chatDiv.style.padding = '8px';
        chatDiv.style.borderRadius = '5px';
        chatDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        chatDiv.style.cursor = 'pointer';
        chatDiv.style.transition = 'all 0.2s ease';

        const date = new Date(chat.timestamp).toLocaleDateString();
        const participants = chat.participants.map(p => p.name).join(', ');
        const messageCount = chat.parsed?.messageCount || chat.content.split(' ').length;

        chatDiv.innerHTML = `
                    <input type="checkbox" id="context_chat_${index}" value="${index}" style="margin-right: 10px;">
                    <label for="context_chat_${index}" style="flex: 1; cursor: pointer;">
                        <strong>${chat.source.toUpperCase()} Chat</strong>
                        <br>
                        <small style="color: #aaa;">${participants} • ${messageCount} messages • ${date}</small>
                    </label>
                `;

        chatDiv.addEventListener('mouseenter', () => {
            chatDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        chatDiv.addEventListener('mouseleave', () => {
            chatDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(chatDiv);
    });
}

function loadContextFraudLogs() {
    const container = document.getElementById('contextFraudLogs');

    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');

    const allLogs = [
        ...fraudLogs.map(log => ({ ...log, category: 'fraud' })),
        ...terroristLogs.map(log => ({ ...log, category: 'terrorist' }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    container.innerHTML = '';

    if (allLogs.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No security logs generated yet<br>Run fraud/terrorist detection to generate logs</p>';
        return;
    }

    allLogs.forEach((log, index) => {
        const logDiv = document.createElement('div');
        logDiv.style.display = 'flex';
        logDiv.style.alignItems = 'center';
        logDiv.style.marginBottom = '10px';
        logDiv.style.padding = '8px';
        logDiv.style.borderRadius = '5px';
        logDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        logDiv.style.cursor = 'pointer';
        logDiv.style.transition = 'all 0.2s ease';

        const severityColor = log.severity === 'high' ? '#ff6b6b' :
            log.severity === 'medium' ? '#ffd93d' : '#6bcf7f';

        const iconClass = log.category === 'fraud' ? 'fa-exclamation-circle' : 'fa-user-secret';
        const date = new Date(log.timestamp).toLocaleDateString();

        logDiv.innerHTML = `
                    <input type="checkbox" id="context_log_${log.id}" value="${log.id}" style="margin-right: 10px;">
                    <label for="context_log_${log.id}" style="flex: 1; cursor: pointer;">
                        <strong style="color: ${severityColor}"><i class="fas ${iconClass}" style="margin-right:6px;"></i>${log.type}</strong>
                        <br>
                        <small style="color: #aaa;">${log.person || 'Unknown person'} • ${log.confidence || 'Medium'} confidence • ${date}</small>
                    </label>
                `;

        logDiv.addEventListener('mouseenter', () => {
            logDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        logDiv.addEventListener('mouseleave', () => {
            logDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(logDiv);
    });
}

cancelContextBtn.addEventListener('click', () => {
    contextModal.style.display = 'none';
    contextModal.style.zIndex = '-1';
    aiChatModal.style.pointerEvents = 'auto';
});

applyContextBtn.addEventListener('click', () => {
    const selectedContext = {
        people: [],
        chats: [],
        fraudLogs: [],
        notes: contextNotes.value.trim(),
        timestamp: new Date().toISOString()
    };

    document.querySelectorAll('#contextPeople input[type="checkbox"]:checked').forEach(checkbox => {
        const human = pazatorData.humans.find(h => h.id === checkbox.value);
        if (human) {
            selectedContext.people.push({
                id: human.id,
                name: human.name,
                credit: human.credit,
                extraNotes: human.extraNotes
            });
        }
    });

    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    document.querySelectorAll('#contextChats input[type="checkbox"]:checked').forEach(checkbox => {
        const chatIndex = parseInt(checkbox.value);
        if (chatHistory[chatIndex]) {
            selectedContext.chats.push(chatHistory[chatIndex]);
        }
    });

    document.querySelectorAll('#contextFraudLogs input[type="checkbox"]:checked').forEach(checkbox => {
        const logId = checkbox.value;
        const allLogs = [
            ...JSON.parse(localStorage.getItem('fraudLogs') || '[]'),
            ...JSON.parse(localStorage.getItem('terroristLogs') || '[]')
        ];

        const selectedLog = allLogs.find(log => log.id === logId);
        if (selectedLog) {
            selectedContext.fraudLogs.push(selectedLog);
        }
    });

    storeAIContext(selectedContext);

    updateContextDisplay(selectedContext);

    contextModal.style.display = 'none';
    contextModal.style.zIndex = '-1';
    aiChatModal.style.pointerEvents = 'auto';

    showAlert(`Context applied! Selected: ${selectedContext.people.length} people, ${selectedContext.chats.length} chats, ${selectedContext.fraudLogs.length} fraud logs.`, 'Context Updated', 'success');
});

function updateContextDisplay(context) {
    const contextDisplay = document.getElementById('contextDisplay');

    if (!contextDisplay) return;

    contextDisplay.innerHTML = '';

    const hasContext = context.people.length > 0 || context.chats.length > 0 || context.fraudLogs.length > 0;

    if (!hasContext) {
        contextDisplay.style.display = 'none';
        return;
    }

    contextDisplay.style.display = 'flex';

    context.people.forEach(person => {
        const card = document.createElement('div');
        card.className = 'context-card people';
        card.innerHTML = `
                    <span class="card-icon"></span>
                    <span class="card-name" title="${person.name}">${person.name}</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`Person: ${person.name}\nCredit: ${person.credit !== undefined ? Math.round(person.credit) : 'N/A'}\nNotes: ${person.extraNotes || 'None'}`, 'Person Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.chats.forEach((chat, index) => {
        const card = document.createElement('div');
        card.className = 'context-card chats';
        const participants = chat.participants.map(p => p.name).join(', ');
        const wordCount = chat.content.split(' ').length;
        card.innerHTML = `
                    <span class="card-icon"></span>
                    <span class="card-name" title="${chat.source.toUpperCase()} Chat - ${participants}">${chat.source.toUpperCase()} Chat (${wordCount} words)</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`${chat.source.toUpperCase()} Chat\nParticipants: ${participants}\nWords: ${wordCount}\nContext: ${chat.context || 'None'}`, 'Chat Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.fraudLogs.forEach(log => {
        const card = document.createElement('div');
        card.className = 'context-card fraud';
        card.innerHTML = `
                    <span class="card-icon"><i class="fas fa-exclamation-circle"></i></span>
                    <span class="card-name" title="${log.type} - ${log.person || 'Unknown'}">${log.type} (${log.person || 'Unknown'})</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`${log.type}\nPerson: ${log.person || 'Unknown'}\nSeverity: ${log.severity || 'Unknown'}\nEvidence: ${log.evidence || 'None'}`, 'Fraud Log Details', 'warning');
        });
        contextDisplay.appendChild(card);
    });

    if (hasContext) {
        const clearBtn = document.createElement('div');
        clearBtn.className = 'context-card';
        clearBtn.style.backgroundColor = 'rgba(200, 50, 50, 0.3)';
        clearBtn.style.borderColor = '#cc4444';
        clearBtn.innerHTML = `
                    <span class="card-icon"><i class="fas fa-trash-alt"></i></span>
                    <span class="card-name">Clear All Context</span>
                `;
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem('adminProvidedContext');
            updateContextDisplay({ people: [], chats: [], fraudLogs: [] });
        });
        contextDisplay.appendChild(clearBtn);
    }
}

function storeAIContext(context) {
    let contextSummary = 'Context provided by admin:\n\n';

    setTimeout(() => {
        localStorage.removeItem('adminProvidedContext');
    }, 300000);

    if (context.people.length > 0) {
        contextSummary += 'PEOPLE:\n';
        context.people.forEach(person => {
            contextSummary += `- ${person.name} (Credit: ${person.credit !== undefined ? Math.round(person.credit) : 'N/A'})\n`;
            if (person.extraNotes) {
                contextSummary += `  Notes: ${person.extraNotes}\n`;
            }
        });
        contextSummary += '\n';
    }

    if (context.chats.length > 0) {
        contextSummary += 'CHATS:\n';
        context.chats.forEach((chat, index) => {
            contextSummary += `${index + 1}. ${chat.source.toUpperCase()} chat with ${chat.participants.length} participants (${chat.content.split(' ').length} words)\n`;
        });
        contextSummary += '\n';
    }

    if (context.fraudLogs.length > 0) {
        contextSummary += 'FRAUD ALERTS:\n';
        context.fraudLogs.forEach(log => {
            contextSummary += `- ${log.type}\n`;
        });
        contextSummary += '\n';
    }

    if (context.notes) {
        contextSummary += `ADDITIONAL NOTES: ${context.notes}\n`;
    }

    localStorage.setItem('adminProvidedContext', JSON.stringify({
        summary: contextSummary,
        data: context,
        timestamp: context.timestamp
    }));
}

function getAdminContext() {
    const storedContext = localStorage.getItem('adminProvidedContext');
    if (storedContext) {
        try {
            const context = JSON.parse(storedContext);
            return context.summary || '';
        } catch (e) {
            console.error('Error parsing admin context:', e);
            return '';
        }
    }
    return '';
}

askAIBtn.addEventListener('click', () => {

    const allModals = [typeModal, humanModal, otherModal, detailViewModal, classifyModal, document.getElementById('hiddenConnectionsModal')];
    allModals.forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });

    aiChatModal.style.display = 'flex';
    aiChatModal.style.zIndex = '1001';

    aiChatModal.style.visibility = 'visible';
    aiChatModal.style.opacity = '1';
    aiChatModal.style.pointerEvents = 'auto';

    updateChatHistoryPanel();

    console.log('Modal display style:', aiChatModal.style.display);
    console.log('Modal z-index:', aiChatModal.style.zIndex);

    setTimeout(() => {
        if (aiInput) {
            aiInput.focus();
            console.log('Input focused');
        }
    }, 100);
});

document.getElementById('menuBtn')?.addEventListener('click', () => {
    const container = document.querySelector('.container');
    const threatsPanel = document.getElementById('threatsPanel');

    if (!threatsPanel) {
        console.warn('Threats panel not found');
        return;
    }

    if (threatsPanel.style.display === 'none' || threatsPanel.style.display === '') {
        threatsPanel.style.display = 'block';
        container?.classList.add('threats-split');

        loadPreviousFindings();
    } else {
        threatsPanel.style.display = 'none';
        container?.classList.remove('threats-split');
    }
});

document.getElementById('dashboardBtn').addEventListener('click', () => {
    switchTab('dashboard');
});

document.getElementById('analysisBtn').addEventListener('click', () => {
    switchTab('analysis');
});

document.getElementById('threatsBtn').addEventListener('click', () => {
    updateIntelligenceCenterStats();
    switchTab('threats');
});

document.querySelectorAll('.close').forEach(button => {
    button.addEventListener('click', (e) => {
        e.stopPropagation();

        const modal = button.closest('.modal') || button.closest('.detail-view') || button.closest('.ai-chat-modal');
        if (modal) {
            modal.classList.add('hiding');
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.zIndex = '-1';
                modal.classList.remove('hiding');
            }, 300);
        } else {

            [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
                if (modal && modal.style.display !== 'none') {
                    modal.classList.add('hiding');
                }
            });

            setTimeout(() => {
                typeModal.style.display = 'none';
                humanModal.style.display = 'none';
                otherModal.style.display = 'none';
                detailViewModal.style.display = 'none';
                classifyModal && (classifyModal.style.display = 'none');
                aiChatModal.style.display = 'none';
                document.getElementById('hiddenConnectionsModal').style.display = 'none';

                [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
                    modal.style.zIndex = '-1';
                    modal.classList.remove('hiding');
                });
            }, 300);
        }
    });
});

window.addEventListener('click', (event) => {
    const modals = [
        { element: typeModal, condition: event.target === typeModal },
        { element: humanModal, condition: event.target === humanModal },
        { element: otherModal, condition: event.target === otherModal },
        { element: detailViewModal, condition: event.target === detailViewModal },
        { element: classifyModal, condition: event.target === classifyModal },
        { element: aiChatModal, condition: event.target === aiChatModal },
        { element: chatUploadModal, condition: event.target === chatUploadModal },
        { element: dataUploadModal, condition: event.target === dataUploadModal },
        { element: aiImportModal, condition: event.target === aiImportModal },
        { element: document.getElementById('hiddenConnectionsModal'), condition: event.target === document.getElementById('hiddenConnectionsModal') }
    ];

    modals.forEach(({ element, condition }) => {
        if (element && condition && element.style.display === 'flex') {
            element.classList.add('hiding');
            setTimeout(() => {
                element.style.display = 'none';
                element.style.zIndex = '-1';
                element.classList.remove('hiding');
            }, 300);
        }
    });

    [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, chatUploadModal, dataUploadModal, aiImportModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
        if (modal && modal.style.display === 'none') {
            modal.style.zIndex = '-1';
        }
    });
});

window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);

    const errorMessage = event.error?.message || event.message || '';
    const isAIError = errorMessage.includes('AI') ||
        errorMessage.includes('puter.ai') ||
        errorMessage.includes('processAICommand') ||
        errorMessage.includes('handleAIAction') ||
        errorMessage.includes('extractJSONFromResponse');

    event.preventDefault();

    if (aiChatModal && aiChatModal.style.display === 'flex' && isAIError) {
        try {
            addMessageToAIChat("Sorry, I encountered an unexpected error. Please try rephrasing your request.", 'ai');
            if (aiSendBtn) {
                aiSendBtn.disabled = false;
            }
            if (aiInput) {
                aiInput.value = '';
            }
        } catch (e) {
            console.error('Error handling global error:', e);
        }
    }
});

document.getElementById('humanTypeBtn').addEventListener('click', () => {
    typeModal.style.display = 'none';
    populateSelectOptions();
    humanModal.style.display = 'flex';
    humanModal.style.zIndex = '1000';
});

document.getElementById('otherTypeBtn').addEventListener('click', () => {
    typeModal.style.display = 'none';
    otherModal.style.display = 'flex';
    otherModal.style.zIndex = '1000';
});

document.getElementById('cancelHumanBtn').addEventListener('click', () => {
    humanModal.style.display = 'none';
    humanModal.style.zIndex = '-1';
});

document.getElementById('cancelOtherBtn').addEventListener('click', () => {
    otherModal.style.display = 'none';
    otherModal.style.zIndex = '-1';
});

document.getElementById('closeDetail').addEventListener('click', () => {
    detailViewModal.classList.add('hiding');
    setTimeout(() => {
        detailViewModal.style.display = 'none';
        detailViewModal.style.zIndex = '-1';
        detailViewModal.classList.remove('hiding');
    }, 300);
});

document.getElementById('closeAIChat').addEventListener('click', () => {
    aiChatModal.classList.add('hiding');
    setTimeout(() => {
        aiChatModal.style.display = 'none';
        aiChatModal.style.zIndex = '-1';
        aiChatModal.classList.remove('hiding');
        aiChatModal.classList.remove('debug');
    }, 300);
});

document.getElementById('closeConnectionsModal').addEventListener('click', () => {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    hiddenConnectionsModal.style.display = 'none';
    hiddenConnectionsModal.style.zIndex = '-1';
});

aiChatModal.addEventListener('click', (event) => {
    if (event.target === aiChatModal) {
        aiChatModal.classList.add('hiding');
        setTimeout(() => {
            aiChatModal.style.display = 'none';
            aiChatModal.style.zIndex = '-1';
            aiChatModal.classList.remove('hiding');
            aiChatModal.classList.remove('debug');
        }, 300);
    }
});

document.getElementById('hiddenConnectionsModal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('hiddenConnectionsModal')) {
        const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
        hiddenConnectionsModal.classList.add('hiding');
        setTimeout(() => {
            hiddenConnectionsModal.style.display = 'none';
            hiddenConnectionsModal.style.zIndex = '-1';
            hiddenConnectionsModal.classList.remove('hiding');
        }, 300);
    }
});

document.getElementById('editEntryBtn').addEventListener('click', () => {
    const data = document.currentDetailData;
    if (!data) return;

    detailViewModal.style.display = 'none';
    detailViewModal.style.zIndex = '-1';

    if (data.type === 'human') {
        openHumanFormForEdit(data);
        humanModal.style.zIndex = '1000';
    } else {
        openOtherFormForEdit(data);
        otherModal.style.zIndex = '1000';
    }
});

document.getElementById('deleteEntryBtn').addEventListener('click', () => {
    deleteCurrentEntry();
});

document.getElementById('exportPdfBtn').addEventListener('click', async () => {
    console.log('Export PDF button clicked');
    const data = document.currentDetailData;
    console.log('Current detail data:', data);
    if (!data) {
        showAlert('No entry selected', 'Error', 'error');
        return;
    }
    
    if (data.type === 'human') {
        console.log('Calling exportHumanToPDF with id:', data.id);
        try {
            await exportHumanToPDF(data.id);
        } catch (err) {
            console.error('PDF export error:', err);
            showAlert('PDF export failed: ' + err.message, 'Error', 'error');
        }
    } else {
        showAlert('PDF export is only available for people entries', 'Notice', 'info');
    }
});

function updateSendButtonText(text) {
    const span = aiSendBtn.querySelector('.btn-icon-text');
    if (span) {
        span.textContent = text;
    } else {
        aiSendBtn.innerHTML = `<i class="fas fa-paper-plane"></i><span class="btn-icon-text">${text}</span>`;
    }
}

function updateImproveButtonText(text) {
    const span = aiImproveBtn.querySelector('.btn-icon-text');
    if (span) {
        span.textContent = text;
    } else {
        aiImproveBtn.innerHTML = `<i class="fas fa-wand"></i><span class="btn-icon-text">${text}</span>`;
    }
}

function displayAIChatNotification(message) {
    const notification = document.getElementById('aiNotification');
    const notificationText = document.getElementById('notificationText');

    if (notification && notificationText) {
        notificationText.textContent = message;
        notification.style.display = 'block';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

function clearNotifications() {
    const notification = document.getElementById('aiNotification');
    if (notification) {
        notification.style.display = 'none';
    }
}

async function improvePrompt() {
    const originalPrompt = aiInput.value.trim();
    if (!originalPrompt) {
        addMessageToAIChat("Please enter a prompt to improve.", 'ai');
        return;
    }

    try {
        aiImproveBtn.disabled = true;
        aiSendBtn.disabled = true;

        displayAIChatNotification('Improving prompt...');

        const context = `
                    You are an expert prompt engineer. Your job is to improve prompts that will be used with another AI system.
                    You are NOT the AI that will fulfill the request - you are only improving the prompt for another AI to process.
                    
                    The prompt is for a data management application called Pazator where users manage human and other entries.
                    
                    Original prompt: ${originalPrompt}
                    
                    Your task is to enhance this prompt to make it more specific, detailed, and likely to produce better results.
                    Consider:
                    - Adding more context or specificity
                    - Clarifying ambiguous terms
                    - Making the request more structured
                    - Adding relevant details that might help achieve better results
                    - Ensuring the prompt is clear and actionable
                    
                    Return only the improved prompt, nothing else.
                `;

        const aiResponse = await puter.ai.chat([
            { role: "system", content: context },
            { role: "user", content: `Please improve this prompt: ${originalPrompt}` }
        ]);

        const improvedPrompt = aiResponse.content ? aiResponse.content : aiResponse;

        aiInput.value = improvedPrompt;

        addMessageToAIChat("Prompt improved! You can now send the improved version or improve it again.", 'ai');
    } catch (error) {
        console.error('Error improving prompt:', error);
        addMessageToAIChat("Sorry, I encountered an error improving your prompt. Please try again.", 'ai');
    } finally {
        aiImproveBtn.disabled = false;
        updateImproveButtonText('');

        if (!aiSendBtn.disabled) {
            aiSendBtn.disabled = false;
        }

        aiInput.focus();
    }
}

document.getElementById('aiImproveBtn').addEventListener('click', () => {
    improvePrompt();
});

aiSendBtn.addEventListener('click', () => {
    const command = aiInput.value.trim();
    if (command) {
        aiSendBtn.disabled = true;
        setAiSendLoading(true);

        requestAnimationFrame(() => {
            processAICommand(command);
        });
    }
});

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
    if (e.key === 'Enter' && !aiSendBtn.disabled) {
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
    showAlert('Chat history feature would open here. This is a placeholder for future implementation.', 'Coming Soon', 'info');
});

document.getElementById('favoritesBtn')?.addEventListener('click', () => {
    showAlert('Favorite commands would appear here. This is a placeholder for future implementation.', 'Coming Soon', 'info');
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

document.getElementById('clearChatOption')?.addEventListener('click', () => {
    showAlert('Clear chat functionality would go here. This is a placeholder for future implementation.', 'Coming Soon', 'info');
    chatOptionsMenu.classList.remove('active');
});


document.getElementById('humanForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('humanId').value;
    const name = document.getElementById('humanName').value;
    const gender = document.getElementById('humanGender').value;
    const birthDate = document.getElementById('birthDate').value;
    const workplace = document.getElementById('workplace').value;
    const credit = document.getElementById('credit').value;
    const socialClass = document.getElementById('socialClass').value;
    const extraNotes = document.getElementById('humanExtraNotes').value;
    const maritalStatus = document.getElementById('maritalStatus').value;
    const nationality = document.getElementById('nationality').value;
    const countryOfOrigin = document.getElementById('countryOfOrigin').value;
    const immigrationStatus = document.getElementById('immigrationStatus').value;
    const languages = document.getElementById('languages').value;
    const ethnicity = document.getElementById('ethnicity').value;
    const religion = document.getElementById('religion').value;
    const politicalViews = document.getElementById('politicalViews').value;
    const threatLevel = document.getElementById('threatLevel').value;
    const incomeLevel = document.getElementById('incomeLevel').value;
    const educationLevel = document.getElementById('educationLevel').value;

    const friendsSelect = document.getElementById('friends');
    const familySelect = document.getElementById('family');

    const selectedFriends = Array.from(friendsSelect.selectedOptions).map(option => option.value);
    const selectedFamily = Array.from(familySelect.selectedOptions).map(option => option.value);

    const tagsSelect = document.getElementById('humanTags');
    const selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);
    const trackerAliasValue = humanTrackerAliasInput?.value?.trim();

    if (id) {

        const humanIndex = pazatorData.humans.findIndex(h => h.id === id);
        if (humanIndex !== -1) {
            const existingImage = pazatorData.humans[humanIndex].imagePreview;
            const existingHuman = pazatorData.humans[humanIndex];

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
            applyTrackerAliasToHuman(pazatorData.humans[humanIndex], trackerAliasValue, existingHuman);
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

        applyTrackerAliasToHuman(newHuman, trackerAliasValue);
        pazatorData.humans.push(newHuman);
    }

    const imageFile = document.getElementById('humanImage').files[0];
    if (imageFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (id) {
                const humanIndex = pazatorData.humans.findIndex(h => h.id === id);
                if (humanIndex !== -1) {
                    pazatorData.humans[humanIndex].imagePreview = e.target.result;
                }
            } else {
                const lastIndex = pazatorData.humans.length - 1;
                pazatorData.humans[lastIndex].imagePreview = e.target.result;
            }

            markDataChanged();
            renderWebNodes();
            humanModal.style.display = 'none';
            humanModal.style.zIndex = '-1';
            document.getElementById('humanForm').reset();
        };
        reader.readAsDataURL(imageFile);
    } else {
        markDataChanged();
        renderWebNodes();
        humanModal.style.display = 'none';
        humanModal.style.zIndex = '-1';
        document.getElementById('humanForm').reset();
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
            renderWebNodes();
            otherModal.style.display = 'none';
            otherModal.style.zIndex = '-1';
            document.getElementById('otherForm').reset();
        };
        reader.readAsDataURL(imageFile);
    } else {
        markDataChanged();
        renderWebNodes();
        otherModal.style.display = 'none';
        otherModal.style.zIndex = '-1';
        document.getElementById('otherForm').reset();
    }
});

window.addEventListener('resize', () => {
    renderWebNodes();
});

let zoomTicking = false;

function updateZoomTransform() {
    webContent.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
    zoomTicking = false;
    if (connectionsSvg) {
        connectionsSvg.style.transform = `scale(${1/currentScale})`;
        connectionsSvg.style.transformOrigin = '0 0';
    }
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
    if (connectionsSvg) {
        const tx = -currentTranslateX / currentScale;
        const ty = -currentTranslateY / currentScale;
        connectionsSvg.style.transform = `translate(${tx}px, ${ty}px)`;
    }
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
            '.data-node, .node-label, .graph-node, .connection-node, button, a, input, textarea, select, label, .modal, .clean-modal'
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

applyFilterBtn.addEventListener('click', () => {
    renderWebNodes();
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        renderWebNodes();
    }
});

addTagBtn.addEventListener('click', () => {
    const tagText = tagInput.value.trim();
    if (tagText && !tags.includes(tagText)) {
        tags.push(tagText);
        renderTags();
        tagInput.value = '';
    }
});

const aiSuggestTagsBtn = document.getElementById('aiSuggestTagsBtn');

aiSuggestTagsBtn?.addEventListener('click', async () => {
    if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
        showAlert('No data to analyze. Add some people or entities first.', 'Notice', 'info');
        return;
    }

    aiSuggestTagsBtn.disabled = true;
    aiSuggestTagsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    try {
        const humansData = pazatorData.humans.map(h => ({
            name: h.name,
            workplace: h.workplace || '',
            tags: h.tags || [],
            notes: h.extraNotes || ''
        }));

        const othersData = pazatorData.others.map(o => ({
            name: o.name,
            tags: o.tags || [],
            notes: (o.note || o.extraNotes || '')
        }));

        const existingTags = tags.slice();

        const prompt = `Analyze this intelligence data and suggest relevant tags. Return a JSON array of suggested tags with reasoning.

Existing tags (don't duplicate): ${existingTags.join(', ') || 'none'}

Humans/People:
${JSON.stringify(humansData, null, 2)}

Companies/Entities:
${JSON.stringify(othersData, null, 2)}

Return JSON in this format:
{
  "suggestedTags": [
    {"tag": "tag-name", "reason": "why this tag is useful", "appliesTo": ["person1", "person2"]}
  ]
}

Make tags:
- Lowercase with hyphens (e.g., "tech-company", "former-military")
- Specific and meaningful
- Based on workplace, name patterns, or notes
- Max 20 suggestions, focus on most useful tags`;

        const response = await Promise.race([
            puter.ai.chat([
                { role: "system", content: "You are an intelligence analyst. Return ONLY valid JSON." },
                { role: "user", content: prompt }
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 30000))
        ]);

        const responseText = response.content ? response.content : response;
        const result = extractJSONFromResponse(responseText);

        if (result && result.suggestedTags && Array.isArray(result.suggestedTags)) {
            showAISuggestTagsModal(result.suggestedTags);
        } else {
            showAlert('Could not parse AI response. Try again.', 'Error', 'error');
        }
    } catch (error) {
        console.error('AI tag suggestion error:', error);
        showAlert('Failed to get AI suggestions. Please try again.', 'Error', 'error');
    } finally {
        aiSuggestTagsBtn.disabled = false;
        aiSuggestTagsBtn.innerHTML = '<i class="fas fa-robot"></i> AI Suggest Tags';
    }
});

function showAISuggestTagsModal(suggestions) {
    let modal = document.getElementById('aiTagSuggestModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'aiTagSuggestModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>AI Suggested Tags</h2>
                    <button id="aiTagModalClose" class="close-modal-btn" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body" id="aiTagModalBody"></div>
                <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end; padding: 16px; border-top: 1px solid #333;">
                    <button id="aiTagCancel" class="btn btn-secondary">Cancel</button>
                    <button id="aiTagAddAll" class="btn btn-primary">Add All Tags</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#aiTagModalClose').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.querySelector('#aiTagCancel').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    let selectedTags = new Set();

    const renderSuggestions = () => {
        const body = modal.querySelector('#aiTagModalBody');
        body.innerHTML = suggestions.map((s, i) => `
            <div class="ai-tag-suggestion" data-index="${i}" style="padding: 12px; margin-bottom: 10px; background: rgba(30,30,30,0.8); border-radius: 8px; border: 1px solid #333; cursor: pointer; ${selectedTags.has(s.tag) ? 'border-color: #4ade80;' : ''}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="ai-tag-checkbox" data-tag="${s.tag}" ${selectedTags.has(s.tag) ? 'checked' : ''}>
                    <span style="font-weight: 600; color: #fff;">${s.tag}</span>
                    ${tags.includes(s.tag) ? '<span style="font-size: 0.7rem; background: #666; padding: 2px 6px; border-radius: 4px; color: #ccc;">exists</span>' : ''}
                </div>
                <div style="font-size: 0.85rem; color: #888; margin-top: 6px; margin-left: 26px;">${s.reason}</div>
                ${s.appliesTo?.length ? `<div style="font-size: 0.75rem; color: #666; margin-top: 4px; margin-left: 26px;">Applies to: ${s.appliesTo.slice(0, 5).join(', ')}${s.appliesTo.length > 5 ? '...' : ''}</div>` : ''}
            </div>
        `).join('');

        body.querySelectorAll('.ai-tag-suggestion').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const checkbox = el.querySelector('.ai-tag-checkbox');
                checkbox.checked = !checkbox.checked;
                const tag = checkbox.dataset.tag;
                if (checkbox.checked) {
                    selectedTags.add(tag);
                } else {
                    selectedTags.delete(tag);
                }
                renderSuggestions();
            });
        });

        body.querySelectorAll('.ai-tag-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const tag = e.target.dataset.tag;
                if (e.target.checked) {
                    selectedTags.add(tag);
                } else {
                    selectedTags.delete(tag);
                }
                renderSuggestions();
            });
        });
    };

    renderSuggestions();

    modal.querySelector('#aiTagAddAll').onclick = () => {
        let added = 0;
        selectedTags.forEach(tag => {
            if (!tags.includes(tag)) {
                tags.push(tag);
                added++;
            }
        });
        if (added > 0) {
            renderTags();
        }
        modal.style.display = 'none';
        showAlert(`Added ${added} new tag(s)`, 'Tags Updated', 'success');
    };

    modal.style.display = 'flex';
}

refreshViewBtn.addEventListener('click', () => {
    currentScale = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;
    webContent.style.transform = `translate(0px, 0px) scale(1)`;

    setTimeout(() => {
        fitAllNodesInView();
    }, 50);
});

toggleConnectionsBtn.addEventListener('click', () => {
    const svg = document.getElementById('connections-svg');
    if (svg) {
        svg.style.display = svg.style.display === 'none' ? 'block' : 'none';
    }
});

showStatisticsBtn.addEventListener('click', () => {
    const humanCount = pazatorData.humans.length;
    const otherCount = pazatorData.others.length;
    const totalConnections = pazatorData.humans.reduce((total, human) => {
        return total + (human.family ? human.family.length : 0) + (human.friends ? human.friends.length : 0);
    }, 0);

    showAlert(`Statistics:
- Humans: ${humanCount}
- Others: ${otherCount}
- Total Entries: ${humanCount + otherCount}
- Connections: ${totalConnections}`, 'Statistics', 'info');
});

findConnectionsBtn.addEventListener('click', async () => {
    await findHiddenConnections();
});

refreshCreditsBtn.addEventListener('click', () => {
    refreshPersonCredits();
});
sortByCreditBtn.addEventListener('click', () => {
    sortByCredit();
});

intelAnalyzeBtn?.addEventListener('click', async () => {
    await runIntelligenceAnalysis();
});

intelConnectionsBtn?.addEventListener('click', async () => {
    await findHiddenConnections();
});

intelRefreshRiskBtn?.addEventListener('click', () => {
    refreshPersonCredits();
    updateCreditStats();
});

intelHojumBtn?.addEventListener('click', async () => {
    try {
        const hojum = window.pazator_context?.hojum;
        if (hojum && typeof hojum.proposeManual === 'function') {
            intelHojumBtn.disabled = true;
            intelHojumBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Running...';
            
            await hojum.proposeManual('Threat analysis request from Intelligence Center');
            
            const status = document.getElementById('intelHojumStatus');
            if (status) {
                status.innerHTML = '<i class="fas fa-check-circle"></i><span>HOJUM: proposal generated.</span>';
            }
        } else {
            showAlert('HOJUM is not available. Make sure the context is properly initialized.', 'HOJUM Error', 'warning');
        }
    } catch (e) {
        console.error('HOJUM trigger failed:', e);
        showAlert('Failed to trigger HOJUM: ' + e.message, 'Error', 'error');
    } finally {
        if (intelHojumBtn) {
            intelHojumBtn.disabled = false;
            intelHojumBtn.innerHTML = '<i class="fas fa-bolt"></i> Trigger HOJUM';
        }
    }
});

intelClearResults?.addEventListener('click', () => {
    const resultsEl = document.getElementById('intelResults');
    const contentEl = document.getElementById('intelResultsContent');
    const countBadge = document.getElementById('intelResultsCount');
    const findingsCountEl = document.getElementById('intelFindingsCount');
    if (resultsEl) resultsEl.style.display = 'none';
    if (contentEl) contentEl.innerHTML = '';
    if (countBadge) countBadge.textContent = '0 findings';
    if (findingsCountEl) findingsCountEl.textContent = '0';
});

function renderFindingsToCards(findings) {
    const container = document.getElementById('intelResultsContent');
    const countBadge = document.getElementById('intelResultsCount');
    const resultsEl = document.getElementById('intelResults');
    
    if (!container) return;
    
    container.innerHTML = '';
    resultsEl.style.display = 'block';
    countBadge.textContent = `${findings.length} finding${findings.length !== 1 ? 's' : ''}`;
    
    findings.forEach((finding, index) => {
        const card = document.createElement('div');
        card.className = `intel-finding intel-finding-${finding.type || 'info'}`;
        
        const typeIcon = {
            threat: 'fa-exclamation-triangle',
            risk: 'fa-shield-alt',
            connection: 'fa-link',
            positive: 'fa-check-circle',
            info: 'fa-info-circle'
        }[finding.type] || 'fa-info-circle';
        
        const typeLabel = {
            threat: 'Threat',
            risk: 'Risk',
            connection: 'Connection',
            positive: 'Positive',
            info: 'Info'
        }[finding.type] || 'Info';
        
        card.innerHTML = `
            <div class="intel-finding-header">
                <div class="intel-finding-type">
                    <i class="fas ${typeIcon}"></i>
                    <span>${typeLabel}</span>
                </div>
                <div class="intel-finding-subject">${finding.subject || 'Unknown'}</div>
            </div>
            <div class="intel-finding-content">${finding.content || finding.description || ''}</div>
            ${finding.evidence ? `<div class="intel-finding-evidence"><i class="fas fa-fingerprint"></i> ${finding.evidence}</div>` : ''}
            <div class="intel-finding-footer">
                ${(finding.tags || []).map(tag => `<span class="intel-finding-tag">${tag}</span>`).join('')}
            </div>
        `;
        
        container.appendChild(card);
    });
    
    if (findings.length === 0) {
        container.innerHTML = `
            <div class="intel-empty-state">
                <i class="fas fa-search"></i>
                <p>No findings detected</p>
                <small>The analysis completed but no significant patterns were found</small>
            </div>
        `;
    }
}

async function runIntelligenceAnalysis() {
    const btn = document.getElementById('intelAnalyzeBtn');
    const findingsCountEl = document.getElementById('intelFindingsCount');
    const lastAnalysisEl = document.getElementById('intelLastAnalysis');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';
    }
    
    try {
        const humansData = pazatorData.humans.map(h => ({
            id: h.id,
            name: h.name,
            gender: h.gender,
            birthDate: h.birthDate,
            workplace: h.workplace,
            tags: h.tags || [],
            extraNotes: h.extraNotes || '',
            friends: (h.friends || []).map(fId => pazatorData.humans.find(h => h.id === fId)?.name || fId),
            family: (h.family || []).map(fId => pazatorData.humans.find(h => h.id === fId)?.name || fId)
        }));
        
        const othersData = pazatorData.others.map(o => ({
            id: o.id,
            name: o.name,
            note: o.note || ''
        }));
        
        const aiPrompt = `You are analyzing data for an Intelligence Center. Your task is to identify potential threats, risks, suspicious patterns, and hidden connections.

DATA:
Humans: ${JSON.stringify(humansData, null, 2)}
Entities: ${JSON.stringify(othersData, null, 2)}

Analyze this data and return a JSON array of findings in this EXACT format:
[
    {
        "type": "threat|risk|connection|positive|info",
        "subject": "Person or entity name",
        "content": "Brief description of the finding",
        "evidence": "Specific data point supporting this finding",
        "tags": ["tag1", "tag2"]
    }
]

Types:
- threat: Direct danger or serious concern
- risk: Potential vulnerability or concern
- connection: Hidden relationship between people
- positive: Good indicator or strength
- info: Neutral observation

Be selective - only report significant findings. Maximum 10 findings. Return ONLY the JSON array, no other text.`;

        const aiResponse = await puter.ai.chat([
            { role: "system", content: "You are Zor, an intelligence analysis AI. Output ONLY valid JSON." },
            { role: "user", content: aiPrompt }
        ]);
        
        const responseText = aiResponse.content || aiResponse;
        const findings = extractJSONFromResponse(responseText);
        
        if (Array.isArray(findings)) {
            renderFindingsToCards(findings);
            if (findingsCountEl) findingsCountEl.textContent = findings.length;
            if (lastAnalysisEl) lastAnalysisEl.textContent = new Date().toLocaleTimeString();
        } else {
            showAlert('Analysis returned unexpected format. Check chat for details.', 'Analysis Issue', 'warning');
        }
        
    } catch (e) {
        console.error('Intelligence analysis failed:', e);
        showAlert('Analysis failed: ' + e.message, 'Error', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-brain"></i> Run AI Analysis';
        }
    }
}

chatControlBtn?.addEventListener('click', () => {
    switchTab('chat-control');
});

document.getElementById('searchBtn')?.addEventListener('click', () => {
    switchTab('search');
});

document.getElementById('agentsBtn')?.addEventListener('click', () => {
    switchTab('agents');
});

document.getElementById('articlesBtn')?.addEventListener('click', () => {
    switchTab('articles');
});

document.getElementById('trackerBtn')?.addEventListener('click', () => {
    switchTab('tracker');
});

document.getElementById('tadbirBtn')?.addEventListener('click', () => {
    switchTab('tadbir');
});

document.getElementById('casesBtn')?.addEventListener('click', () => {
    switchTab('cases');
});

trackerConnectBtn?.addEventListener('click', connectTrackerSelection);
trackerRefreshBtn?.addEventListener('click', () => {
    if (trackerDebug) trackerDebug.innerText = 'Refreshing tracker data...';
    fetchTrackerPeople();
});
trackerPurgeBtn?.addEventListener('click', () => {
    purgeTrackerData();
});
trackerConfigureBtn?.addEventListener('click', () => {
    promptForTrackerConfig();
});
trackerToggleSidebarBtn?.addEventListener('click', () => {
    if (!trackerSidebar) return;
    trackerSidebar.classList.toggle('collapsed');
    trackerToggleSidebarBtn.innerText = trackerSidebar.classList.contains('collapsed') ? 'show sidebar' : 'hide sidebar';
});
trackerSpinToggleBtn?.addEventListener('click', () => {
    if (trackerSpinning) {
        stopTrackerSpin();
    } else {
        startTrackerSpin();
    }
});
trackerStreetLabelBtn?.addEventListener('click', () => toggleLabelLayer('street'));
trackerFilterToggleBtn?.addEventListener('click', toggleTrackerMapFilter);
trackerSettingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = trackerSettingsMenu?.classList.contains('open');
    setTrackerSettingsMenuOpen(!isOpen);
});
trackerSettingsMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
});
trackerSpinSpeedInput?.addEventListener('input', () => {
    setTrackerSpinSpeed(trackerSpinSpeedInput.value);
});

document.addEventListener('click', (event) => {
    if (!trackerSettingsMenu || !trackerSettingsBtn) return;
    if (!trackerSettingsMenu.classList.contains('open')) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (trackerSettingsMenu.contains(target)) return;
    if (trackerSettingsBtn.contains(target)) return;
    setTrackerSettingsMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!trackerSettingsMenu?.classList.contains('open')) return;
    setTrackerSettingsMenuOpen(false);
});
humanTrackerSelect?.addEventListener('change', () => {
    if (!humanTrackerAliasInput) return;
    if (!humanTrackerAliasInput.value) {
        humanTrackerAliasInput.value = humanTrackerSelect.value;
    }
});

detailTrackerSaveAliasBtn?.addEventListener('click', () => {
    const current = document.currentDetailData;
    if (!current || current.type !== 'human') return;

    const alias = detailTrackerAliasInput?.value?.trim();
    const human = pazatorData.humans.find(h => String(h.id) === String(current.id));
    if (!human) return;

    if (!alias) {
        delete human.trackerAlias;
        delete human.trackerLinkedAt;
    } else {
        human.trackerAlias = alias;
        human.trackerLinkedAt = new Date().toISOString();
    }

    saveData();
    refreshTrackerHumanOptions();
    document.currentDetailData = { ...human, type: 'human' };
    updateDetailTrackerInfo(document.currentDetailData);
    trackerDebug && (trackerDebug.innerText = alias
        ? `Tracker alias saved for ${human.name}.`
        : `Tracker link removed for ${human.name}.`);
});

detailTrackerShowBtn?.addEventListener('click', () => {
    const alias = detailTrackerAliasInput?.value?.trim();
    if (!alias) return;
    openOrCreateTab('tracker');
    requestTrackerShow(alias);
});

analyzeAllChatsBtn?.addEventListener('click', async () => {
    await analyzeAllChats();
});

refreshChatListBtn?.addEventListener('click', () => {
    loadSavedChats();
});

exportChatReportBtn?.addEventListener('click', () => {
    exportChatReport();
});

clearChatHistoryBtn?.addEventListener('click', () => {
    clearChatHistory();
});

chatSearchInput?.addEventListener('input', (e) => {
    chatSearchFilter = e.target.value.toLowerCase();
    loadSavedChats();
});

chatFilterSource?.addEventListener('change', (e) => {
    chatSourceFilter = e.target.value;
    loadSavedChats();
});

selectAllChatsBtn?.addEventListener('click', () => {
    const history = ChatStorageManager.getChatHistory();
    const visibleIndices = getVisibleChatIndices();
    
    if (selectedChatIndices.size === visibleIndices.size) {
        selectedChatIndices.clear();
        selectAllChatsBtn.innerHTML = '<i class="fas fa-check-square"></i> Select';
        bulkDeleteChatsBtn.style.display = 'none';
    } else {
        visibleIndices.forEach(i => selectedChatIndices.add(i));
        selectAllChatsBtn.innerHTML = '<i class="fas fa-square"></i> Deselect';
        bulkDeleteChatsBtn.style.display = 'inline-block';
    }
    loadSavedChats();
});

bulkDeleteChatsBtn?.addEventListener('click', async () => {
    if (selectedChatIndices.size === 0) return;
    
    const confirmed = await showConfirm(
        `Delete ${selectedChatIndices.size} selected chats? This cannot be undone.`,
        'Confirm Bulk Delete',
        'warning'
    );
    
    if (confirmed) {
        const history = ChatStorageManager.getChatHistory();
        const sortedIndices = [...selectedChatIndices].sort((a, b) => b - a);
        
        sortedIndices.forEach(index => {
            ChatStorageManager.deleteChat(index);
        });
        
        selectedChatIndices.clear();
        selectAllChatsBtn.innerHTML = '<i class="fas fa-check-square"></i> Select';
        bulkDeleteChatsBtn.style.display = 'none';
        loadSavedChats();
        showAlert(`Deleted ${sortedIndices.length} chats`, 'Success', 'success');
    }
});

function getVisibleChatIndices() {
    const history = ChatStorageManager.getChatHistory();
    return history.map((chat, i) => i).filter(i => {
        if (chatSourceFilter && chat.source !== chatSourceFilter) return false;
        if (chatSearchFilter) {
            const searchable = [
                chat.source,
                chat.content,
                chat.context,
                ...chat.participants.map(p => p.name)
            ].join(' ').toLowerCase();
            if (!searchable.includes(chatSearchFilter)) return false;
        }
        return true;
    });
}

function updateStorageMetrics() {
    const stats = ChatStorageManager.getStorageStats();
    if (storageUsedMetric) {
        storageUsedMetric.textContent = stats.totalSizeMB + 'MB';
    }
    
    const history = ChatStorageManager.getChatHistory();
    const sourceCounts = { whatsapp: 0, telegram: 0, discord: 0, signal: 0, manual: 0 };
    history.forEach(chat => {
        const source = chat.source?.toLowerCase() || 'manual';
        if (sourceCounts.hasOwnProperty(source)) {
            sourceCounts[source]++;
        } else {
            sourceCounts.manual++;
        }
    });
    
    const el = {
        whatsapp: document.getElementById('whatsappCount'),
        telegram: document.getElementById('telegramCount'),
        discord: document.getElementById('discordCount'),
        signal: document.getElementById('signalCount'),
        manual: document.getElementById('manualCount')
    };
    
    Object.entries(sourceCounts).forEach(([source, count]) => {
        if (el[source]) el[source].textContent = count;
    });
    
    const totalChatsEl = document.getElementById('totalChatsCount');
    if (totalChatsEl) totalChatsEl.textContent = stats.totalChats;
}

function triggerImportChats() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            let chatsToImport = [];
            if (Array.isArray(data)) {
                chatsToImport = data;
            } else if (data.chats && Array.isArray(data.chats)) {
                chatsToImport = data.chats;
            } else {
                showAlert('Invalid chat file format', 'Error', 'error');
                return;
            }
            
            let imported = 0;
            const existingHistory = ChatStorageManager.getChatHistory();
            const existingContent = new Set(existingHistory.map(c => c.content.substring(0, 100)));
            
            for (const chat of chatsToImport) {
                if (!existingContent.has(chat.content?.substring(0, 100))) {
                    ChatStorageManager.saveChat(chat);
                    imported++;
                }
            }
            
            loadSavedChats();
            showAlert(`Imported ${imported} new chats (${chatsToImport.length - imported} duplicates skipped)`, 'Import Complete', 'success');
        } catch (err) {
            console.error('Import error:', err);
            showAlert('Failed to import chats: ' + err.message, 'Error', 'error');
        }
    };
    input.click();
}

function triggerExportChatsJson() {
    exportChatReport('json');
}

function triggerViewChatStats() {
    const stats = ChatStorageManager.getStorageStats();
    const history = ChatStorageManager.getChatHistory();
    
    const sourceStats = {};
    history.forEach(chat => {
        sourceStats[chat.source] = (sourceStats[chat.source] || 0) + 1;
    });
    
    const avgMessages = history.length > 0 
        ? Math.round(history.reduce((sum, c) => sum + (c.parsed?.messageCount || c.content.split(' ').length), 0) / history.length)
        : 0;
    
    const dateRange = history.length > 0
        ? {
            oldest: new Date(Math.min(...history.map(c => new Date(c.timestamp).getTime()))).toLocaleDateString(),
            newest: new Date(Math.max(...history.map(c => new Date(c.timestamp).getTime()))).toLocaleDateString()
        }
        : null;
    
    let report = `=== Chat Storage Statistics ===\n\n`;
    report += `Total Chats: ${stats.totalChats}\n`;
    report += `Total Size: ${stats.totalSizeMB}MB\n`;
    report += `Average Messages per Chat: ${avgMessages}\n\n`;
    
    report += `=== By Source ===\n`;
    Object.entries(sourceStats).forEach(([source, count]) => {
        report += `${source.toUpperCase()}: ${count} chats\n`;
    });
    
    if (dateRange) {
        report += `\n=== Date Range ===\n`;
        report += `Oldest: ${dateRange.oldest}\n`;
        report += `Newest: ${dateRange.newest}\n`;
    }
    
    showAlert(report, 'Chat Statistics', 'info');
}

function triggerFindDuplicates() {
    const history = ChatStorageManager.getChatHistory();
    
    const hashMap = new Map();
    const duplicates = [];
    
    history.forEach((chat, index) => {
        const hash = chat.content.substring(0, 500);
        if (hashMap.has(hash)) {
            duplicates.push({
                original: hashMap.get(hash),
                duplicate: index
            });
        } else {
            hashMap.set(hash, index);
        }
    });
    
    if (duplicates.length === 0) {
        showAlert('No duplicate chats found!', 'Duplicates Check', 'success');
    } else {
        let report = `Found ${duplicates.length} potential duplicate(s):\n\n`;
        duplicates.forEach((dup, i) => {
            const origChat = history[dup.original];
            const dupChat = history[dup.duplicate];
            report += `${i + 1}. Original: [${origChat.source.toUpperCase()}] ${origChat.participants.map(p => p.name).join(', ')} (${new Date(origChat.timestamp).toLocaleDateString()})\n`;
            report += `   Duplicate: [${dupChat.source.toUpperCase()}] ${dupChat.participants.map(p => p.name).join(', ')} (${new Date(dupChat.timestamp).toLocaleDateString()})\n\n`;
        });
        showAlert(report, 'Duplicate Chats Found', 'warning');
    }
}

function triggerExportChatReport() {
    exportChatReport('txt');
}

function triggerRefreshChatList() {
    loadSavedChats();
    updateStorageMetrics();
    showAlert('Chat list refreshed', 'Refresh', 'success');
}

function updateLastScanTime() {
    if (lastScanTime && lastAnalysisTimestamp) {
        lastScanTime.textContent = new Date(lastAnalysisTimestamp).toLocaleTimeString();
    }
}

document.getElementById('generateThreatReportBtn')?.addEventListener('click', () => {
    generateThreatReport();
});

document.getElementById('reviewArchiveBtn')?.addEventListener('click', () => {
    reviewHistoricalPatterns();
});

function sortByCredit() {
    pazatorData.humans.sort((a, b) => {
        const creditA = a.credit !== undefined ? a.credit : -1;
        const creditB = b.credit !== undefined ? b.credit : -1;
        return creditB - creditA;
    });

    saveData();
    renderWebNodes();
    updateCreditStats();

    showAlert(`Sorted ${pazatorData.humans.length} people by credit score!`, 'Sorted', 'success');
}

function updateCreditStats() {
    const creditStats = document.getElementById('creditStats');
    if (!creditStats || pazatorData.humans.length === 0) return;
    
    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;
    
    const total = pazatorData.humans.length;
    const highPct = Math.round((highRisk / total) * 100);
    const mediumPct = Math.round((mediumRisk / total) * 100);
    const lowPct = Math.round((lowRisk / total) * 100);
    
    creditStats.innerHTML = `
        <div class="stat-row"><span>High Risk (0-124):</span><span class="stat-red">${highPct}%</span></div>
        <div class="stat-row"><span>Medium (125-249):</span><span class="stat-yellow">${mediumPct}%</span></div>
        <div class="stat-row"><span>Low Risk (250-370):</span><span class="stat-green">${lowPct}%</span></div>
    `;
    
    updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct);
    
    const riskSummary = document.getElementById('intelRiskSummary');
    if (riskSummary) riskSummary.textContent = `${highPct}% high, ${mediumPct}% med, ${lowPct}% low`;
}

function updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct) {
    const highBar = document.getElementById('intelHighRiskBar');
    const mediumBar = document.getElementById('intelMediumRiskBar');
    const lowBar = document.getElementById('intelLowRiskBar');
    const highVal = document.getElementById('intelHighRisk');
    const mediumVal = document.getElementById('intelMediumRisk');
    const lowVal = document.getElementById('intelLowRisk');
    
    if (highBar) highBar.style.width = highPct + '%';
    if (mediumBar) mediumBar.style.width = mediumPct + '%';
    if (lowBar) lowBar.style.width = lowPct + '%';
    if (highVal) highVal.textContent = highPct + '%';
    if (mediumVal) mediumVal.textContent = mediumPct + '%';
    if (lowVal) lowVal.textContent = lowPct + '%';
}

function updateIntelligenceCenterStats() {
    const humanCountEl = document.getElementById('intelHumanCount');
    const otherCountEl = document.getElementById('intelOtherCount');
    
    if (humanCountEl) humanCountEl.textContent = pazatorData.humans.length;
    if (otherCountEl) otherCountEl.textContent = pazatorData.others.length;
    
    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;
    const total = pazatorData.humans.length || 1;
    
    const highPct = Math.round((highRisk / total) * 100);
    const mediumPct = Math.round((mediumRisk / total) * 100);
    const lowPct = Math.round((lowRisk / total) * 100);
    
    updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct);
    
    const riskSummary = document.getElementById('intelRiskSummary');
    if (riskSummary) riskSummary.textContent = `${highPct}% high, ${mediumPct}% med, ${lowPct}% low`;
}

function updateAnalysisHubStats() {
    const humanCountEl = document.getElementById('analysisHumanCount');
    const creditAvgEl = document.getElementById('analysisCreditAvg');
    const metricHumans = document.getElementById('metricHumans');
    const metricEntities = document.getElementById('metricEntities');
    const metricTags = document.getElementById('metricTags');
    const metricHighRisk = document.getElementById('metricHighRisk');
    const riskSummary = document.getElementById('analysisRiskSummary');
    
    if (humanCountEl) humanCountEl.textContent = pazatorData.humans.length;
    if (metricHumans) metricHumans.textContent = pazatorData.humans.length;
    if (metricEntities) metricEntities.textContent = pazatorData.others.length;
    if (metricTags) metricTags.textContent = tags.length;
    
    const totalCredit = pazatorData.humans.reduce((sum, h) => sum + (h.credit || 185), 0);
    const avgCredit = pazatorData.humans.length ? Math.round(totalCredit / pazatorData.humans.length) : 0;
    if (creditAvgEl) creditAvgEl.textContent = avgCredit;
    
    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;
    
    if (metricHighRisk) metricHighRisk.textContent = highRisk;
    if (riskSummary) riskSummary.textContent = `${highRisk} high, ${mediumRisk} med, ${lowRisk} low`;
}

function updateHeaderStats() {
    const humansEl = document.getElementById('headerHumansCount');
    const othersEl = document.getElementById('headerOthersCount');
    const totalEl = document.getElementById('headerTotalCount');
    
    if (humansEl) humansEl.textContent = pazatorData.humans.length;
    if (othersEl) othersEl.textContent = pazatorData.others.length;
    if (totalEl) totalEl.textContent = pazatorData.humans.length + pazatorData.others.length;
}

function generateThreatReport() {
    const humanCount = pazatorData.humans.length;
    const otherCount = pazatorData.others.length;
    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');

    let report = `=== SECURITY THREAT ASSESSMENT REPORT ===\n`;
    report += `Generated: ${new Date().toLocaleString()}\n\n`;

    report += `DATA OVERVIEW\n`;
    report += `================\n`;
    report += `Human Entries: ${humanCount}\n`;
    report += `Other Entries: ${otherCount}\n`;
    report += `Total Records: ${humanCount + otherCount}\n`;
    report += `Monitored Chats: ${chatHistory.length}\n\n`;

    report += `SECURITY FINDINGS\n`;
    report += `==================\n`;
    report += `Fraud Cases Detected: ${fraudLogs.length}\n`;
    report += `Terrorism Indicators: ${terroristLogs.length}\n`;

    const highRiskHumans = pazatorData.humans.filter(h => h.credit !== undefined && h.credit < 30).length;
    report += `High-Risk Individuals: ${highRiskHumans}\n\n`;

    report += `RECOMMENDATIONS\n`;
    report += `=================\n`;

    if (fraudLogs.length > 0) {
        report += `• Review ${fraudLogs.length} fraud cases for immediate action\n`;
    }

    if (terroristLogs.length > 0) {
        report += `• Investigate ${terroristLogs.length} terrorism indicators\n`;
    }

    if (highRiskHumans > 0) {
        report += `• Monitor ${highRiskHumans} high-risk individuals\n`;
    }

    report += `• Continue regular security sweeps\n`;
    report += `• Update threat intelligence databases\n\n`;

    showAlert(report, 'Security Report', 'info');
}

function reviewHistoricalPatterns() {
    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    const previousThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
    const previousFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');

    if (fraudLogs.length === 0 && terroristLogs.length === 0 &&
        previousThreats.length === 0 && previousFraud.length === 0) {
        showAlert('No historical security incidents found.\n\nThis system tracks:\n• Fraud detection cases\n• Terrorism indicators\n• Threat assessments\n• Security pattern analysis\n\nContinue monitoring to build historical data.', 'No Data', 'info');
        return;
    }

    let report = `=== HISTORICAL SECURITY PATTERNS ===\n`;
    report += `Analysis Period: All Recorded Data\n\n`;

    if (previousThreats.length > 0) {
        report += `THREAT HISTORY (${previousThreats.length} cases)\n`;
        report += `====================================\n`;
        previousThreats.slice(-5).forEach((threat, index) => {
            report += `${index + 1}. ${threat.person || threat.name}\n`;
            report += `   Risk: ${threat.riskLevel || 'Unknown'}\n`;
            report += `   Reasons: ${(threat.reasons || threat.redFlags || []).slice(0, 2).join(', ') || 'Various factors'}\n\n`;
        });
    }

    if (previousFraud.length > 0) {
        report += `FRAUD HISTORY (${previousFraud.length} cases)\n`;
        report += `===================================\n`;
        previousFraud.slice(-5).forEach((fraud, index) => {
            report += `${index + 1}. ${fraud.person || fraud.name}\n`;
            report += `   Type: ${fraud.type || 'Unspecified'}\n`;
            report += `   Evidence: ${(fraud.evidence || fraud.redFlags || []).slice(0, 2).join(', ') || 'Multiple indicators'}\n\n`;
        });
    }

    report += `TREND ANALYSIS\n`;
    report += `================\n`;
    report += `Total Security Incidents: ${previousThreats.length + previousFraud.length}\n`;
    report += `Current Active Cases: ${fraudLogs.length + terroristLogs.length}\n`;
    report += `Security Trend: ${fraudLogs.length + terroristLogs.length > previousThreats.length + previousFraud.length ? 'INCREASING' : 'STABLE/DECREASING'}\n\n`;

    report += `RECOMMENDED ACTIONS\n`;
    report += `=====================\n`;
    report += `• Review recent ${fraudLogs.length + terroristLogs.length} active cases\n`;
    report += `• Analyze patterns in historical data\n`;
    report += `• Update security protocols based on findings\n`;
    report += `• Schedule regular pattern analysis reviews\n`;

    showAlert(report, 'Historical Analysis', 'info');
}

function loadSavedChats() {
    const chatHistory = ChatStorageManager.getChatHistory();
    updateStorageMetrics();

    if (chatHistory.length === 0) {
        savedChatsList.innerHTML = '<p style="color: #777; text-align: center;">No saved chats found</p>';
        return;
    }

    savedChatsList.innerHTML = '';

    const stats = ChatStorageManager.getStorageStats();
    if (stats.isNearLimit) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = 'background: rgba(255, 193, 7, 0.2); border: 1px solid #ffc107; border-radius: 8px; padding: 10px 15px; margin-bottom: 15px; color: #ffc107; font-size: 0.85rem;';
        warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Storage: ${stats.totalSizeMB}MB - Consider exporting and clearing old chats`;
        savedChatsList.appendChild(warningDiv);
    }

    const visibleIndices = getVisibleChatIndices();
    
    if (visibleIndices.length === 0 && (chatSearchFilter || chatSourceFilter)) {
        savedChatsList.innerHTML = '<p style="color: #777; text-align: center;">No chats match your search/filter criteria</p>';
        return;
    }

    visibleIndices.forEach(index => {
        const chat = chatHistory[index];
        const chatCard = document.createElement('div');
        const isSelected = selectedChatIndices.has(index);
        
        chatCard.style.background = isSelected ? 'rgba(60, 100, 140, 0.4)' : 'rgba(40, 40, 40, 0.7)';
        chatCard.style.border = isSelected ? '1px solid #4a90d9' : '1px solid #333';
        chatCard.style.borderRadius = '8px';
        chatCard.style.padding = '15px';
        chatCard.style.marginBottom = '15px';
        chatCard.style.cursor = 'pointer';
        chatCard.style.transition = 'all 0.2s ease';

        const date = new Date(chat.timestamp).toLocaleDateString();
        const participants = chat.participants.map(p => p.name).join(', ');
        const wordCount = chat.content.split(' ').length;
        const messageCount = chat.parsed?.messageCount || wordCount;
        const hasEntities = chat.parsed?.entities;
        const entityCount = hasEntities ? 
            (hasEntities.urls?.length || 0) + (hasEntities.emails?.length || 0) + (hasEntities.phones?.length || 0) : 0;

        chatCard.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                   onclick="event.stopPropagation(); toggleChatSelection(${index})"
                                   style="margin-top: 4px; width: 18px; height: 18px; cursor: pointer;">
                            <div style="flex: 1;">
                                <h4 style="margin: 0 0 8px 0; color: #ffffff;">
                                    ${chat.source.toUpperCase()} Chat
                                    ${entityCount > 0 ? `<span style="font-size: 0.75rem; color: #ff9800; margin-left: 8px;">(${entityCount} entities)</span>` : ''}
                                </h4>
                                <p style="margin: 0 0 8px 0; color: #aaa; font-size: 0.9rem;">Participants: ${participants}</p>
                                <p style="margin: 0 0 8px 0; color: #aaa; font-size: 0.9rem;">${messageCount} messages • ${wordCount} words • ${date}</p>
                                ${chat.context ? `<p style="margin: 0; color: #888; font-size: 0.85rem;">Context: ${chat.context}</p>` : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" 
                                    onclick="event.stopPropagation(); previewChat(${index})">
                                <i class="fas fa-eye"></i> Preview
                            </button>
                            <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;" 
                                    onclick="event.stopPropagation(); analyzeSingleChat(${index})">
                                <i class="fas fa-search"></i> Analyze
                            </button>
                            <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" 
                                    onclick="event.stopPropagation(); deleteChat(${index})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;

        chatCard.addEventListener('click', () => toggleChatSelection(index));
        
        chatCard.addEventListener('mouseenter', () => {
            if (!isSelected) {
                chatCard.style.background = 'rgba(60, 60, 60, 0.7)';
            }
            chatCard.style.transform = 'translateY(-2px)';
        });

        chatCard.addEventListener('mouseleave', () => {
            chatCard.style.background = isSelected ? 'rgba(60, 100, 140, 0.4)' : 'rgba(40, 40, 40, 0.7)';
            chatCard.style.transform = 'translateY(0)';
        });

        savedChatsList.appendChild(chatCard);
    });
}

function toggleChatSelection(index) {
    if (selectedChatIndices.has(index)) {
        selectedChatIndices.delete(index);
    } else {
        selectedChatIndices.add(index);
    }
    
    if (selectedChatIndices.size > 0) {
        bulkDeleteChatsBtn.style.display = 'inline-block';
    } else {
        bulkDeleteChatsBtn.style.display = 'none';
    }
    
    loadSavedChats();
}

function previewChat(index) {
    const chatHistory = ChatStorageManager.getChatHistory();
    const chat = chatHistory[index];
    
    if (!chat) {
        showAlert('Chat not found!', 'Error', 'error');
        return;
    }
    
    const participants = chat.participants.map(p => p.name).join(', ');
    const wordCount = chat.content.split(' ').length;
    const messageCount = chat.parsed?.messageCount || 'N/A';
    const date = new Date(chat.timestamp).toLocaleString();
    
    let entities = '';
    if (chat.parsed?.entities) {
        const e = chat.parsed.entities;
        if (e.urls?.length) entities += `\nURLs: ${e.urls.slice(0, 5).join('\n  ')}${e.urls.length > 5 ? '\n  ...' : ''}`;
        if (e.emails?.length) entities += `\nEmails: ${e.emails.join(', ')}`;
        if (e.phones?.length) entities += `\nPhones: ${e.phones.join(', ')}`;
    }
    
    const preview = `
=== ${chat.source.toUpperCase()} CHAT PREVIEW ===

Participants: ${participants}
Date: ${date}
Messages: ${messageCount}
Words: ${wordCount}
Context: ${chat.context || 'None'}
${entities ? '\n--- Detected Entities ---' + entities : ''}

--- Content Preview (first 1500 chars) ---
${chat.content.substring(0, 1500)}${chat.content.length > 1500 ? '\n\n... (truncated)' : ''}
    `.trim();
    
    showAlert(preview, 'Chat Preview', 'info');
}

async function analyzeAllChats() {
    const chatHistory = ChatStorageManager.getChatHistory();

    if (chatHistory.length === 0) {
        showAlert('No chats to analyze!', 'Notice', 'info');
        return;
    }

    analyzeAllChatsBtn.disabled = true;
    const originalText = analyzeAllChatsBtn.innerHTML;
    analyzeAllChatsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    try {
        const totalChatsBySource = {};

        const analysisResults = await ChatAnalysisService.batchAnalyze(chatHistory, {
            onProgress: (progress) => {
                analyzeAllChatsBtn.innerHTML = `<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing... ${Math.round(progress)}%`;
            },
            onChatComplete: (result) => {
                if (result.result.isSuspicious) {
                    totalChatsBySource[result.source] = (totalChatsBySource[result.source] || 0) + 1;
                }
            }
        });

        const totalSuspicious = analysisResults.filter(r => r.result.isSuspicious).length;
        const totalChats = chatHistory.length;
        const securityScore = Math.max(0, 100 - (totalSuspicious / totalChats * 100));

        const byRiskLevel = { high: [], medium: [], low: [] };
        analysisResults.forEach(item => {
            if (item.result.isSuspicious) {
                byRiskLevel[item.result.riskLevel || 'low'].push(item);
            }
        });

        const scoreClass = securityScore >= 80 ? 'good' : securityScore >= 50 ? 'medium' : 'bad';
        
        const allSuspiciousItems = [];
        ['high', 'medium', 'low'].forEach(level => {
            byRiskLevel[level].forEach(item => {
                allSuspiciousItems.push({ ...item, level });
            });
        });

        const modalHtml = `
            <div class="security-report">
                <div class="security-report-header">
                    <div class="security-score-badge ${scoreClass}">
                        <span class="score">${securityScore.toFixed(0)}%</span>
                        <span class="label">Score</span>
                    </div>
                    <div class="security-meta">
                        <h4>Security Analysis</h4>
                        <div class="stats">
                            <div class="stat">
                                <span class="val">${totalChats}</span>
                                <span class="lbl">Chats</span>
                            </div>
                            <div class="stat ${totalSuspicious > 0 ? 'warning' : ''}">
                                <span class="val">${totalSuspicious}</span>
                                <span class="lbl">Suspicious</span>
                            </div>
                        </div>
                    </div>
                </div>
                ${totalSuspicious > 0 ? `
                    <div class="security-issues">
                        <h5><i class="fas fa-exclamation-triangle"></i> Suspicious Chats</h5>
                        ${allSuspiciousItems.slice(0, 10).map(item => {
                            const participantNames = Array.isArray(item.participants) 
                                ? item.participants.map(p => typeof p === 'object' ? p.name : p).join(', ')
                                : 'Unknown';
                            return `
                            <div class="security-issue-item ${item.level}">
                                <div class="item-header">
                                    <span class="risk-badge ${item.level}">${item.level.toUpperCase()}</span>
                                    <span class="src">[${item.source?.toUpperCase() || 'UNKNOWN'}]</span>
                                    <span class="names">${participantNames}</span>
                                </div>
                                <div class="flags-list">
                                    ${item.result.redFlags?.slice(0, 4).map(flag => 
                                        `<span class="flag-tag">${flag}</span>`
                                    ).join('') || '<span class="flag-tag">General concern</span>'}
                                </div>
                            </div>
                        `}).join('')}
                        ${allSuspiciousItems.length > 10 ? `<p style="color: #888; font-size: 0.85rem; text-align: center; margin-top: 10px;">+${allSuspiciousItems.length - 10} more</p>` : ''}
                    </div>
                ` : `
                    <div class="security-ok">
                        <i class="fas fa-shield-check"></i>
                        <p>All chats look secure.</p>
                    </div>
                `}
            </div>
        `;

        showModal({
            title: 'Chat Security Report',
            type: securityScore >= 80 ? 'success' : securityScore >= 50 ? 'warning' : 'error',
            html: modalHtml,
            buttons: [{ text: 'Close', primary: true }]
        });

    } catch (error) {
        console.error('Error analyzing all chats:', error);
        showAlert('Error analyzing chats. Please try again.', 'Error', 'error');
    } finally {
        analyzeAllChatsBtn.disabled = false;
        analyzeAllChatsBtn.innerHTML = originalText;
        lastAnalysisTimestamp = new Date().toISOString();
        updateLastScanTime();
    }
}

async function analyzeChatContent(content, source) {
    return ChatAnalysisService.analyze(content, source);
}

async function analyzeSingleChat(index) {
    const chatHistory = ChatStorageManager.getChatHistory();

    if (!chatHistory[index]) {
        showAlert('Chat not found!', 'Error', 'error');
        return;
    }

    const chat = chatHistory[index];
    const result = await ChatAnalysisService.analyze(chat.content, chat.source);

    let message = `=== Chat Analysis Result ===\n\n`;
    message += `Source: ${chat.source.toUpperCase()}\n`;
    message += `Participants: ${chat.participants.map(p => p.name).join(', ')}\n`;
    message += `Messages: ${chat.parsed?.messageCount || chat.content.split(' ').length}\n`;
    message += `Words: ${chat.content.split(' ').length}\n\n`;
    message += `Suspicious: ${result.isSuspicious ? 'YES' : 'NO'}\n`;
    message += `Risk Level: ${result.riskLevel?.toUpperCase() || 'LOW'}\n\n`;

    if (result.redFlags && result.redFlags.length > 0) {
        message += "Red Flags:\n" + result.redFlags.map(flag => "• " + flag).join("\n") + "\n\n";
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

    message += `Summary: ${result.summary || 'No specific concerns'}`;

    if (result.recommendations?.length > 0) {
        message += `\n\nRecommendations:\n${result.recommendations.map(r => `• ${r}`).join('\n')}`;
    }

    showAlert(message, 'Single Chat Analysis', 'info');
}

async function deleteChat(index) {
    const confirmed = await showConfirm('Are you sure you want to delete this chat?', 'Confirm Deletion', 'warning');
    if (confirmed) {
        if (ChatStorageManager.deleteChat(index)) {
            loadSavedChats();
        } else {
            showAlert('Failed to delete chat', 'Error', 'error');
        }
    }
}

async function exportHumanToPDF(humanId) {
    const human = pazatorData.humans.find(h => h.id === humanId);
    if (!human) {
        showAlert('Person not found', 'Error', 'error');
        return;
    }

    if (!logoBase64) {
        await loadLogoForPDF();
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, 60, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(52);
    doc.setFont('helvetica', 'bold');
    doc.text('PAZATOR', margin, 30);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SARPARAST', margin, 42);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 52);

    if (logoBase64) {
        const logoSize = 30;
        const logoX = pageWidth - margin - logoSize;
        doc.addImage(logoBase64, 'PNG', logoX, 15, logoSize, logoSize);
    }

    y = 75;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(human.name, margin, y);
    y += 12;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const sections = [
        { title: 'BASIC INFORMATION', items: [
            { label: 'ID', value: human.id },
            { label: 'Gender', value: human.gender || 'Not specified' },
            { label: 'Birth Date', value: human.birthDate ? new Date(human.birthDate).toLocaleDateString() : 'Not specified' },
            { label: 'Age', value: human.birthDate ? calculateAge(human.birthDate) + ' years' : 'Not specified' },
            { label: 'Marital Status', value: human.maritalStatus || 'Not specified' },
            { label: 'Occupation', value: human.workplace || 'Not specified' }
        ]},
        { title: 'BACKGROUND', items: [
            { label: 'Nationality', value: human.nationality || 'Not specified' },
            { label: 'Country of Origin', value: human.countryOfOrigin || 'Not specified' },
            { label: 'Immigration Status', value: human.immigrationStatus || 'Not specified' },
            { label: 'Languages', value: human.languages || 'Not specified' }
        ]},
        { title: 'DEMOGRAPHICS', items: [
            { label: 'Ethnicity', value: human.ethnicity || 'Not specified' },
            { label: 'Religion', value: human.religion || 'Not specified' },
            { label: 'Political Views', value: human.politicalViews || 'Not specified' },
            { label: 'Threat Level', value: human.threatLevel || 'Not specified' }
        ]},
        { title: 'SOCIOECONOMIC', items: [
            { label: 'Credit Score', value: human.credit !== undefined ? Math.round(human.credit).toString() : 'Not recorded' },
            { label: 'Social Class', value: human.socialClass || 'Not specified' },
            { label: 'Income Level', value: human.incomeLevel || 'Not specified' },
            { label: 'Education', value: human.educationLevel || 'Not specified' }
        ]},
        { title: 'RELATIONSHIPS', items: [
            { label: 'Friends', value: human.friends?.length ? human.friends.join(', ') : 'None recorded' },
            { label: 'Family', value: human.family?.length ? human.family.join(', ') : 'None recorded' }
        ]},
        { title: 'NOTES', items: [
            { label: 'Notes', value: human.extraNotes || 'No notes' }
        ]}
    ];

    sections.forEach(section => {
        if (y > pageHeight - 60) {
            doc.addPage();
            y = margin;
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 40, y);
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(section.title, margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        section.items.forEach(item => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = margin;
            }

            doc.setFont('helvetica', 'bold');
            doc.text(item.label + ':', margin, y);
            doc.setFont('helvetica', 'normal');

            const valueLines = doc.splitTextToSize(item.value, contentWidth - 45);
            doc.text(valueLines, margin + 45, y);
            y += (valueLines.length * 4) + 4;
        });

        y += 8;
    });

    if (human.tags?.length) {
        if (y > pageHeight - 40) {
            doc.addPage();
            y = margin;
        }

        doc.line(margin, y, margin + 40, y);
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('TAGS', margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        const tagWidth = 30;
        const tagHeight = 7;
        let tagX = margin;
        let tagY = y;

        human.tags.forEach(tag => {
            const tagText = ' ' + tag + ' ';
            const textWidth = doc.getTextWidth(tagText);

            if (tagX + textWidth + 4 > pageWidth - margin) {
                tagX = margin;
                tagY += tagHeight + 3;
            }

            doc.setFillColor(240, 240, 240);
            doc.rect(tagX, tagY - 4, textWidth + 4, tagHeight, 'F');
            doc.setDrawColor(150, 150, 150);
            doc.rect(tagX, tagY - 4, textWidth + 4, tagHeight, 'S');
            doc.text(tagText, tagX + 2, tagY);

            tagX += textWidth + 8;
        });
    }

    y = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text('Pazator Intelligence System - SARPARAST', pageWidth / 2, y, { align: 'center' });

    doc.save(`pazator-${human.name.replace(/\s+/g, '-').toLowerCase()}-report.pdf`);
    showAlert(`PDF report generated for ${human.name}`, 'Export Complete', 'success');
}

function calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function getThreatLevelColor(level) {
    switch (level?.toLowerCase()) {
        case 'critical': return '#d32f2f';
        case 'high': return '#f44336';
        case 'medium': return '#ff9800';
        case 'low': return '#4caf50';
        default: return '';
    }
}

function exportChatReport(format = 'txt') {
    const chatHistory = ChatStorageManager.getChatHistory();
    const stats = ChatStorageManager.getStorageStats();

    if (chatHistory.length === 0) {
        showAlert('No chats to export!', 'Notice', 'info');
        return;
    }

    if (format === 'json') {
        const exportData = {
            exportDate: new Date().toISOString(),
            stats: stats,
            chats: chatHistory
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pazator-chat-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }

    let report = `Pazator Chat Analysis Report\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Chats: ${chatHistory.length}\n`;
    report += `Total Size: ${stats.totalSizeMB}MB\n\n`;

    chatHistory.forEach((chat, index) => {
        const date = new Date(chat.timestamp).toLocaleDateString();
        const participants = chat.participants.map(p => p.name).join(', ');
        const wordCount = chat.content.split(' ').length;
        const messageCount = chat.parsed?.messageCount || 'N/A';

        report += `=== Chat ${index + 1} ===\n`;
        report += `Source: ${chat.source.toUpperCase()}\n`;
        report += `Date: ${date}\n`;
        report += `Participants: ${participants}\n`;
        report += `Messages: ${messageCount}\n`;
        report += `Word Count: ${wordCount}\n`;
        report += `Context: ${chat.context || 'None'}\n`;
        report += `Content Preview: ${chat.content.substring(0, 200)}${chat.content.length > 200 ? '...' : ''}\n\n`;
    });

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pazator-chat-report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function clearChatHistory() {
    const stats = ChatStorageManager.getStorageStats();
    const confirmed = await showConfirm(
        `Are you sure you want to clear ALL chat history? This will delete ${stats.totalChats} chats (${stats.totalSizeMB}MB) and cannot be undone.`,
        'Confirm Deletion',
        'warning'
    );
    if (confirmed) {
        ChatStorageManager.clearAllChats();
        loadSavedChats();
        showAlert('Chat history cleared successfully!', 'Success', 'success');
    }
}

document.getElementById('closeConnectionsModal').addEventListener('click', () => {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    hiddenConnectionsModal.style.display = 'none';
    hiddenConnectionsModal.style.zIndex = '-1';
});

document.getElementById('manualRefreshBtn')?.addEventListener('click', () => {
    manualRefresh();
});

async function findHiddenConnections() {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    const connectionsLoading = document.getElementById('connectionsLoading');
    const connectionsResults = document.getElementById('connectionsResults');
    const noConnections = document.getElementById('noConnections');
    const connectionsGraph = document.getElementById('connectionsGraph');
    const connectionsList = document.getElementById('connectionsList');

    connectionsLoading.style.display = 'block';
    connectionsResults.style.display = 'none';
    noConnections.style.display = 'none';
    hiddenConnectionsModal.style.display = 'flex';
    hiddenConnectionsModal.style.zIndex = '1000';

    findConnectionsBtn.disabled = true;
    findConnectionsBtn.textContent = 'Analyzing...';

    try {

        const humansData = pazatorData.humans.map(human => ({
            id: human.id,
            name: human.name,
            gender: human.gender,
            birthDate: human.birthDate,
            workplace: human.workplace,
            friends: human.friends || [],
            family: human.family || [],
            extraNotes: human.extraNotes || '',
            tags: human.tags || []
        }));

        const context = `
                    You are an AI detective analyzing connections between people in a social network.
                    Your task is to identify potential hidden connections between people based on their data.

                    Here's the data about the people:
                    ${JSON.stringify(humansData, null, 2)}

                    Based on the information provided, identify potential connections that are not explicitly stated.
                    Look for patterns such as:
                    - People who work at the same workplace
                    - People with similar tags or interests
                    - People with close birth dates (possibly classmates)
                    - People who share friends or family members
                    - People with similar political views or characteristics mentioned in extraNotes
                    - People with overlapping or similar tags
                    - People with common interests based on their tags

                    Return your findings as a JSON array of potential connections in this format:
                    [
                        {
                            "person1": "Person Name 1",
                            "person2": "Person Name 2",
                            "reason": "They both work at the same company",
                            "connectionType": "work" 
                        },
                        {
                            "person1": "Person Name 3",
                            "person2": "Person Name 4",
                            "reason": "They share multiple mutual friends",
                            "connectionType": "friend"
                        }
                    ]

                    Only return connections that are not already explicitly defined in the data.
                    Be concise and only include strong potential connections.
                    If no hidden connections are found, return an empty array.
                `;

        const aiResponse = await puter.ai.chat([
            { role: "system", content: context },
            { role: "user", content: "Analyze the data and find hidden connections between these people." }
        ]);

        const responseText = aiResponse.content ? aiResponse.content : aiResponse;

        try {

            const connections = extractJSONFromResponse(responseText);

            if (connections && Array.isArray(connections) && connections.length > 0) {

                connectionsLoading.style.display = 'none';
                connectionsResults.style.display = 'block';

                renderConnectionsGraph(connections, connectionsGraph);

                renderConnectionsList(connections, connectionsList);
            } else {

                connectionsLoading.style.display = 'none';
                noConnections.style.display = 'block';
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            connectionsLoading.style.display = 'none';
            noConnections.style.display = 'block';
            noConnections.innerHTML = `
                        <h3>Error Processing Results</h3>
                        <p>I found some potential connections, but had trouble processing them.</p>
                        <div style="background: rgba(40, 40, 40, 0.7); padding: 15px; border-radius: 10px; margin-top: 15px; white-space: pre-wrap;">${responseText}</div>
                    `;
        }
    } catch (error) {
        console.error('Error finding hidden connections:', error);
        connectionsLoading.style.display = 'none';
        noConnections.style.display = 'block';
        noConnections.innerHTML = `
                    <h3>Error Analyzing Connections</h3>
                    <p>Sorry, I encountered an error while analyzing the connections. Please try again.</p>
                `;
    } finally {
        findConnectionsBtn.disabled = false;
        findConnectionsBtn.textContent = 'Find Hidden Connections';
    }
}

function renderConnectionsGraph(connections, graphContainer) {
    graphContainer.innerHTML = '';

    const people = [...new Set(connections.flatMap(conn => [conn.person1, conn.person2]))];

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const personPositions = {};
    people.forEach((person, index) => {
        const angle = (index / people.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius - 30;
        const y = centerY + Math.sin(angle) * radius - 30;

        personPositions[person] = { x: x + 30, y: y + 30 };

        const node = document.createElement('div');
        node.className = 'connection-node';
        node.textContent = person.length > 10 ? person.substring(0, 10) + '...' : person;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        graphContainer.appendChild(node);
    });

    connections.forEach((connection, index) => {
        const pos1 = personPositions[connection.person1];
        const pos2 = personPositions[connection.person2];

        if (pos1 && pos2) {
            const line = document.createElement('div');
            line.className = 'connection-line';

            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            line.style.width = `${length}px`;
            line.style.height = '3px';
            line.style.left = `${pos1.x}px`;
            line.style.top = `${pos1.y}px`;
            line.style.transform = `rotate(${angle}deg)`;

            graphContainer.appendChild(line);

            const label = document.createElement('div');
            label.className = 'connection-label';
            label.textContent = connection.connectionType;
            label.style.left = `${(pos1.x + pos2.x) / 2}px`;
            label.style.top = `${(pos1.y + pos2.y) / 2}px`;
            graphContainer.appendChild(label);
        }
    });
}

function renderConnectionsList(connections, listContainer) {
    listContainer.innerHTML = '';

    connections.forEach((connection, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        item.innerHTML = `
                    <div class="connection-item-header">
                        <strong>${connection.person1} ↔ ${connection.person2}</strong>
                        <span class="connection-type">${connection.connectionType}</span>
                    </div>
                    <p>${connection.reason}</p>
                `;

        listContainer.appendChild(item);
    });
}

function calculateCreditScore(human) {
    let score = 185;
    
    const positiveTags = ['rich', 'professional', 'trusted', 'reliable', 'honest', 'successful', 'educated', 'business', 'leader', 'owner', 'manager', 'doctor', 'engineer', 'investor', 'executive', 'professional', 'veteran'];
    const negativeTags = ['suspicious', 'fraud', 'dangerous', 'criminal', 'scam', 'untrusted', 'debt', 'bankrupt', 'unemployed', 'unstable'];
    
    if (human.tags && human.tags.length > 0) {
        human.tags.forEach(tag => {
            const t = tag.toLowerCase();
            if (positiveTags.includes(t)) score += 15;
            if (negativeTags.includes(t)) score -= 25;
        });
    }
    
    if (human.workplace) {
        const wp = human.workplace.toLowerCase();
        if (wp.includes('bank') || wp.includes('corp') || wp.includes('inc') || wp.includes('llc') || wp.includes('ltd') || wp.includes('group')) {
            score += 20;
        } else if (human.workplace) {
            score += 10;
        }
    }
    
    if (human.socialClass === '1%') score = Math.min(370, score + 100);
    else if (human.socialClass === 'high class') score = Math.min(370, score + 50);
    else if (human.socialClass === 'low class') score = Math.max(0, score - 50);
    
    const connections = (human.friends ? human.friends.length : 0) + (human.family ? human.family.length : 0);
    if (connections > 5) score = Math.min(370, score + 20);
    else if (connections === 0) score = Math.max(0, score - 20);
    
    if (human.extraNotes) {
        const notes = human.extraNotes.toLowerCase();
        if (notes.includes('trust') || notes.includes('reliable') || notes.includes('good') || notes.includes('stable')) score += 20;
        if (notes.includes('suspicious') || notes.includes('warning') || notes.includes('risk') || notes.includes('investigate')) score -= 35;
    }
    
    return Math.max(0, Math.min(370, Math.round(score)));
}

function inferSocialClass(creditScore) {
    if (creditScore >= 300) return '1%';
    if (creditScore >= 220) return 'high class';
    if (creditScore >= 140) return 'medium class';
    return 'low class';
}

function getCreditRiskLevel(score) {
    if (score < 125) return 'high';
    if (score < 250) return 'medium';
    return 'low';
}

function showCreditEvalModal() {
    const modal = document.getElementById('creditEvalModal');
    const progressContainer = document.getElementById('creditEvalProgressContainer');
    const resultsContainer = document.getElementById('creditEvalResults');
    const closeBtn = document.getElementById('creditEvalCloseBtn');
    const icon = document.getElementById('creditEvalIcon');
    const title = document.getElementById('creditEvalTitle');
    
    if (modal) modal.classList.add('active');
    if (progressContainer) progressContainer.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (icon) {
        icon.classList.remove('done');
        icon.classList.add('processing');
        icon.innerHTML = '<i class="fas fa-brain fa-spin"></i>';
    }
    if (title) title.textContent = 'AI Credit Evaluation';
    
    updateCreditEvalProgress(0, pazatorData.humans.length, '-');
}

function updateCreditEvalProgress(current, total, currentName) {
    const progressFill = document.getElementById('creditEvalProgressFill');
    const progressText = document.getElementById('creditEvalProgressText');
    const currentNameEl = document.getElementById('creditEvalCurrentName');
    
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${current} / ${total}`;
    if (currentNameEl) currentNameEl.textContent = currentName || '-';
}

function showCreditEvalComplete(results) {
    const modal = document.getElementById('creditEvalModal');
    const progressContainer = document.getElementById('creditEvalProgressContainer');
    const resultsContainer = document.getElementById('creditEvalResults');
    const closeBtn = document.getElementById('creditEvalCloseBtn');
    const icon = document.getElementById('creditEvalIcon');
    const title = document.getElementById('creditEvalTitle');
    
    if (progressContainer) progressContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'inline-flex';
    if (icon) {
        icon.classList.remove('processing');
        icon.classList.add('done');
        icon.innerHTML = '<i class="fas fa-check"></i>';
    }
    if (title) title.textContent = 'Evaluation Complete';
    
    const highCount = document.getElementById('creditEvalHighCount');
    const mediumCount = document.getElementById('creditEvalMediumCount');
    const lowCount = document.getElementById('creditEvalLowCount');
    const detail = document.getElementById('creditEvalDetail');
    
    if (highCount) highCount.textContent = results.high;
    if (mediumCount) mediumCount.textContent = results.medium;
    if (lowCount) lowCount.textContent = results.low;
    if (detail) {
        detail.innerHTML = `Analyzed <strong>${results.total}</strong> people. ` +
            `Average score: <strong>${results.average}</strong>. ` +
            `Scores range from <strong>${results.min}</strong> to <strong>${results.max}</strong>.`;
    }
}

function hideCreditEvalModal() {
    const modal = document.getElementById('creditEvalModal');
    if (modal) modal.classList.remove('active');
}

async function refreshPersonCredits() {
    if (pazatorData.humans.length === 0) {
        showAlert('No humans to evaluate. Add some people first.', 'No Data', 'info');
        return;
    }
    
    showCreditEvalModal();
    
    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = true;
        refreshCreditsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Evaluating...';
    }
    
    const humansToEvaluate = pazatorData.humans.map(h => ({
        id: h.id,
        name: h.name,
        gender: h.gender || '',
        birthDate: h.birthDate || '',
        workplace: h.workplace || '',
        socialClass: h.socialClass || '',
        friends: h.friends || [],
        family: h.family || [],
        extraNotes: h.extraNotes || '',
        tags: h.tags || []
    }));
    
    const contextPrompt = `You are a credit risk analyst. Evaluate each person's credit score based on ALL available data.
    
Consider these factors:
- Name (some names associated with certain backgrounds/regions)
- Gender
- Birth date (calculate age)
- Workplace (professional environment indicates stability)
- Social class (already assigned class)
- Friends count (social stability)
- Family count (family support network)
- Tags (professional tags = positive, negative tags = risk)
- Notes (explicit mentions of trust, reliability, warnings, suspicions)

Credit Score Range: 0-370
- 0-124: HIGH RISK (financial instability, high risk of default)
- 125-249: MEDIUM RISK (moderate risk)
- 250-370: LOW RISK (stable, reliable)

Return a JSON array with credit scores for ALL people. Format:
[{"id": "person_id", "creditScore": 250}, {"id": "person_id2", "creditScore": 180}]

IMPORTANT: Return scores for ALL ${humansToEvaluate.length} people. Be realistic - use the full range.`;

    try {
        const aiResponse = await puter.ai.chat([
            { role: "system", content: contextPrompt },
            { role: "user", content: "Here is the data:\n" + JSON.stringify(humansToEvaluate, null, 2) + "\n\nReturn credit scores for all people." }
        ]);
        
        const responseText = aiResponse.content || String(aiResponse);
        
        let scores = [];
        try {
            const parsed = JSON.parse(responseText);
            if (Array.isArray(parsed)) {
                scores = parsed;
            }
        } catch {
            const match = responseText.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    scores = JSON.parse(match[0]);
                } catch {}
            }
        }
        
        const scoreMap = new Map();
        scores.forEach(s => {
            if (s && s.id && typeof s.creditScore === 'number') {
                scoreMap.set(s.id, Math.max(0, Math.min(370, Math.round(s.creditScore))));
            }
        });
        
        let evaluated = 0;
        const total = pazatorData.humans.length;
        
        for (const human of pazatorData.humans) {
            const score = scoreMap.get(human.id);
            if (score !== undefined) {
                human.credit = score;
            } else {
                human.credit = Math.floor(Math.random() * 150) + 110;
            }
            
            human.socialClass = inferSocialClass(human.credit);
            
            evaluated++;
            updateCreditEvalProgress(evaluated, total, human.name);
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        const highCount = pazatorData.humans.filter(h => h.credit < 125).length;
        const mediumCount = pazatorData.humans.filter(h => h.credit >= 125 && h.credit < 250).length;
        const lowCount = pazatorData.humans.filter(h => h.credit >= 250).length;
        const avgScore = Math.round(pazatorData.humans.reduce((sum, h) => sum + h.credit, 0) / pazatorData.humans.length);
        const minScore = Math.min(...pazatorData.humans.map(h => h.credit));
        const maxScore = Math.max(...pazatorData.humans.map(h => h.credit));
        
        showCreditEvalComplete({
            high: highCount,
            medium: mediumCount,
            low: lowCount,
            total: total,
            average: avgScore,
            min: minScore,
            max: maxScore
        });
        
        saveData();
        renderWebNodes();
        updateCreditStats();
        
    } catch (error) {
        console.error('AI credit evaluation failed:', error);
        showAlert('AI evaluation failed: ' + error.message + '. Using fallback calculation.', 'Error', 'error');
        
        pazatorData.humans.forEach(human => {
            human.credit = calculateCreditScore(human);
            human.credit = Math.round(human.credit * 3.7);
            human.socialClass = inferSocialClass(human.credit);
        });
        
        saveData();
        renderWebNodes();
        updateCreditStats();
        hideCreditEvalModal();
    }
    
    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = false;
        refreshCreditsBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Credits';
    }
}

document.getElementById('creditEvalCloseBtn')?.addEventListener('click', hideCreditEvalModal);

document.getElementById('creditEvalModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'creditEvalModal') {
        const resultsVisible = document.getElementById('creditEvalResults')?.style.display !== 'none';
        if (resultsVisible) hideCreditEvalModal();
    }
});

async function findPotentialTerrorists() {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    const connectionsLoading = document.getElementById('connectionsLoading');
    const connectionsResults = document.getElementById('connectionsResults');
    const noConnections = document.getElementById('noConnections');
    const connectionsGraph = document.getElementById('connectionsGraph');
    const connectionsList = document.getElementById('connectionsList');

    connectionsLoading.style.display = 'block';
    connectionsResults.style.display = 'none';
    noConnections.style.display = 'none';
    hiddenConnectionsModal.style.display = 'flex';
    hiddenConnectionsModal.style.zIndex = '1000';

    document.querySelector('#hiddenConnectionsModal h2').textContent = 'Potential Terrorist Analysis';

    findTerroristsBtn.disabled = true;
    findTerroristsBtn.textContent = 'Analyzing...';

    try {

        const humansData = pazatorData.humans.map(human => ({
            id: human.id,
            name: human.name,
            gender: human.gender,
            birthDate: human.birthDate,
            workplace: human.workplace,
            friends: human.friends || [],
            family: human.family || [],
            extraNotes: human.extraNotes || '',
            tags: human.tags || []
        }));

        const context = "You are an AI security analyst analyzing people to identify potential terrorist threats. " +
            "Your task is to identify as many individuals as possible who might pose security risks based on their data. " +
            "Be comprehensive and identify multiple potential cases, even borderline ones.\n\n" +
            "Here's the data about the people:\n" +
            JSON.stringify(humansData, null, 2) + "\n\n" +
            "Based on the information provided, identify potential security threats. " +
            "Look for suspicious patterns such as:\n" +
            "- People with extremist views or radical ideologies mentioned in notes\n" +
            "- People with connections to known extremist groups or individuals\n" +
            "- People with travel patterns to conflict zones or high-risk areas\n" +
            "- People with unusual financial transactions or funding sources\n" +
            "- People with military or weapons training background\n" +
            "- People with communications suggesting planning of harmful activities\n" +
            "- People with suspicious meeting patterns or covert gatherings\n" +
            "- People with dual citizenship or unclear nationality status\n" +
            "- People with tags indicating extremist or radical affiliations\n" +
            "- People with tags suggesting military or weapons expertise\n" +
            "- People with travel-related tags to conflict zones\n" +
            "- People with financial tags but unexplained income sources\n" +
            "- People with communication-related tags suggesting coordination\n" +
            "- People with multiple 'suspicious' tags\n\n" +
            "Return your findings as a JSON array of potential threats in this format:\n" +
            "[\n" +
            "    {\n" +
            "        \"person\": \"Person Name\",\n" +
            "        \"threatLevel\": \"high\", // Options: high, medium, low\n" +
            "        \"reasons\": [\n" +
            "            \"Has extremist views mentioned in notes\",\n" +
            "            \"Recent travel to conflict zones\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Mentions radical ideologies and weapons training in extra notes\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"person\": \"Another Person\",\n" +
            "        \"threatLevel\": \"medium\",\n" +
            "        \"reasons\": [\n" +
            "            \"Connections to known extremist individuals\",\n" +
            "            \"Unusual financial transactions\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Received large cash payments from unknown sources\"\n" +
            "    }\n" +
            "]\n\n" +
            "Be comprehensive and identify as many potential cases as possible, including borderline cases. " +
            "Even if you're not completely certain, include people who have some suspicious indicators. " +
            "Aim to identify at least 10-20% of the people if possible. " +
            "If no suspicious individuals are found, return an empty array.";

        const aiResponse = await puter.ai.chat([
            { role: "system", content: context },
            { role: "user", content: "Analyze the data and find potential terrorist threats. Be comprehensive and identify as many potential cases as possible." }
        ]);

        const responseText = aiResponse.content ? aiResponse.content : aiResponse;

        try {

            const terrorists = extractJSONFromResponse(responseText);

            if (terrorists && Array.isArray(terrorists) && terrorists.length > 0) {

                connectionsLoading.style.display = 'none';
                connectionsResults.style.display = 'block';

                renderTerroristsGraph(terrorists, connectionsGraph);

                renderTerroristsList(terrorists, connectionsList);

                terrorists.forEach(terrorist => {
                    storeFinding('threat', {
                        name: terrorist.person,
                        riskLevel: terrorist.threatLevel,
                        evidence: terrorist.evidence,
                        reasons: terrorist.reasons
                    });
                });

                const terroristLogs = terrorists.map((terrorist, index) => ({
                    type: 'Terrorist Threat Alert',
                    severity: terrorist.threatLevel || 'medium',
                    person: terrorist.person,
                    evidence: terrorist.evidence,
                    reasons: terrorist.reasons || [],
                    detectionMethod: 'AI Security Analysis',
                    confidence: terrorist.threatLevel === 'high' ? 'High' : terrorist.threatLevel === 'medium' ? 'Medium' : 'Low'
                }));

                storeTerroristLogs(terroristLogs);
            } else {

                connectionsLoading.style.display = 'none';
                noConnections.style.display = 'block';
                noConnections.innerHTML = `
                            <h3>No Potential Terrorist Threats Found</h3>
                            <p>I couldn't identify any individuals with strong indicators of terrorist activities.</p>
                        `;
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            connectionsLoading.style.display = 'none';
            noConnections.style.display = 'block';
            noConnections.innerHTML = `
                        <h3>Error Processing Results</h3>
                        <p>I found some potential cases, but had trouble processing them.</p>
                        <div style="background: rgba(40, 40, 40, 0.7); padding: 15px; border-radius: 10px; margin-top: 15px; white-space: pre-wrap;">${responseText}</div>
                    `;
        }
    } catch (error) {
        console.error('Error finding potential terrorists:', error);
        connectionsLoading.style.display = 'none';
        noConnections.style.display = 'block';
        noConnections.innerHTML = `
                    <h3>Error Analyzing Data</h3>
                    <p>Sorry, I encountered an error while analyzing for potential terrorist threats. Please try again.</p>
                `;
    } finally {
        findTerroristsBtn.disabled = false;
        findTerroristsBtn.textContent = 'Find Potential Terrorists';

        document.querySelector('#hiddenConnectionsModal h2').textContent = 'Hidden Connections Analysis';
    }
}

function renderTerroristsGraph(terrorists, graphContainer) {
    graphContainer.innerHTML = '';

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const terroristPositions = {};
    terrorists.forEach((terrorist, index) => {
        const angle = (index / terrorists.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius - 30;
        const y = centerY + Math.sin(angle) * radius - 30;

        terroristPositions[terrorist.person] = { x: x + 30, y: y + 30 };

        const node = document.createElement('div');
        node.className = 'connection-node';

        if (terrorist.threatLevel === 'high') {
            node.style.background = 'linear-gradient(145deg, #000, #333)';
        } else if (terrorist.threatLevel === 'medium') {
            node.style.background = 'linear-gradient(145deg, #333, #555)';
        } else {
            node.style.background = 'linear-gradient(145deg, #555, #777)';
        }
        node.textContent = terrorist.person.length > 10 ? terrorist.person.substring(0, 10) + '...' : terrorist.person;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        graphContainer.appendChild(node);

        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = terrorist.threatLevel;
        label.style.left = `${x + 30}px`;
        label.style.top = `${y + 70}px`;
        label.style.background = 'rgba(30, 30, 30, 0.9)';
        graphContainer.appendChild(label);
    });
}

function renderTerroristsList(terrorists, listContainer) {
    listContainer.innerHTML = '';

    terrorists.forEach((terrorist, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        let threatClass = '';
        if (terrorist.threatLevel === 'high') {
            threatClass = 'style="background: linear-gradient(145deg, #000, #333);"';
        } else if (terrorist.threatLevel === 'medium') {
            threatClass = 'style="background: linear-gradient(145deg, #333, #555);"';
        }

        item.innerHTML = `
                    <div class="connection-item-header">
                        <strong>${terrorist.person}</strong>
                        <span class="connection-type" ${threatClass}>${terrorist.threatLevel} threat</span>
                    </div>
                    <p><strong>Evidence:</strong> ${terrorist.evidence}</p>
                    <div style="margin-top: 10px;">
                        <strong>Reasons:</strong>
                        <ul style="margin-top: 5px; padding-left: 20px;">
                            ${terrorist.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;

        listContainer.appendChild(item);
    });
}

async function findPotentialFraud() {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    const connectionsLoading = document.getElementById('connectionsLoading');
    const connectionsResults = document.getElementById('connectionsResults');
    const noConnections = document.getElementById('noConnections');
    const connectionsGraph = document.getElementById('connectionsGraph');
    const connectionsList = document.getElementById('connectionsList');

    connectionsLoading.style.display = 'block';
    connectionsResults.style.display = 'none';
    noConnections.style.display = 'none';
    hiddenConnectionsModal.style.display = 'flex';
    hiddenConnectionsModal.style.zIndex = '1000';

    document.querySelector('#hiddenConnectionsModal h2').textContent = 'Potential Fraud/Drug Sellers Analysis';

    findFraudBtn.disabled = true;

    const fraudLogs = [];
    findFraudBtn.textContent = 'Analyzing...';

    try {

        const humansData = pazatorData.humans.map(human => ({
            id: human.id,
            name: human.name,
            gender: human.gender,
            birthDate: human.birthDate,
            workplace: human.workplace,
            friends: human.friends || [],
            family: human.family || [],
            extraNotes: human.extraNotes || '',
            tags: human.tags || []
        }));

        const adminContext = getAdminContext();
        const context = "You are an AI investigator analyzing people to identify potential fraudsters or drug sellers. " +
            "Your task is to identify as many individuals as possible who might be involved in fraudulent activities or drug selling based on their data. " +
            "Be comprehensive and identify multiple potential cases, even borderline ones.\n\n" +
            (adminContext ? `ADMIN CONTEXT TO CONSIDER:\n${adminContext}\n\n` : '') +
            "Here's the data about the people:\n" +
            JSON.stringify(humansData, null, 2) + "\n\n" +
            "Based on the information provided, identify potential fraudsters or drug sellers. " +
            "Look for suspicious patterns such as:\n" +
            "- People with suspicious tags or notes (e.g., \"cash only\", \"no questions asked\", \"discount meds\", etc.)\n" +
            "- People with unusual financial patterns or unexplained wealth\n" +
            "- People with connections to known suspicious individuals\n" +
            "- People with frequent unexplained meetings or transactions\n" +
            "- People with aliases or multiple identities\n" +
            "- People with criminal records or suspicious backgrounds\n" +
            "- People with tags indicating illegal activities\n" +
            "- People with overlapping tags with known suspicious individuals\n" +
            "- People with financial-related tags but no clear workplace\n" +
            "- People with multiple \"high risk\" tags\n" +
            "- People with vague or inconsistent information\n" +
            "- People with connections to many others but no clear social ties\n" +
            "- People with tags suggesting illegal goods or services\n\n" +
            "Return your findings as a JSON array of potential fraudsters/drug sellers in this format:\n" +
            "[\n" +
            "    {\n" +
            "        \"person\": \"Person Name\",\n" +
            "        \"riskLevel\": \"high\", // Options: high, medium, low\n" +
            "        \"reasons\": [\n" +
            "            \"Has suspicious tags like 'cash only'\",\n" +
            "            \"Multiple unexplained connections to other suspicious individuals\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Mentions selling medications in extra notes\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"person\": \"Another Person\",\n" +
            "        \"riskLevel\": \"medium\",\n" +
            "        \"reasons\": [\n" +
            "            \"Frequent meetings with known suspicious individuals\",\n" +
            "            \"Unexplained wealth\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Works in cash-based business with no official records\"\n" +
            "    }\n" +
            "]\n\n" +
            "Be comprehensive and identify as many potential cases as possible, including borderline cases. " +
            "Even if you're not completely certain, include people who have some suspicious indicators. " +
            "Aim to identify at least 10-20% of the people if possible. " +
            "If no suspicious individuals are found, return an empty array.";

        const aiResponse = await puter.ai.chat([
            { role: "system", content: context },
            { role: "user", content: "Analyze the data and find potential fraudsters or drug sellers. Be comprehensive and identify as many potential cases as possible." }
        ]);

        const responseText = aiResponse.content ? aiResponse.content : aiResponse;

        try {

            const fraudsters = extractJSONFromResponse(responseText);

            if (fraudsters && Array.isArray(fraudsters) && fraudsters.length > 0) {

                connectionsLoading.style.display = 'none';
                connectionsResults.style.display = 'block';

                renderFraudstersGraph(fraudsters, connectionsGraph);

                renderFraudstersList(fraudsters, connectionsList);

                fraudsters.forEach(fraudster => {
                    storeFinding('fraud', {
                        name: fraudster.person,
                        riskLevel: fraudster.riskLevel,
                        evidence: fraudster.evidence,
                        reasons: fraudster.reasons
                    });
                });

                const fraudLogs = fraudsters.map((fraudster, index) => ({
                    type: 'Fraud Detection Alert',
                    severity: fraudster.riskLevel || 'medium',
                    person: fraudster.person,
                    evidence: fraudster.evidence,
                    reasons: fraudster.reasons || [],
                    detectionMethod: 'AI Pattern Analysis',
                    confidence: fraudster.riskLevel === 'high' ? 'High' : fraudster.riskLevel === 'medium' ? 'Medium' : 'Low'
                }));

                storeFraudLogs(fraudLogs);
            } else {

                connectionsLoading.style.display = 'none';
                noConnections.style.display = 'block';
                noConnections.innerHTML = `
                            <h3>No Potential Fraud/Drug Sellers Found</h3>
                            <p>I couldn't identify any individuals with strong indicators of fraudulent activities or drug selling.</p>
                        `;
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            connectionsLoading.style.display = 'none';
            noConnections.style.display = 'block';
            noConnections.innerHTML = `
                        <h3>Error Processing Results</h3>
                        <p>I found some potential cases, but had trouble processing them.</p>
                        <div style="background: rgba(40, 40, 40, 0.7); padding: 15px; border-radius: 10px; margin-top: 15px; white-space: pre-wrap;">${responseText}</div>
                    `;
        }
    } catch (error) {
        console.error('Error finding potential fraud:', error);
        connectionsLoading.style.display = 'none';
        noConnections.style.display = 'block';
        noConnections.innerHTML = `
                    <h3>Error Analyzing Data</h3>
                    <p>Sorry, I encountered an error while analyzing for potential fraud. Please try again.</p>
                `;
    } finally {
        findFraudBtn.disabled = false;
        findFraudBtn.textContent = 'Find Potential Fraud';

        document.querySelector('#hiddenConnectionsModal h2').textContent = 'Hidden Connections Analysis';
    }
}

function renderFraudstersGraph(fraudsters, graphContainer) {
    graphContainer.innerHTML = '';

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const fraudsterPositions = {};
    fraudsters.forEach((fraudster, index) => {
        const angle = (index / fraudsters.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius - 30;
        const y = centerY + Math.sin(angle) * radius - 30;

        fraudsterPositions[fraudster.person] = { x: x + 30, y: y + 30 };

        const node = document.createElement('div');
        node.className = 'connection-node';

        if (fraudster.riskLevel === 'high') {
            node.style.background = 'linear-gradient(145deg, #ff3939, #ff5a5a)';
        } else if (fraudster.riskLevel === 'medium') {
            node.style.background = 'linear-gradient(145deg, #ff9939, #ffaa5a)';
        } else {
            node.style.background = 'linear-gradient(145deg, #ffffff, #dddddd)';
        }
        node.textContent = fraudster.person.length > 10 ? fraudster.person.substring(0, 10) + '...' : fraudster.person;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        graphContainer.appendChild(node);

        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = fraudster.riskLevel;
        label.style.left = `${x + 30}px`;
        label.style.top = `${y + 70}px`;
        label.style.background = 'rgba(30, 30, 30, 0.9)';
        graphContainer.appendChild(label);
    });
}

function renderFraudstersList(fraudsters, listContainer) {
    listContainer.innerHTML = '';

    fraudsters.forEach((fraudster, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        let riskClass = '';
        if (fraudster.riskLevel === 'high') {
            riskClass = 'style="background: linear-gradient(145deg, #ff3939, #ff5a5a);"';
        } else if (fraudster.riskLevel === 'medium') {
            riskClass = 'style="background: linear-gradient(145deg, #ff9939, #ffaa5a);"';
        }

        item.innerHTML = `
                    <div class="connection-item-header">
                        <strong>${fraudster.person}</strong>
                        <span class="connection-type" ${riskClass}>${fraudster.riskLevel} risk</span>
                    </div>
                    <p><strong>Evidence:</strong> ${fraudster.evidence}</p>
                    <div style="margin-top: 10px;">
                        <strong>Reasons:</strong>
                        <ul style="margin-top: 5px; padding-left: 20px;">
                            ${fraudster.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;

        listContainer.appendChild(item);
    });
}

function loadPreviousFindings() {
    const threatsList = document.getElementById('threatsList');
    const fraudList = document.getElementById('fraudList');

    threatsList.innerHTML = '';
    fraudList.innerHTML = '';

    const storedThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
    const storedFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');

    if (storedThreats.length === 0 && storedFraud.length === 0) {
        const sampleThreats = [];
        const sampleFraud = [];

        pazatorData.humans.slice(0, Math.min(3, pazatorData.humans.length)).forEach((human, index) => {
            if (index % 2 === 0) {
                sampleThreats.push({
                    name: human.name,
                    riskLevel: index === 0 ? 'high' : 'medium',
                    evidence: `Suspicious patterns detected for ${human.name}`,
                    reasons: [
                        human.workplace ? `Works at ${human.workplace}` : 'Unknown workplace',
                        human.tags && human.tags.length > 0 ? `Has tags: ${human.tags.join(', ')}` : 'No tags'
                    ]
                });
            } else {
                sampleFraud.push({
                    name: human.name,
                    riskLevel: index === 1 ? 'high' : 'medium',
                    evidence: `Potential fraudulent activity detected for ${human.name}`,
                    reasons: [
                        human.credit !== undefined ? `Credit score: ${human.credit}` : 'No credit score',
                        human.socialClass ? `Social class: ${human.socialClass}` : 'Unknown social class'
                    ]
                });
            }
        });

        localStorage.setItem('previousThreats', JSON.stringify(sampleThreats));
        localStorage.setItem('previousFraud', JSON.stringify(sampleFraud));

        renderFindings(sampleThreats, threatsList);
        renderFindings(sampleFraud, fraudList);
    } else {
        renderFindings(storedThreats, threatsList);
        renderFindings(storedFraud, fraudList);
    }
}

function renderFindings(findings, container) {
    findings.forEach(item => {
        const findingItem = document.createElement('div');
        findingItem.className = 'finding-item';
        findingItem.innerHTML = `
                    <div class="finding-header">
                        <span class="finding-name">${item.name}</span>
                        <span class="finding-risk finding-${item.riskLevel}">${item.riskLevel} ${container.id === 'threatsList' ? 'threat' : 'risk'}</span>
                    </div>
                    <div class="finding-evidence">Evidence: ${item.evidence}</div>
                    <div class="finding-reasons">
                        <strong>Reasons:</strong>
                        <ul>
                            ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;
        container.appendChild(findingItem);
    });
}

function storeFinding(type, finding) {
    const storageKey = type === 'threat' ? 'previousThreats' : 'previousFraud';
    const currentFindings = JSON.parse(localStorage.getItem(storageKey) || '[]');
    currentFindings.push(finding);
    if (currentFindings.length > 10) {
        currentFindings.shift();
    }
    localStorage.setItem(storageKey, JSON.stringify(currentFindings));
}

function storeFraudLogs(logs) {
    const currentLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const newLogs = logs.map(log => ({
        ...log,
        id: `fraud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        status: 'new'
    }));

    currentLogs.push(...newLogs);

    if (currentLogs.length > 50) {
        currentLogs.splice(0, currentLogs.length - 50);
    }

    localStorage.setItem('fraudLogs', JSON.stringify(currentLogs));

    if (document.getElementById('contextFraudLogs')) {
        loadContextFraudLogs();
    }
}

function storeTerroristLogs(logs) {
    const currentLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    const newLogs = logs.map(log => ({
        ...log,
        id: `terrorist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        status: 'new'
    }));

    currentLogs.push(...newLogs);

    if (currentLogs.length > 50) {
        currentLogs.splice(0, currentLogs.length - 50);
    }

    localStorage.setItem('terroristLogs', JSON.stringify(currentLogs));
}

async function getSignedInUsername() {
    try {
        if (typeof puter === 'undefined' || !puter.auth) return '';

        // Prefer explicit getter if available.
        if (typeof puter.auth.getUser === 'function') {
            const user = await puter.auth.getUser();
            const username = user?.username || user?.name || user?.display_name || user?.displayName;
            if (username) return String(username);
        }

        // Common fallback shapes.
        const user = puter.auth.user || puter.user || puter?.auth?.currentUser;
        const username = user?.username || user?.name || user?.display_name || user?.displayName;
        return username ? String(username) : '';
    } catch (e) {
        return '';
    }
}

async function updateAccountSection() {
    const signInBtn = document.getElementById('signInBtn');
    const greeting = document.getElementById('accountGreeting');

    if (!greeting) return;

    const signedIn = Boolean(
        typeof puter !== 'undefined' &&
        puter.auth &&
        typeof puter.auth.isSignedIn === 'function' &&
        puter.auth.isSignedIn()
    );

    if (!signedIn) {
        greeting.style.display = 'none';
        greeting.textContent = '';
        if (signInBtn) signInBtn.style.display = 'block';
        return;
    }

    if (signInBtn) signInBtn.style.display = 'none';
    greeting.style.display = 'block';
    greeting.textContent = 'Welcome back';

    const username = await getSignedInUsername();
    if (username) {
        greeting.textContent = `Good to see you back ${username}.`;
    }
}

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
            setAboutOpen(true);
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

    if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
        saveData(true);
        console.log(' Initial data saved');
    }

    console.log(' Pazator app fully initialized with enhanced data persistence');
    console.log(` Current data: ${pazatorData.humans.length} humans, ${pazatorData.others.length} others`);

} catch (initError) {
    console.error(' Fatal initialization error:', initError);
    pazatorData = { humans: [], others: [] };
    tags = [];
    renderWebNodes();
    renderTags();
    console.log('️ Using fallback initialization');
}

const RECENT_SEARCHES_KEY = 'pazatorRecentSearches';

function loadRecentSearches() {
    try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch (e) {
        return [];
    }
}

function saveRecentSearches(list) {
    try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {
        console.warn('Could not persist recent searches', e);
    }
}

function addRecentSearch(term) {
    const value = String(term || '').trim();
    if (!value) return;

    const existing = loadRecentSearches();
    const lower = value.toLowerCase();
    const next = [value, ...existing.filter(x => String(x).toLowerCase() !== lower)].slice(0, 12);
    saveRecentSearches(next);
}

function clearRecentSearches() {
    saveRecentSearches([]);
    renderRecentSearches();
}

function renderRecentSearches() {
    const container = document.getElementById('recentSearchesContainer');
    if (!container) return;

    const items = loadRecentSearches();
    if (items.length === 0) {
        container.innerHTML = '';
        return;
    }

    const chips = items.map(term => {
        const safeLabel = escapeHtml(term);
        const encoded = encodeURIComponent(term);
        return `
            <button type="button" class="recent-search-item" data-term="${encoded}">
                <i class="fas fa-history"></i>${safeLabel}
            </button>
        `;
    }).join('');

    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 8px;">
            <span style="color: #777; font-size: 0.85rem;">Recent searches</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
            ${chips}
        </div>
    `;

    container.querySelectorAll('.recent-search-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const encoded = btn.getAttribute('data-term') || '';
            let term = encoded;
            try {
                term = decodeURIComponent(encoded);
            } catch (e) {
                term = encoded;
            }
            const input = document.getElementById('universalSearchInput');
            if (input) input.value = term;
            performSearch(term);
        });
    });

    container.querySelector('.recent-search-clear')?.addEventListener('click', clearRecentSearches);
}

function initializeSearch() {
    const searchInput = document.getElementById('universalSearchInput');
    const resultsContainer = document.getElementById('searchResultsContainer');
    const resultsCount = document.getElementById('searchResultsCount');

    if (!searchInput || !resultsContainer) return;

    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(searchInput.value.trim());
        }, 300);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(searchInput.value.trim());
        }
    });
}

function performSearch(query) {
    const resultsContainer = document.getElementById('searchResultsContainer');
    const resultsCount = document.getElementById('searchResultsCount');

    if (!query) {
        renderRecentSearches();
        resultsContainer.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-search search-empty-icon"></i>
                <p class="search-empty-title">Start typing to search</p>
                <p class="search-empty-hint">Results will appear here</p>
            </div>
        `;
        if (resultsCount) resultsCount.textContent = '';
        return;
    }

    addRecentSearch(query);
    renderRecentSearches();

    const searchNames = document.getElementById('searchNames')?.checked ?? true;
    const searchJobs = document.getElementById('searchJobs')?.checked ?? true;
    const searchDates = document.getElementById('searchDates')?.checked ?? true;
    const searchNotes = document.getElementById('searchNotes')?.checked ?? true;
    const searchTags = document.getElementById('searchTags')?.checked ?? true;
    const searchRelationships = document.getElementById('searchRelationships')?.checked ?? true;

    const results = [];
    const queryLower = query.toLowerCase();

    pazatorData.humans.forEach(person => {
        const matches = [];

        if (person.id && String(person.id).toLowerCase().includes(queryLower)) {
            matches.push({ field: 'ID', value: String(person.id) });
        }

        if (searchNames && person.name && person.name.toLowerCase().includes(queryLower)) {
            matches.push({ field: 'Name', value: person.name });
        }

        if (searchJobs && person.workplace && person.workplace.toLowerCase().includes(queryLower)) {
            matches.push({ field: 'Workplace', value: person.workplace });
        }

        if (searchDates) {
            if (person.birthDate && person.birthDate.toLowerCase().includes(queryLower)) {
                matches.push({ field: 'Birth Date', value: person.birthDate });
            }
        }

        if (searchNotes && person.extraNotes && person.extraNotes.toLowerCase().includes(queryLower)) {
            matches.push({ field: 'Notes', value: person.extraNotes.substring(0, 100) + (person.extraNotes.length > 100 ? '...' : '') });
        }

        if (searchTags && person.tags && person.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
            const matchingTags = person.tags.filter(tag => tag.toLowerCase().includes(queryLower));
            matches.push({ field: 'Tags', value: matchingTags.join(', ') });
        }

        if (searchRelationships) {
            if (person.friends && person.friends.some(friendId => {
                const friend = pazatorData.humans.find(h => h.id === friendId);
                return friend && friend.name.toLowerCase().includes(queryLower);
            })) {
                const matchingFriends = person.friends
                    .map(id => pazatorData.humans.find(h => h.id === id)?.name)
                    .filter(name => name && name.toLowerCase().includes(queryLower));
                if (matchingFriends.length > 0) {
                    matches.push({ field: 'Friends', value: matchingFriends.join(', ') });
                }
            }

            if (person.family && person.family.some(familyId => {
                const familyMember = pazatorData.humans.find(h => h.id === familyId);
                return familyMember && familyMember.name.toLowerCase().includes(queryLower);
            })) {
                const matchingFamily = person.family
                    .map(id => pazatorData.humans.find(h => h.id === id)?.name)
                    .filter(name => name && name.toLowerCase().includes(queryLower));
                if (matchingFamily.length > 0) {
                    matches.push({ field: 'Family', value: matchingFamily.join(', ') });
                }
            }
        }

        if (matches.length > 0) {
            results.push({
                type: 'human',
                data: person,
                matches: matches
            });
        }
    });

    pazatorData.others.forEach(item => {
        const matches = [];

        if (item.id && String(item.id).toLowerCase().includes(queryLower)) {
            matches.push({ field: 'ID', value: String(item.id) });
        }

        if (searchNames && item.name && item.name.toLowerCase().includes(queryLower)) {
            matches.push({ field: 'Name', value: item.name });
        }

        const otherNotes = (item.note || item.extraNotes || '').toLowerCase();
        if (searchNotes && otherNotes.includes(queryLower)) {
            const originalNote = item.note || item.extraNotes || '';
            matches.push({ field: 'Notes', value: originalNote.substring(0, 100) + (originalNote.length > 100 ? '...' : '') });
        }

        if (searchTags && item.tags && item.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
            const matchingTags = item.tags.filter(tag => tag.toLowerCase().includes(queryLower));
            matches.push({ field: 'Tags', value: matchingTags.join(', ') });
        }

        if (matches.length > 0) {
            results.push({
                type: 'other',
                data: item,
                matches: matches
            });
        }
    });

    displaySearchResults(results, query);
    if (resultsCount) resultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
}

function displaySearchResults(results, query) {
    const resultsContainer = document.getElementById('searchResultsContainer');

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-frown search-empty-icon"></i>
                <p class="search-empty-title">No results found for "${query}"</p>
                <p class="search-empty-hint">Try different keywords</p>
            </div>
        `;
        return;
    }

    let html = '<div class="search-results-grid">';

    results.forEach((result, index) => {
        const item = result.data;
        const isHuman = result.type === 'human';

        html += `
            <div class="search-result-card" onclick="openDetailView('${item.id}', '${result.type}')">
                <div class="search-result-header">
                    <h3 class="search-result-name">[${item.id}] ${item.name}</h3>
                    <span class="search-result-type">${isHuman ? 'PERSON' : 'COMPANY'}</span>
                </div>
                
                <div class="search-result-meta">
                    ${isHuman && item.workplace ? `
                        <div class="search-result-meta-item">
                            <i class="fas fa-building"></i>
                            <span>${item.workplace}</span>
                        </div>
                    ` : ''}
                    ${isHuman && item.birthDate ? `
                        <div class="search-result-meta-item">
                            <i class="fas fa-calendar"></i>
                            <span>${item.birthDate}</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="search-result-matches">
                    <div class="search-result-matches-title">Matches Found</div>
                    ${result.matches.slice(0, 3).map(match => `
                        <div class="search-result-match">
                            <div class="search-result-match-field">${match.field}</div>
                            <div class="search-result-match-value">${match.value}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${item.tags && item.tags.length > 0 ? `
                    <div class="search-result-tags">
                        ${item.tags.slice(0, 5).map(tag => `
                            <span class="search-result-tag">${tag}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    html += '</div>';
    resultsContainer.innerHTML = html;
}


function initSearchTab() {
    if (!searchTabInitialized) {
        initializeSearch();
        searchTabInitialized = true;
    }
    renderRecentSearches();
}

function initArticlesTab() {
    if (!articlesTabInitialized) {
        const saveBtn = document.getElementById('saveArticleBtn');
        const toggleBtn = document.getElementById('toggleAddArticle');
        const closeBtn = document.getElementById('closeAddPanel');
        const clearBtn = document.getElementById('clearArticleBtn');
        const searchInput = document.getElementById('articleSearch');
        const filterSelect = document.getElementById('articleFilter');

        if (saveBtn) saveBtn.addEventListener('click', saveArticle);
        if (toggleBtn) toggleBtn.addEventListener('click', toggleAddPanel);
        if (closeBtn) closeBtn.addEventListener('click', hideAddPanel);
        if (clearBtn) clearBtn.addEventListener('click', clearArticleForm);
        if (searchInput) searchInput.addEventListener('input', filterArticles);
        if (filterSelect) filterSelect.addEventListener('change', filterArticles);

        articlesTabInitialized = true;
    }

    renderArticlesList();
}

function toggleAddPanel() {
    const panel = document.getElementById('addArticlePanel');
    if (panel.style.display === 'flex') {
        hideAddPanel();
    } else {
        showAddPanel();
    }
}

function showAddPanel() {
    const panel = document.getElementById('addArticlePanel');
    panel.style.display = 'flex';
    setTimeout(() => {
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
    }, 10);
}

function hideAddPanel() {
    const panel = document.getElementById('addArticlePanel');
    panel.style.transform = 'translateX(20px)';
    panel.style.opacity = '0';
    setTimeout(() => {
        panel.style.display = 'none';
    }, 300);
}

function clearArticleForm() {
    document.getElementById('articleCompany').value = '';
    document.getElementById('articleTitle').value = '';
    document.getElementById('articleContent').value = '';
}

function filterArticles() {
    const searchTerm = document.getElementById('articleSearch').value.toLowerCase();
    const filter = document.getElementById('articleFilter').value;
    const articles = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');

    let filteredArticles = [...articles];

    if (filter === 'recent') {
        filteredArticles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        filteredArticles = filteredArticles.slice(0, 10);
    }

    if (searchTerm) {
        filteredArticles = filteredArticles.filter(article =>
            article.title.toLowerCase().includes(searchTerm) ||
            article.company.toLowerCase().includes(searchTerm) ||
            article.content.toLowerCase().includes(searchTerm)
        );
    }

    renderFilteredArticles(filteredArticles);
}

function saveArticle() {
    const company = document.getElementById('articleCompany').value.trim();
    const title = document.getElementById('articleTitle').value.trim();
    const content = document.getElementById('articleContent').value.trim();

    if (!company || !title || !content) {
        showAlert('Please fill in all fields', 'Notice', 'warning');
        return;
    }

    const articles = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');

    const newArticle = {
        id: Date.now(),
        company: company,
        title: title,
        content: content,
        timestamp: new Date()
    };

    articles.push(newArticle);
    localStorage.setItem('knowledgeBase', JSON.stringify(articles));


    clearArticleForm();
    hideAddPanel();

    renderArticlesList();


    showFloatingNotification('Document saved successfully!', 'success');
}

function showFloatingNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 7px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                transform: translateX(100%);
                transition: transform 0.3s ease;
                ${type === 'success' ? 'background: linear-gradient(145deg, #2ecc71, #27ae60);' : 'background: linear-gradient(145deg, #3498db, #2980b9);'}
            `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function renderArticlesList() {
    const articles = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
    const countElement = document.getElementById('articlesCount');

    countElement.textContent = `${articles.length} document${articles.length !== 1 ? 's' : ''}`;
    renderFilteredArticles(articles);
}

function renderFilteredArticles(articles) {
    const container = document.getElementById('articlesList');

    if (articles.length === 0) {
        const searchTerm = document.getElementById('articleSearch').value;
        const message = searchTerm ? 'No matching documents found' : 'No documents in repository';

        container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #777; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                        <i class="fas fa-file-alt" style="font-size: 4rem; margin-bottom: 25px; color: #333;"></i>
                        <h3 style="margin: 0 0 15px 0; color: #999; font-size: 1.4rem;">${message}</h3>
                        <p style="margin: 0; font-size: 1.1rem; color: #666; max-width: 400px; margin: 0 auto;">
                            ${searchTerm ? 'Try adjusting your search terms' : 'Click "Add Document" to begin building your knowledge base'}
                        </p>
                    </div>
                `;
        return;
    }

    container.innerHTML = articles.map(article => `
                <div style="background: rgba(40, 40, 40, 0.8); border: 1px solid #444; border-radius: 12px; padding: 20px; transition: all 0.2s ease; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                <i class="fas fa-file-alt" style="color: #4d9de0; font-size: 1.2rem;"></i>
                                <h3 style="margin: 0; color: #ffffff; font-size: 1.2rem;">${article.title}</h3>
                            </div>
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                                <span style="background: rgba(107, 207, 127, 0.2); color: #6bcf7f; padding: 4px 12px; border-radius: 15px; font-size: 0.85rem; font-weight: 500;">
                                    ${article.company}
                                </span>
                                <span style="color: #888; font-size: 0.85rem;">
                                    <i class="fas fa-calendar" style="margin-right: 5px;"></i>
                                    ${new Date(article.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="viewFullArticle(${article.id})" class="btn btn-secondary" style="padding: 8px 12px; font-size: 0.85rem; background: rgba(60, 60, 60, 0.7); border: 1px solid #555; border-radius: 8px;">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="deleteArticle(${article.id})" class="btn btn-danger" style="padding: 8px 12px; font-size: 0.85rem; background: linear-gradient(145deg, #ff4757, #cc3747); border: 1px solid #ff6b6b; border-radius: 8px;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div style="margin-top: 15px; padding: 15px; background: rgba(255, 255, 255, 0.03); border-radius: 10px; border-left: 3px solid #4d9de0; max-height: 120px; overflow-y: auto;">
                        <div style="color: #ccc; line-height: 1.5; font-size: 0.9rem;">
                            ${article.content.substring(0, 250)}${article.content.length > 250 ? '...' : ''}
                        </div>
                    </div>
                    
                    ${article.content.length > 250 ? `
                        <div style="margin-top: 12px; text-align: right;">
                            <span style="color: #777; font-size: 0.85rem;">
                                ${article.content.length} characters
                            </span>
                        </div>
                    ` : ''}
                </div>
            `).join('');
}

async function deleteArticle(articleId) {
    const confirmed = await showConfirm('Are you sure you want to delete this article?', 'Confirm Deletion', 'warning');
    if (confirmed) {
        const articles = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
        const filteredArticles = articles.filter(a => a.id !== articleId);
        localStorage.setItem('knowledgeBase', JSON.stringify(filteredArticles));
        renderArticlesList();
    }
}

function viewFullArticle(articleId) {
    const articles = JSON.parse(localStorage.getItem('knowledgeBase') || '[]');
    const article = articles.find(a => a.id === articleId);

    if (!article) return;


    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1000';

    modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0; font-family: 'AllianceNo2', 'Segoe UI', system-ui, -apple-system, sans-serif;">${article.title}</h2>
                        <button class="close" onclick="this.closest('.modal').remove()" style="background: none; border: none; color: #ddd; font-size: 1.8rem; cursor: pointer;">&times;</button>
                    </div>
                    
                    <div style="padding: 20px 0; flex: 1; overflow-y: auto;">
                        <div style="margin-bottom: 20px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 10px; border-left: 4px solid #6bcf7f;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="color: #6bcf7f; font-size: 1.1rem; font-weight: 500;">${article.company}</div>
                                <div style="color: #888; font-size: 0.9rem;">Added: ${new Date(article.timestamp).toLocaleDateString()}</div>
                            </div>
                        </div>
                        
                        <div style="color: #ddd; line-height: 1.7; font-size: 1rem; white-space: pre-wrap;">
                            ${article.content}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; padding-top: 20px; border-top: 1px solid #333;">
                        <button onclick="deleteArticle(${article.id}); this.closest('.modal').remove()" class="btn btn-danger" style="padding: 12px 20px; flex: 1;">
                            <i class="fas fa-trash" style="margin-right: 8px;"></i>Delete Article
                        </button>
                        <button onclick="this.closest('.modal').remove()" class="btn btn-secondary" style="padding: 12px 20px; flex: 1;">
                            Close
                        </button>
                    </div>
                </div>
            `;

    document.body.appendChild(modal);
}

let activeAgents = [];

function initAgentsTab() {
    if (!agentsTabInitialized) {
        const createBtn = document.getElementById('createAgentBtn');
        if (createBtn) {
            createBtn.addEventListener('click', createNewAgent);
        }
        agentsTabInitialized = true;
    }

    renderAgentsList();
}

function createNewAgent() {
    const name = document.getElementById('agentName').value.trim();
    const goal = document.getElementById('agentGoal').value.trim();

    if (!name || !goal) {
        showAlert('Please enter both agent name and goal', 'Notice', 'warning');
        return;
    }

    if (activeAgents.length >= 3) {
        showAlert('Maximum 3 agents allowed. Please stop an existing agent first.', 'Limit Reached', 'warning');
        return;
    }

    const agent = {
        id: Date.now(),
        name: name,
        goal: goal,
        startTime: new Date(),
        logs: [],
        status: 'running',
        thoughts: [],
        commandsUsed: []
    };

    activeAgents.push(agent);
    document.getElementById('agentName').value = '';
    document.getElementById('agentGoal').value = '';

    renderAgentsList();
    startAgent(agent.id);
}

async function startAgent(agentId) {
    const agent = activeAgents.find(a => a.id === agentId);
    if (!agent) return;

    if (pazatorData.humans.length === 0) {
        agent.thoughts.push({
            timestamp: new Date(),
            message: 'No people in database. Cannot start investigation.'
        });
        agent.status = 'completed';
        renderAgentsList();
        showAlert('No people in database. Add some data first.', 'Notice', 'warning');
        return;
    }

    const personNames = pazatorData.humans.map(h => h.name);

    const systemPrompt = `
You are "${agent.name}", an autonomous AI investigator.

GOAL: ${agent.goal}

DATABASE CONTEXT:
- You have access to a database of ${pazatorData.humans.length} people
- Each person has: name, workplace, birthDate, tags, friends, family, notes
- You MUST use GET_PERSON_INFO to find information about specific people

AVAILABLE COMMANDS (respond ONLY with these JSON formats):
1. GET_PERSON_INFO: {"command": "GET_PERSON_INFO", "person": "Exact person name"}
   - Use this to get detailed info about anyone in the database
   - Example: {"command": "GET_PERSON_INFO", "person": "John Smith"}
   
2. LOG_FINDING: {"command": "LOG_FINDING", "message": "What you discovered"}
   - Use this to record important findings
   
3. MISSION_COMPLETE: {"command": "MISSION_COMPLETE", "reason": "Summary of what you accomplished"}
   - Use when your goal is achieved

PEOPLE IN DATABASE: ${personNames.slice(0, 50).join(', ')}${personNames.length > 50 ? '...' : ''}

RULES:
- Always use GET_PERSON_INFO first to gather facts about people
- Search by exact name matches - be precise
- If a person doesn't exist, try variations of their name
- Once you have enough information, declare MISSION_COMPLETE
- Be concise - don't overthink, act systematically

Example response format:
THINKING: I need to find information about this person first.
ACTION: {"command": "GET_PERSON_INFO", "person": "Person Name"}
`;

    agent.thoughts.push({
        timestamp: new Date(),
        message: `Agent ${agent.name} activated with goal: ${agent.goal}`
    });

    renderAgentDetail(agent.id);
    await runAgentCycle(agent.id, systemPrompt);
}

async function runAgentCycle(agentId, systemPrompt) {
    const agent = activeAgents.find(a => a.id === agentId);
    if (!agent || agent.status !== 'running') return;

    try {
        const recentThoughts = agent.thoughts.slice(-3).map(t =>
            `[${t.timestamp.toLocaleTimeString()}] ${t.message}`
        ).join('\n');

        const userPrompt = `
Continue investigating. 

Recent activity:
${recentThoughts}

Respond with:
THINKING: Your immediate analysis
ACTION: {"command": "...", "person": "Name"} or {"command": "...", "message": "..."} or {"command": "MISSION_COMPLETE", "reason": "..."}

If you don't have enough info, use GET_PERSON_INFO to look up people.
`;

        const aiResponse = await puter.ai.chat([
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ]);

        let responseText = '';
        if (typeof aiResponse === 'string') {
            responseText = aiResponse;
        } else if (aiResponse && typeof aiResponse === 'object') {
            responseText = aiResponse.content || JSON.stringify(aiResponse);
        } else {
            responseText = String(aiResponse || 'No response');
        }
        
        agent.thoughts.push({
            timestamp: new Date(),
            message: responseText
        });

        const command = parseAgentCommand(responseText);
        if (command && command.command) {
            await executeAgentCommand(agentId, command);
        } else {
            agent.thoughts.push({
                timestamp: new Date(),
                message: 'No valid command found in response. Will retry...'
            });
        }

        renderAgentDetail(agentId);

        if (agent.status === 'running') {
            setTimeout(() => runAgentCycle(agentId, systemPrompt), 3000);
        }

    } catch (error) {
        console.error('Agent error:', error);
        agent.thoughts.push({
            timestamp: new Date(),
            message: `Error occurred: ${error.message}`
        });
        renderAgentDetail(agentId);
    }
}

function parseAgentCommand(response) {
    if (!response || typeof response !== 'string') {
        console.error('Invalid response type:', typeof response);
        return null;
    }
    
    const actionMatch = response.match(/ACTION:\s*(\{[^}]+\})/i);
    if (actionMatch) {
        try {
            return JSON.parse(actionMatch[1]);
        } catch (e) {
            console.error('Failed to parse command:', actionMatch[1]);
        }
    }
    return null;
}

async function executeAgentCommand(agentId, command) {
    const agent = activeAgents.find(a => a.id === agentId);
    if (!agent) return;

    agent.commandsUsed.push({
        timestamp: new Date(),
        command: command.command,
        parameters: command
    });

    switch (command.command) {
        case 'GET_PERSON_INFO':
            const person = pazatorData.humans.find(h =>
                h.name.toLowerCase() === command.person.toLowerCase()
            );
            if (person) {
                const info = {
                    name: person.name,
                    workplace: person.workplace,
                    birthDate: person.birthDate,
                    tags: person.tags,
                    friends: person.friends?.map(id =>
                        pazatorData.humans.find(h => h.id === id)?.name
                    ).filter(Boolean),
                    family: person.family?.map(id =>
                        pazatorData.humans.find(h => h.id === id)?.name
                    ).filter(Boolean),
                    notes: person.extraNotes
                };
                agent.thoughts.push({
                    timestamp: new Date(),
                    message: `Retrieved info for ${person.name}: ${JSON.stringify(info, null, 2)}`
                });
            } else {
                agent.thoughts.push({
                    timestamp: new Date(),
                    message: `Person not found: ${command.person}`
                });
            }
            break;

        case 'LOG_FINDING':
            agent.logs.push({
                timestamp: new Date(),
                message: command.message
            });
            agent.thoughts.push({
                timestamp: new Date(),
                message: `Logged finding: ${command.message}`
            });
            break;

        case 'MISSION_COMPLETE':
            agent.status = 'completed';
            agent.thoughts.push({
                timestamp: new Date(),
                message: `Mission completed: ${command.reason}`
            });
            showAlert(`Agent ${agent.name} has completed its mission!\nReason: ${command.reason}`, 'Agent Complete', 'success');
            break;
    }
}

function stopAgent(agentId) {
    const agent = activeAgents.find(a => a.id === agentId);
    if (agent) {
        agent.status = 'stopped';
        agent.thoughts.push({
            timestamp: new Date(),
            message: 'Agent manually stopped by user'
        });
        renderAgentsList();
    }
}

async function deleteAgent(agentId) {
    const confirmed = await showConfirm('Are you sure you want to delete this agent?', 'Confirm Deletion', 'warning');
    if (confirmed) {
        activeAgents = activeAgents.filter(a => a.id !== agentId);
        renderAgentsList();
    }
}

function renderAgentsList() {
    const container = document.getElementById('agentsList');
    const countElement = document.getElementById('agentCount');

    countElement.textContent = `${activeAgents.length}/3`;

    if (activeAgents.length === 0) {
        container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #777;">
                        <i class="fas fa-robot" style="font-size: 3rem; margin-bottom: 20px; color: #444;"></i>
                        <p style="margin: 0; font-size: 1.2rem;">No active agents</p>
                        <p style="margin: 10px 0 0 0; font-size: 0.9rem; color: #666;">Create an agent to get started</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = activeAgents.map(agent => {
        const duration = Math.floor((new Date() - agent.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        return `
                    <div style="background: rgba(40, 40, 40, 0.8); border: 1px solid #444; border-radius: 12px; padding: 20px; transition: all 0.2s ease;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <div>
                                <h3 style="margin: 0 0 8px 0; color: #ffffff; font-size: 1.3rem;">${agent.name}</h3>
                                <p style="margin: 0; color: #aaa; font-size: 0.95rem;">${agent.goal}</p>
                            </div>
                            <div style="text-align: right;">
                                <span style="background: ${agent.status === 'running' ? '#6bcf7f' : agent.status === 'completed' ? '#4d9de0' : '#ff6b6b'}; 
                                      color: white; padding: 4px 12px; border-radius: 15px; font-size: 0.8rem; font-weight: 500;">
                                    ${agent.status.toUpperCase()}
                                </span>
                                <div style="margin-top: 8px; color: #888; font-size: 0.85rem;">
                                    ${minutes}m ${seconds}s
                                </div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button onclick="renderAgentDetail(${agent.id})" class="btn btn-secondary" style="flex: 1; padding: 10px; font-size: 0.9rem;">
                                <i class="fas fa-eye" style="margin-right: 6px;"></i>View Details
                            </button>
                            ${agent.status === 'running' ? `
                                <button onclick="stopAgent(${agent.id})" class="btn btn-danger" style="padding: 10px 15px; font-size: 0.9rem;">
                                    <i class="fas fa-stop"></i>
                                </button>
                            ` : ''}
                            <button onclick="deleteAgent(${agent.id})" class="btn btn-danger" style="padding: 10px 15px; font-size: 0.9rem;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
    }).join('');
}

function renderAgentDetail(agentId) {
    const agent = activeAgents.find(a => a.id === agentId);
    if (!agent) return;

    const existing = document.getElementById('agentDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'agentDetailModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1000';

    const duration = Math.floor((new Date() - agent.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    modal.innerHTML = `
                <div class="modal-content" style="max-width: 900px; width: 95%; max-height: 90vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0; font-family: 'AllianceNo2', 'Segoe UI', system-ui, -apple-system, sans-serif;">${agent.name}</h2>
                        <button class="close" onclick="this.closest('.modal').remove()" style="background: none; border: none; color: #ddd; font-size: 1.8rem; cursor: pointer;">&times;</button>
                    </div>
                    
                    <div style="display: flex; gap: 20px; flex: 1; overflow: hidden; padding: 20px 0;">
                        <!-- Left Panel - Agent Thoughts -->
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 15px;">
                            <h3 style="margin: 0; color: #ffffff; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-brain" style="color: #6bcf7f;"></i>
                                Agent Activity
                                <span style="margin-left: auto; background: #444; color: #ddd; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem;">${minutes}m ${seconds}s</span>
                            </h3>
                            
                            <div id="agentDetailThoughts" style="flex: 1; overflow-y: auto; background: rgba(20, 20, 20, 0.5); border-radius: 10px; padding: 15px;">
                                ${agent.thoughts.map(thought => `
                                    <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #333;">
                                        <div style="color: #888; font-size: 0.8rem; margin-bottom: 5px;">${thought.timestamp.toLocaleTimeString()}</div>
                                        <div style="color: #ddd; line-height: 1.5; white-space: pre-wrap;">${thought.message}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- Right Panel - Logs and Commands -->
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 15px;">
                            <h3 style="margin: 0; color: #ffffff; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-clipboard-list" style="color: #ffd93d;"></i>
                                Investigation Logs
                            </h3>
                            
                            <div style="flex: 1; overflow-y: auto; background: rgba(20, 20, 20, 0.5); border-radius: 10px; padding: 15px; margin-bottom: 15px;">
                                ${agent.logs.length > 0 ? agent.logs.map(log => `
                                    <div style="margin-bottom: 12px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #ffd93d;">
                                        <div style="color: #888; font-size: 0.8rem; margin-bottom: 5px;">${log.timestamp.toLocaleTimeString()}</div>
                                        <div style="color: #ddd;">${log.message}</div>
                                    </div>
                                `).join('') : `
                                    <div style="text-align: center; padding: 30px; color: #777;">
                                        <i class="fas fa-clipboard" style="font-size: 2rem; margin-bottom: 15px; color: #444;"></i>
                                        <p style="margin: 0;">No logs recorded yet</p>
                                    </div>
                                `}
                            </div>
                            
                            <h3 style="margin: 0; color: #ffffff; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-terminal" style="color: #ff6b6b;"></i>
                                Commands Used
                            </h3>
                            
                            <div style="flex: 1; overflow-y: auto; background: rgba(20, 20, 20, 0.5); border-radius: 10px; padding: 15px;">
                                ${agent.commandsUsed.length > 0 ? agent.commandsUsed.map(cmd => `
                                    <div style="margin-bottom: 12px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border-left: 3px solid #ff6b6b;">
                                        <div style="color: #888; font-size: 0.8rem; margin-bottom: 5px;">${cmd.timestamp.toLocaleTimeString()}</div>
                                        <div style="color: #ddd; font-weight: 500; margin-bottom: 5px;">${cmd.command}</div>
                                        <div style="color: #aaa; font-size: 0.9rem;">${JSON.stringify(cmd.parameters, null, 2)}</div>
                                    </div>
                                `).join('') : `
                                    <div style="text-align: center; padding: 30px; color: #777;">
                                        <i class="fas fa-terminal" style="font-size: 2rem; margin-bottom: 15px; color: #444;"></i>
                                        <p style="margin: 0;">No commands executed yet</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; padding-top: 20px; border-top: 1px solid #333;">
                        <button onclick="this.closest('.modal').remove()" class="btn btn-secondary" style="flex: 1; padding: 12px;">
                            Close
                        </button>
                        ${agent.status === 'running' ? `
                            <button onclick="stopAgent(${agent.id}); this.closest('.modal').remove()" class="btn btn-danger" style="padding: 12px 20px;">
                                Stop Agent
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;

    document.body.appendChild(modal);

    const thoughtsContainer = modal.querySelector('#agentDetailThoughts');
    if (thoughtsContainer) {
        setTimeout(() => {
            thoughtsContainer.scrollTop = thoughtsContainer.scrollHeight;
        }, 100);
    }
}

// Case Files Functions
function initCasesTab() {
    if (!casesTabInitialized) {
        const newCaseBtn = document.getElementById('newCaseBtn');
        const statusFilter = document.getElementById('caseStatusFilter');
        const editBtn = document.getElementById('caseEditBtn');
        const closeBtn = document.getElementById('caseCloseBtn');
        const addEntityBtn = document.getElementById('addEntityToCaseBtn');
        const addNoteBtn = document.getElementById('caseAddNoteBtn');
        const noteInput = document.getElementById('caseNoteInput');
        const zorBtn = document.getElementById('caseZorBtn');

        if (newCaseBtn) newCaseBtn.addEventListener('click', showNewCaseModal);
        if (statusFilter) statusFilter.addEventListener('change', renderCasesList);
        if (editBtn) editBtn.addEventListener('click', showEditCaseModal);
        if (closeBtn) closeBtn.addEventListener('click', toggleCaseStatus);
        if (addEntityBtn) addEntityBtn.addEventListener('click', showEntityPickerModal);
        if (addNoteBtn) addNoteBtn.addEventListener('click', addCaseNote);
        if (noteInput) noteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addCaseNote();
        });
        if (zorBtn) zorBtn.addEventListener('click', handoffCaseToZor);

        casesTabInitialized = true;
    }

    loadCases();
    renderCasesList();
}

function loadCases() {
    try {
        const saved = localStorage.getItem('pazatorCases');
        cases = saved ? JSON.parse(saved) : [];
    } catch {
        cases = [];
    }
}

function saveCases() {
    localStorage.setItem('pazatorCases', JSON.stringify(cases));
}

function renderCasesList() {
    const container = document.getElementById('casesList');
    const filter = document.getElementById('caseStatusFilter')?.value || 'all';

    const filteredCases = filter === 'all' 
        ? cases 
        : cases.filter(c => c.status === filter);

    if (filteredCases.length === 0) {
        container.innerHTML = `
            <div class="cases-empty">
                <i class="fas fa-folder-open"></i>
                <p>${filter === 'all' ? 'No cases yet' : 'No ' + filter.replace('-', ' ') + ' cases'}</p>
                <small>Create a case to track operations</small>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredCases.map(c => `
        <div class="case-card ${selectedCaseId === c.id ? 'active' : ''}" onclick="selectCase('${c.id}')">
            <div class="case-card-header">
                <span class="case-card-title">${escapeHtml(c.title)}</span>
                <span class="case-card-badge ${c.status}">${c.status.replace('-', ' ')}</span>
            </div>
            <div class="case-card-meta">
                ${c.entities.length} entity ${c.entities.length === 1 ? 'tagged' : 'tagged'} • ${c.timeline.length} activity
            </div>
        </div>
    `).join('');
}

function selectCase(caseId) {
    selectedCaseId = caseId;
    renderCasesList();

    const welcome = document.getElementById('casesWelcome');
    const detail = document.getElementById('casesDetail');

    welcome.style.display = 'none';
    detail.style.display = 'flex';

    const caseData = cases.find(c => c.id === caseId);
    if (!caseData) return;

    document.getElementById('caseTitle').textContent = caseData.title;
    
    const statusBadge = document.getElementById('caseStatusBadge');
    statusBadge.textContent = caseData.status.replace('-', ' ');
    statusBadge.className = 'case-status-badge ' + caseData.status;

    const createdAt = document.getElementById('caseCreatedAt');
    createdAt.textContent = 'Created ' + new Date(caseData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const statusText = document.getElementById('caseStatusText');
    statusText.textContent = caseData.status.replace('-', ' ');

    document.getElementById('caseEntityCount').textContent = caseData.entities.length;
    document.getElementById('caseActivityCount').textContent = caseData.timeline.length;

    document.getElementById('caseDescription').textContent = caseData.description || 'No description provided';

    renderCaseEntities(caseData);
    renderCaseTimeline(caseData);
}

function renderCaseEntities(caseData) {
    const container = document.getElementById('caseEntitiesList');

    if (caseData.entities.length === 0) {
        container.innerHTML = '<span class="case-empty-entities">No entities tracked yet</span>';
        return;
    }

    container.innerHTML = caseData.entities.map(entityId => {
        const human = pazatorData.humans.find(h => h.id === entityId);
        const other = pazatorData.others.find(o => o.id === entityId);
        const entity = human || other;

        if (!entity) return '';

        const icon = human ? 'fa-user' : 'fa-building';
        const typeLabel = human ? 'human' : 'other';
        
        return `
            <div class="case-entity-card" onclick="viewDetailFromCase('${entityId}', '${typeLabel}')">
                <i class="fas ${icon}"></i>
                <span>${escapeHtml(entity.name)}</span>
                <i class="fas fa-external-link-alt remove-entity" onclick="event.stopPropagation(); removeEntityFromCase('${caseId}', '${entityId}')"></i>
            </div>
        `;
    }).join('');
}

function renderCaseTimeline(caseData) {
    const container = document.getElementById('caseTimeline');

    if (caseData.timeline.length === 0) {
        container.innerHTML = '<div class="case-empty-timeline">No activity logged yet</div>';
        return;
    }

    container.innerHTML = [...caseData.timeline].reverse().map(item => `
        <div class="case-timeline-item ${item.type}">
            <span class="case-timeline-time">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="case-timeline-content">${item.content}</span>
        </div>
    `).join('');
}

async function handoffCaseToZor() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const zorBtn = document.getElementById('caseZorBtn');
    zorBtn.disabled = true;
    zorBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    caseData.timeline.push({
        type: 'note',
        content: '<strong>Zor analyzing case...</strong>',
        timestamp: Date.now()
    });
    saveCases();
    selectCase(selectedCaseId);

    const caseEntities = caseData.entities.map(id => {
        const human = pazatorData.humans.find(h => h.id === id);
        const other = pazatorData.others.find(o => o.id === id);
        return human || other;
    }).filter(Boolean);

    const analysisPrompt = `
You are analyzing case: "${caseData.title}"

Description: ${caseData.description || 'No description provided'}

Entities in this case:
${caseEntities.map(e => `- ${e.name} (${e.type || 'unknown'})${e.extraNotes ? ': ' + e.extraNotes : ''}${e.tags?.length ? ' [Tags: ' + e.tags.join(', ') + ']' : ''}`).join('\n')}

Previous activity:
${caseData.timeline.map(t => `- [${new Date(t.timestamp).toLocaleString()}] ${t.content.replace(/<[^>]*>/g, '')}`).join('\n')}

Based on all this information, provide a brief analysis (2-3 sentences) of:
1. What this case appears to be about
2. Any notable patterns or connections you see
3. Recommended next steps

Be concise and actionable.
`;

    try {
        const aiResponse = await puter.ai.chat([
            { role: "system", content: "You are Zor, a concise intelligence analyst. Give brief, actionable insights." },
            { role: "user", content: analysisPrompt }
        ]);

        const analysis = aiResponse.content || 'Analysis complete - no insights generated.';

        caseData.timeline.push({
            type: 'note',
            content: `<strong>Zor Analysis</strong>: ${escapeHtml(analysis)}`,
            timestamp: Date.now()
        });

        zorBtn.disabled = false;
        zorBtn.innerHTML = '<i class="fas fa-robot"></i> Hand off to Zor';
        
        saveCases();
        selectCase(selectedCaseId);
        showFloatingNotification('Zor analysis complete', 'success');

    } catch (error) {
        caseData.timeline.push({
            type: 'note',
            content: `<strong>Zor Error</strong>: Analysis failed`,
            timestamp: Date.now()
        });
        
        zorBtn.disabled = false;
        zorBtn.innerHTML = '<i class="fas fa-robot"></i> Hand off to Zor';
        
        saveCases();
        selectCase(selectedCaseId);
        showFloatingNotification('Zor analysis failed', 'error');
    }
}

function showNewCaseModal() {
    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>New Case</h2>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Case Title</label>
                    <input type="text" id="caseTitleInput" class="form-control" placeholder="Operation name...">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="caseDescInput" class="form-control" rows="3" placeholder="What is this case about?"></textarea>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="caseStatusInput" class="form-control">
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="createNewCase()">Create Case</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
    document.getElementById('caseTitleInput').focus();
}

function createNewCase() {
    const title = document.getElementById('caseTitleInput').value.trim();
    const description = document.getElementById('caseDescInput').value.trim();
    const status = document.getElementById('caseStatusInput').value;

    if (!title) {
        showFloatingNotification('Case title is required', 'error');
        return;
    }

    const newCase = {
        id: 'case_' + Date.now(),
        title,
        description,
        status,
        entities: [],
        timeline: [{
            type: 'note',
            content: '<strong>Case created</strong>',
            timestamp: Date.now()
        }],
        createdAt: Date.now()
    };

    cases.push(newCase);
    saveCases();
    
    document.querySelector('.case-modal')?.remove();
    
    renderCasesList();
    selectCase(newCase.id);
    showFloatingNotification('Case created successfully', 'success');
}

function showEditCaseModal() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Case</h2>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Case Title</label>
                    <input type="text" id="caseTitleInput" class="form-control" value="${escapeHtml(caseData.title)}">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="caseDescInput" class="form-control" rows="3">${escapeHtml(caseData.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="caseStatusInput" class="form-control">
                        <option value="open" ${caseData.status === 'open' ? 'selected' : ''}>Open</option>
                        <option value="in-progress" ${caseData.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                        <option value="closed" ${caseData.status === 'closed' ? 'selected' : ''}>Closed</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-danger" onclick="deleteCase()">Delete Case</button>
                <div style="flex: 1;"></div>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveCaseEdits()">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
}

function saveCaseEdits() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const title = document.getElementById('caseTitleInput').value.trim();
    const description = document.getElementById('caseDescInput').value.trim();
    const status = document.getElementById('caseStatusInput').value;

    if (!title) {
        showFloatingNotification('Case title is required', 'error');
        return;
    }

    const oldStatus = caseData.status;
    
    caseData.title = title;
    caseData.description = description;
    caseData.status = status;

    if (oldStatus !== status) {
        caseData.timeline.push({
            type: 'status-changed',
            content: `<strong>Status changed</strong> from ${oldStatus.replace('-', ' ')} to ${status.replace('-', ' ')}`,
            timestamp: Date.now()
        });
    }

    saveCases();
    document.querySelector('.case-modal')?.remove();
    renderCasesList();
    selectCase(selectedCaseId);
    showFloatingNotification('Case updated', 'success');
}

function deleteCase() {
    if (!confirm('Delete this case? This cannot be undone.')) return;

    cases = cases.filter(c => c.id !== selectedCaseId);
    saveCases();
    
    document.querySelector('.case-modal')?.remove();
    
    selectedCaseId = null;
    document.getElementById('casesDetail').style.display = 'none';
    document.getElementById('casesWelcome').style.display = 'flex';
    
    renderCasesList();
    showFloatingNotification('Case deleted', 'info');
}

function toggleCaseStatus() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    if (caseData.status === 'closed') {
        caseData.status = 'open';
    } else {
        caseData.status = 'closed';
        caseData.timeline.push({
            type: 'status-changed',
            content: '<strong>Case closed</strong>',
            timestamp: Date.now()
        });
    }

    saveCases();
    renderCasesList();
    selectCase(selectedCaseId);
}

function showEntityPickerModal() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const allEntities = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    const availableEntities = allEntities.filter(e => !caseData.entities.includes(e.id));

    if (availableEntities.length === 0 && caseData.entities.length === 0) {
        showFloatingNotification('No entities to add', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Entities</h2>
            </div>
            <div class="modal-body">
                ${caseData.entities.length > 0 ? `
                    <div class="case-bulk-actions">
                        <button class="btn btn-secondary btn-sm" onclick="addAllEntitiesToCase()">
                            <i class="fas fa-plus"></i> Add All (${availableEntities.length})
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="addRelatedEntitiesToCase()">
                            <i class="fas fa-link"></i> Add Related
                        </button>
                    </div>
                ` : ''}
                <h4 style="margin: 16px 0 8px; color: #888; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Available Entities</h4>
                <div class="entity-picker-list">
                    ${availableEntities.length > 0 ? availableEntities.map(e => `
                        <div class="entity-picker-item ${e.type}" onclick="addEntityToCase('${e.id}', '${e.type}')">
                            <i class="fas ${e.type === 'human' ? 'fa-user' : 'fa-building'}"></i>
                            <span>${escapeHtml(e.name)}</span>
                            <span style="margin-left: auto; color: #666; font-size: 0.8rem;">
                                ${getRelatedCount(e)}
                            </span>
                        </div>
                    `).join('') : '<p style="color: #666; text-align: center; padding: 20px;">All entities are already in this case</p>'}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
}

function getRelatedCount(entity) {
    let count = 0;
    if (entity.friends) count += entity.friends.length;
    if (entity.family) count += entity.family.length;
    if (entity.workplace) {
        const workplaceEntity = pazatorData.others.find(o => o.name === entity.workplace);
        if (workplaceEntity && !caseData?.entities?.includes(workplaceEntity.id)) count++;
    }
    return count > 0 ? `${count} related` : '';
}

function addAllEntitiesToCase() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const allEntities = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    const availableEntities = allEntities.filter(e => !caseData.entities.includes(e.id));
    let added = 0;

    availableEntities.forEach(e => {
        if (!caseData.entities.includes(e.id)) {
            caseData.entities.push(e.id);
            caseData.timeline.push({
                type: 'entity-added',
                content: `<strong>Entity added</strong>: ${e.name}`,
                timestamp: Date.now()
            });
            added++;
        }
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    showFloatingNotification(`Added ${added} entities to case`, 'success');
}

function addRelatedEntitiesToCase() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const relatedIds = new Set();

    caseData.entities.forEach(entityId => {
        const entity = pazatorData.humans.find(h => h.id === entityId) 
            || pazatorData.others.find(o => o.id === entityId);
        
        if (entity) {
            if (entity.friends) {
                entity.friends.forEach(friendId => relatedIds.add(friendId));
            }
            if (entity.family) {
                entity.family.forEach(familyId => relatedIds.add(familyId));
            }
            if (entity.workplace) {
                const workplace = pazatorData.others.find(o => o.name === entity.workplace);
                if (workplace) relatedIds.add(workplace.id);
            }
        }
    });

    let added = 0;
    relatedIds.forEach(id => {
        if (!caseData.entities.includes(id)) {
            const entity = pazatorData.humans.find(h => h.id === id) || pazatorData.others.find(o => o.id === id);
            if (entity) {
                caseData.entities.push(id);
                caseData.timeline.push({
                    type: 'entity-added',
                    content: `<strong>Related entity added</strong>: ${entity.name}`,
                    timestamp: Date.now()
                });
                added++;
            }
        }
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    
    if (added > 0) {
        showFloatingNotification(`Added ${added} related entities`, 'success');
    } else {
        showFloatingNotification('No new related entities found', 'info');
    }
}

function addEntityToCase(entityId, type) {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData || caseData.entities.includes(entityId)) return;

    const entity = type === 'human' 
        ? pazatorData.humans.find(h => h.id === entityId)
        : pazatorData.others.find(o => o.id === entityId);

    caseData.entities.push(entityId);
    caseData.timeline.push({
        type: 'entity-added',
        content: `<strong>Entity added</strong>: ${entity?.name || 'Unknown'}`,
        timestamp: Date.now()
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    showFloatingNotification('Entity added to case', 'success');
}

function removeEntityFromCase(caseId, entityId) {
    const caseData = cases.find(c => c.id === caseId);
    if (!caseData) return;

    caseData.entities = caseData.entities.filter(e => e !== entityId);
    saveCases();
    selectCase(caseId);
}

function addCaseNote() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const input = document.getElementById('caseNoteInput');
    const note = input.value.trim();

    if (!note) return;

    caseData.timeline.push({
        type: 'note',
        content: `<strong>Note</strong>: ${escapeHtml(note)}`,
        timestamp: Date.now()
    });

    input.value = '';
    saveCases();
    selectCase(selectedCaseId);
}

function viewDetailFromCase(entityId, type) {
    const human = pazatorData.humans.find(h => h.id === entityId);
    const other = pazatorData.others.find(o => o.id === entityId);
    const entity = human || other;

    if (entity) {
        showDetailView(entity, type);
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Settings Functions
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const noBlurToggle = document.getElementById('noBlurToggle');
    const skipIntroToggle = document.getElementById('skipIntroToggle');

    noBlurToggle.checked = localStorage.getItem('noBlur') === 'true';
    skipIntroToggle.checked = localStorage.getItem('skipIntro') === 'true';

    modal.classList.add('active');

    modal.onclick = function(e) {
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

// Initialize settings on load
function initSettings() {
    if (localStorage.getItem('noBlur') === 'true') {
        document.body.classList.add('no-blur');
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

// Call init settings on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initSettings);
document.addEventListener('DOMContentLoaded', loadLogoForPDF);
