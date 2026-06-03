const VALID_CHAT_SOURCES = ['whatsapp', 'telegram', 'discord', 'signal', 'manual'];
const MAX_CHAT_CONTENT_SIZE = 10 * 1024 * 1024;
const STORAGE_WARNING_THRESHOLD = 4 * 1024 * 1024;

var PazatorCompress = {
    _prefix: 'PZC1:',

    compress: function (text) {
        if (!text || text.length < 200) return text;
        try {
            var encoded = btoa(unescape(encodeURIComponent(text)));
            if (encoded.length < text.length * 0.8) {
                return this._prefix + encoded;
            }
            return text;
        } catch (e) {
            return text;
        }
    },

    decompress: function (text) {
        if (!text || typeof text !== 'string') return text;
        if (text.substring(0, 5) === this._prefix) {
            try {
                return decodeURIComponent(escape(atob(text.substring(5))));
            } catch (e) {
                return text;
            }
        }
        return text;
    },

    compressObject: function (obj) {
        if (!obj || typeof obj !== 'object') return obj;
        var result = Array.isArray(obj) ? [] : {};
        for (var key in obj) {
            var val = obj[key];
            if (typeof val === 'string' && val.length > 500) {
                result[key] = this.compress(val);
            } else if (typeof val === 'object' && val !== null) {
                result[key] = this.compressObject(val);
            } else {
                result[key] = val;
            }
        }
        return result;
    },

    decompressObject: function (obj) {
        if (!obj || typeof obj !== 'object') return obj;
        var result = Array.isArray(obj) ? [] : {};
        for (var key in obj) {
            var val = obj[key];
            if (typeof val === 'string') {
                result[key] = this.decompress(val);
            } else if (typeof val === 'object' && val !== null) {
                result[key] = this.decompressObject(val);
            } else {
                result[key] = val;
            }
        }
        return result;
    }
};

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

var _kvStore = {
    has: function () { return typeof window !== 'undefined' && window.pazatorStore; },
    get: function (key) {
        if (typeof window !== 'undefined' && window.pazatorStore) {
            return window.pazatorStore.kvGet(key);
        }
        try { return Promise.resolve(JSON.parse(localStorage.getItem(key) || 'null')); }
        catch (e) { return Promise.resolve(null); }
    },
    set: function (key, value) {
        if (typeof window !== 'undefined' && window.pazatorStore) {
            window.pazatorStore.kvSet(key, value).catch(function () {});
        }
    },
    remove: function (key) {
        if (typeof window !== 'undefined' && window.pazatorStore) {
            window.pazatorStore.kvDelete(key).catch(function () {});
        }
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
            var raw = localStorage.getItem(key) || '[]';
            var data = JSON.parse(raw);
            data = PazatorCompress.decompressObject(data);
            this._setCache(key, data);
            _kvStore.set('chatHistory', raw);
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
        _kvStore.remove('chatHistory');
    },

    _saveWithQuotaCheck(key, data) {
        try {
            var compressed = PazatorCompress.compressObject(data);
            const serialized = JSON.stringify(compressed);
            const size = new Blob([serialized]).size;

            if (size > STORAGE_WARNING_THRESHOLD) {
                console.warn(`Chat storage approaching limit: ${(size / 1024 / 1024).toFixed(2)}MB`);
            }

            localStorage.setItem(key, serialized);
            _kvStore.set(key, serialized);
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
        _kvStore.set(key, JSON.stringify(oldData));
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
            _kvStore.set(key, localStorage.getItem(key));
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
        var serialized = JSON.stringify(contexts);
        localStorage.setItem('aiChatContext', serialized);
        _kvStore.set('aiChatContext', serialized);
        this._setCache('aiChatContext', contexts);
    },

    invalidateCache() {
        this._cache.clear();
    },

    ARCHIVE_DAYS: 90,
    _archiveCache: null,

    getArchivedChats() {
        if (this._archiveCache) return this._archiveCache;
        try {
            var data = JSON.parse(localStorage.getItem('chatHistory_archive') || '[]');
            this._archiveCache = data;
            _kvStore.set('chatHistory_archive', localStorage.getItem('chatHistory_archive'));
            return data;
        } catch (e) { return []; }
    },

    archiveOldChats() {
        var cutoff = Date.now() - this.ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
        var history = this.getChatHistory();
        var active = [];
        var archived = [];
        for (var i = 0; i < history.length; i++) {
            var chat = history[i];
            var ts = new Date(chat.timestamp || 0).getTime();
            if (ts < cutoff) {
                archived.push(chat);
            } else {
                active.push(chat);
            }
        }
        if (archived.length === 0) return { archived: 0, active: active.length };
        var existingArchive = this.getArchivedChats();
        var allArchived = existingArchive.concat(archived);
        try {
            var archiveSerialized = JSON.stringify(allArchived);
            var activeSerialized = JSON.stringify(active);
            localStorage.setItem('chatHistory_archive', archiveSerialized);
            localStorage.setItem('chatHistory', activeSerialized);
            _kvStore.set('chatHistory_archive', archiveSerialized);
            _kvStore.set('chatHistory', activeSerialized);
            this._cache.delete('chatHistory');
            this._archiveCache = allArchived;
        } catch (e) {
            console.warn('Archive storage failed:', e);
        }
        return { archived: archived.length, active: active.length };
    },

    restoreArchivedChats() {
        var archived = this.getArchivedChats();
        if (archived.length === 0) return 0;
        var history = this.getChatHistory();
        var merged = history.concat(archived);
        try {
            var serialized = JSON.stringify(merged);
            localStorage.setItem('chatHistory', serialized);
            localStorage.removeItem('chatHistory_archive');
            _kvStore.set('chatHistory', serialized);
            _kvStore.remove('chatHistory_archive');
            this._cache.delete('chatHistory');
            this._archiveCache = null;
        } catch (e) {
            console.warn('Archive restore failed:', e);
        }
        return archived.length;
    },

    getArchiveStats() {
        var archived = this.getArchivedChats();
        return {
            archivedCount: archived.length,
            archiveSize: new Blob([JSON.stringify(archived)]).size,
            archiveDays: this.ARCHIVE_DAYS
        };
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
            geminiChat([
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
