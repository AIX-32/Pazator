const newDataBtn = document.getElementById('newDataBtn');
const askAIBtn = document.getElementById('askAIBtn');
const typeModal = document.getElementById('typeModal');
const humanModal = document.getElementById('humanModal');
const otherModal = document.getElementById('otherModal');
const detailViewModal = document.getElementById('detailViewModal');
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


const tagInput = document.getElementById('tagInput');
const addTagBtn = document.getElementById('addTagBtn');
const tagsContainer = document.getElementById('tagsContainer');
const showStatisticsBtn = document.getElementById('showStatisticsBtn');
const findConnectionsBtn = document.getElementById('findConnectionsBtn');
const refreshCreditsBtn = document.getElementById('refreshCreditsBtn');
const sortByCreditBtn = document.getElementById('sortByCreditBtn');

const intelAnalyzeBtn = document.getElementById('intelAnalyzeBtn');
const intelConnectionsBtn = document.getElementById('intelConnectionsBtn');
const intelRefreshRiskBtn = document.getElementById('intelRefreshRiskBtn');
const intelClearResults = document.getElementById('intelClearResults');
const intelHeurBtn = document.getElementById('intelHeurBtn');
const heurModal = document.getElementById('heurModal');

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
let chatPage = 1;
const CHAT_PAGE_SIZE = 25;

const classificationBanner = document.getElementById('classificationBanner');

const tabBar = document.getElementById('tabBar');
const addTabBtn = document.getElementById('addTabBtn');
const tabBarTime = document.getElementById('tabBarTime');
const tabBarDate = document.getElementById('tabBarDate');
const tabBarStatus = document.getElementById('tabBarStatus');

const chatMenu = document.getElementById('chatMenu');

