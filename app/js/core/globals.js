
let pazatorData = {
    humans: [],
    others: [],
    chats: []
};
// Keep legacy globals in sync for other app modules (e.g. GraphView/dashboard).
window.pazatorData = pazatorData;

let tags = [];

let cases = [];

let aiChatHistory = [];

let autoSaveInterval;
let pendingChanges = false;
let lastChangeTime = 0;
const AUTO_SAVE_DELAY = 2000;
const PERIODIC_SAVE_INTERVAL = 30000;

let openMenuSections = [];


let searchTabInitialized = false;

let casesTabInitialized = false;
let selectedCaseId = null;



let logoBase64 = null;

let agentSystem = null;
