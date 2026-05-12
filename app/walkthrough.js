(function () {
  'use strict';

  var wtStyles = document.createElement('style');
  wtStyles.textContent =
    '#pz-wt-highlight {\n' +
    '  position: fixed;\n' +
    '  pointer-events: none;\n' +
    '  z-index: 99998;\n' +
    '  border-radius: 7px;\n' +
    '  box-shadow: 0 0 0 2px rgba(255,255,255,0.25), 0 0 20px rgba(255,255,255,0.08);\n' +
    '  transition: all 0.3s ease;\n' +
    '  opacity: 0;\n' +
    '}\n' +
    '#pz-wt-card {\n' +
    '  position: fixed;\n' +
    '  z-index: 99999;\n' +
    '  background: #1a1a1a;\n' +
    '  border: 1px solid #333;\n' +
    '  border-radius: 10px;\n' +
    '  padding: 20px;\n' +
    '  max-width: 360px;\n' +
    '  width: calc(100vw - 32px);\n' +
    '  box-shadow: 0 12px 40px rgba(0,0,0,0.5);\n' +
    '  color: #e0e0e0;\n' +
    '  font-family: "DM Mono", monospace;\n' +
    '  font-size: 13px;\n' +
    '  line-height: 1.6;\n' +
    '  animation: pzWtIn 0.2s ease;\n' +
    '  display: none;\n' +
    '}\n' +
    '#pz-wt-card.visible { display: block; }\n' +
    '@keyframes pzWtIn {\n' +
    '  from { opacity: 0; transform: translateY(6px); }\n' +
    '  to { opacity: 1; transform: translateY(0); }\n' +
    '}\n' +
    '#pz-wt-card h3 {\n' +
    '  margin: 0 0 6px 0;\n' +
    '  font-size: 15px;\n' +
    '  color: #fff;\n' +
    '}\n' +
    '#pz-wt-card p {\n' +
    '  margin: 0 0 14px 0;\n' +
    '  color: #999;\n' +
    '  font-size: 12px;\n' +
    '}\n' +
    '#pz-wt-footer {\n' +
    '  display: flex;\n' +
    '  align-items: center;\n' +
    '  gap: 8px;\n' +
    '}\n' +
    '#pz-wt-step {\n' +
    '  font-size: 10px;\n' +
    '  color: #555;\n' +
    '  text-transform: uppercase;\n' +
    '  letter-spacing: 0.5px;\n' +
    '  margin-right: auto;\n' +
    '}\n' +
    '#pz-wt-card button {\n' +
    '  padding: 6px 14px;\n' +
    '  border: 1px solid #444;\n' +
    '  border-radius: 6px;\n' +
    '  background: #2a2a2a;\n' +
    '  color: #e0e0e0;\n' +
    '  cursor: pointer;\n' +
    '  font-size: 11px;\n' +
    '  font-family: "DM Mono", monospace;\n' +
    '  transition: all 0.15s;\n' +
    '}\n' +
    '#pz-wt-card button:hover {\n' +
    '  background: #3a3a3a;\n' +
    '  border-color: #666;\n' +
    '}\n' +
    '#pz-wt-card .pz-wt-pri {\n' +
    '  background: #fff;\n' +
    '  color: #000;\n' +
    '  border-color: #fff;\n' +
    '}\n' +
    '#pz-wt-card .pz-wt-pri:hover {\n' +
    '  background: #ddd;\n' +
    '}\n' +
    '#pz-wt-card .pz-wt-ghost {\n' +
    '  background: transparent;\n' +
    '  border: none;\n' +
    '  color: #555;\n' +
    '}\n' +
    '#pz-wt-card .pz-wt-ghost:hover {\n' +
    '  color: #999;\n' +
    '}\n' +

  document.head.appendChild(wtStyles);

  var steps = [
    {
      target: '#tabBar',
      title: 'Navigation',
      desc: 'Switch between workspaces: Dashboard, Analysis, Threats, Chat Security, Search, Agents, Articles, Tracker, Cases, and TASTUR.'
    },
    {
      target: '#newDataBtn',
      title: 'Quick Actions',
      desc: 'Add people or entities to your database, open the AI assistant Zor, upload chats, bulk data, or use AI-powered import.'
    },
    {
      target: '#searchInput',
      title: 'Search & Filter',
      desc: 'Search and filter your entire database. Type a name, select a type, and hit Apply. The node visualization updates in real-time.'
    },
    {
      target: '#tagInput',
      title: 'Tags',
      desc: 'Create and manage tags to categorize your data. Tags help organize, filter, and run targeted AI analysis.'
    },
    {
      target: '#geminiApiKeyInput',
      title: 'AI Engine',
      desc: 'Paste your Google Gemini API key here. Zor uses this engine for analysis, suggestions, and intelligent responses.'
    },
    {
      target: '#askAIBtn',
      title: 'Zor AI Assistant',
      desc: 'Your AI analyst. Ask questions, find connections, analyze threats, or manage data through natural language.'
    },
    {
      target: '#analysisBtn',
      title: 'Analysis Hub',
      desc: 'Network analysis, risk assessment, credit ranking, and AI tag suggestions. View metrics on people, entities, and risk levels.'
    },
    {
      target: '#threatsBtn',
      title: 'Intelligence Center',
      desc: 'Run AI security scans, review risk distribution, find hidden connections between entities, and toggle context sources.'
    },
    {
      target: '#chatControlBtn',
      title: 'Chat Security',
      desc: 'Import chats from WhatsApp, Telegram, Discord, and Signal. Scan for threats, generate reports, detect duplicates.'
    },
    {
      target: '#searchBtn',
      title: 'Universal Search',
      desc: 'Search across names, workplaces, dates, notes, tags, and relationships. Filter by type and field.'
    },
    {
      target: '#agentsBtn',
      title: 'Autonomous Agents',
      desc: 'Create AI agents with custom goals. Each can search, browse, add data, create connections, and log evidence.'
    },
    {
      target: '#trackerBtn',
      title: 'SHAHED Tracker',
      desc: 'SHAHED enables location data to be provided to Zor and associates tracker profiles with users. Setting up the tracker hardware and server infrastructure is a separate process not included in this application.'
    },
    {
      target: '#tasturBtn',
      title: 'TASTUR Rules',
      desc: 'Automate with event-driven rules. Example: WHEN threat_detected IF count > 5 THEN notify.'
    },
    {
      target: '#casesBtn',
      title: 'Case Files',
      desc: 'Create investigation cases. Track entities, log timestamped activities, and hand off to Zor for AI analysis.'
    },
    {
      target: '.logo-card',
      title: 'Settings & Tools',
      desc: 'Access settings, classification, CSV export, and the About page from the logo menu.'
    }
  ];

  var cur = 0;
  var active = false;
  var highlight, card, stepEl, titleEl, descEl, prevBtn, nextBtn, skipBtn;

  function build() {
    highlight = document.createElement('div');
    highlight.id = 'pz-wt-highlight';

    card = document.createElement('div');
    card.id = 'pz-wt-card';
    card.innerHTML =
      '<h3 id="pz-wt-title"></h3>' +
      '<p id="pz-wt-desc"></p>' +
      '<div id="pz-wt-footer">' +
      '  <button class="pz-wt-ghost" id="pz-wt-skip">Skip</button>' +
      '  <span id="pz-wt-step"></span>' +
      '  <button id="pz-wt-prev">Back</button>' +
      '  <button class="pz-wt-pri" id="pz-wt-next">Next</button>' +
      '</div>';

    document.body.appendChild(highlight);
    document.body.appendChild(card);

    stepEl = document.getElementById('pz-wt-step');
    titleEl = document.getElementById('pz-wt-title');
    descEl = document.getElementById('pz-wt-desc');
    prevBtn = document.getElementById('pz-wt-prev');
    nextBtn = document.getElementById('pz-wt-next');
    skipBtn = document.getElementById('pz-wt-skip');

    skipBtn.onclick = end;
    prevBtn.onclick = prev;
    nextBtn.onclick = next;
  }

  function start() {
    if (active) return;
    active = true;
    cur = 0;
    highlight.style.opacity = '1';
    show();
  }

  function end() {
    active = false;
    highlight.style.opacity = '0';
    card.classList.remove('visible');
  }

  function show() {
    var s = steps[cur];
    if (!s) { end(); return; }

    stepEl.textContent = (cur + 1) + ' / ' + steps.length;
    titleEl.textContent = s.title;
    descEl.textContent = s.desc;
    prevBtn.style.display = cur === 0 ? 'none' : 'inline-block';

    if (cur === steps.length - 1) {
      nextBtn.innerHTML = '<i class="fas fa-check"></i> Done';
    } else {
      nextBtn.textContent = 'Next';
    }

    var el = document.querySelector(s.target);
    if (el) {
      var r = el.getBoundingClientRect();
      highlight.style.left = (r.left - 4) + 'px';
      highlight.style.top = (r.top - 4) + 'px';
      highlight.style.width = (r.width + 8) + 'px';
      highlight.style.height = (r.height + 8) + 'px';
      positionCard(el);
    }

    if (el) {
      var r = el.getBoundingClientRect();
      var vis = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      if (!vis) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () {
          if (el) {
            var r2 = el.getBoundingClientRect();
            highlight.style.left = (r2.left - 4) + 'px';
            highlight.style.top = (r2.top - 4) + 'px';
            highlight.style.width = (r2.width + 8) + 'px';
            highlight.style.height = (r2.height + 8) + 'px';
            positionCard(el);
          }
        }, 350);
      }
    }
  }

  function positionCard(el) {
    var r = el.getBoundingClientRect();
    var cw = Math.min(360, window.innerWidth - 32);
    card.style.maxWidth = cw + 'px';

    var tryPositions = ['below', 'above', 'left', 'right'];
    for (var i = 0; i < tryPositions.length; i++) {
      var pos = tryPositions[i];
      var x, y;

      switch (pos) {
        case 'below':
          x = Math.max(16, Math.min(r.left + r.width / 2 - cw / 2, window.innerWidth - cw - 16));
          y = r.bottom + 12;
          break;
        case 'above':
          x = Math.max(16, Math.min(r.left + r.width / 2 - cw / 2, window.innerWidth - cw - 16));
          y = r.top - 12;
          break;
        case 'left':
          x = r.left - cw - 12;
          y = Math.max(16, Math.min(r.top + r.height / 2 - 80, window.innerHeight - 180));
          break;
        case 'right':
          x = r.right + 16;
          y = Math.max(16, Math.min(r.top + r.height / 2 - 80, window.innerHeight - 180));
          break;
      }

      if (pos === 'above') y -= card.offsetHeight || 200;

      if (x >= 0 && x + cw <= window.innerWidth && y >= 0 && y + 180 <= window.innerHeight) {
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        card.classList.add('visible');
        return;
      }
    }

    // fallback
    card.style.left = '16px';
    card.style.top = '16px';
    card.classList.add('visible');
  }

  function next() {
    if (cur < steps.length - 1) { cur++; show(); }
    else { end(); }
  }

  function prev() {
    if (cur > 0) { cur--; show(); }
  }

  function onResize() {
    if (!active) return;
    var s = steps[cur];
    if (!s) return;
    var el = document.querySelector(s.target);
    if (el) {
      var r = el.getBoundingClientRect();
      highlight.style.left = (r.left - 4) + 'px';
      highlight.style.top = (r.top - 4) + 'px';
      highlight.style.width = (r.width + 8) + 'px';
      highlight.style.height = (r.height + 8) + 'px';
      positionCard(el);
    }
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') end();
    if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    if (e.key === 'ArrowLeft') prev();
  }

  function init() {
    build();
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.startPazatorWalkthrough = start;
  window.tryAutoStartWalkthrough = function () {
    if (!localStorage.getItem('pazator_walkthrough_done')) {
      localStorage.setItem('pazator_walkthrough_done', 'true');
      setTimeout(start, 400);
    }
  };
})();
