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
    '}\n';

  document.head.appendChild(wtStyles);

  function openMenu(name) {
    var d = document.querySelector('.menu-item[data-menu="' + name + '"] .menu-dropdown');
    if (d) { d.style.opacity = '1'; d.style.visibility = 'visible'; d.style.pointerEvents = 'auto'; d.style.transform = 'translateX(-50%) translateY(0)'; }
  }
  function closeMenu(name) {
    var d = document.querySelector('.menu-item[data-menu="' + name + '"] .menu-dropdown');
    if (d) { d.style.opacity = ''; d.style.visibility = ''; d.style.pointerEvents = ''; d.style.transform = ''; }
  }
  function closeAllMenus() {
    ['view', 'data', 'tools', 'system', 'help'].forEach(closeMenu);
  }

  var cur = 0;
  var active = false;
  var highlight, card, stepEl, titleEl, descEl, prevBtn, nextBtn, skipBtn;
  var prevTab = 'dashboard';

  var steps = [
    {
      target: '#tabBar',
      title: 'Navigation',
      desc: 'Switch between workspaces: Dashboard, Analysis, Threats, Chat Security, Search, Tracker, and Cases.',
      before: function () { prevTab = document.querySelector('.tab-content.active')?.id?.replace('-tab', '') || 'dashboard'; closeAllMenus(); }
    },
    {
      target: '#newDataBtn',
      title: 'Quick Actions',
      desc: 'Add people or entities, open Zor AI assistant, upload chats, bulk data, or use AI-powered import.',
      before: function () { closeAllMenus(); }
    },
    {
      target: '#askAIBtn',
      title: 'Zor AI Assistant',
      desc: 'Your AI analyst. Ask questions, find connections, analyze threats, or manage data through natural language. Use the element select tool in the chat to inspect any UI element and ask Zor about it.'
    },
    {
      target: '#aiApiKeyInput',
      title: 'AI Engine',
      desc: 'Select your AI provider and paste your API key. Zor uses this engine for analysis, suggestions, and responses.'
    },
    {
      target: '.menu-item[data-menu="view"]',
      title: 'View Menu',
      desc: 'Switch between Dashboard, Analysis, Threats, and the Explorer graph view.',
      before: function () { openMenu('view'); },
      after: function () { closeMenu('view'); }
    },
    {
      target: '.menu-item[data-menu="data"]',
      title: 'Data Menu',
      desc: 'Access Search, Chat Control, Cases, Ontology Designer, Pipelines ETL, and LCTX Tracker.',
      before: function () { openMenu('data'); },
      after: function () { closeMenu('data'); }
    },
    {
      target: '.menu-item[data-menu="tools"]',
      title: 'Tools Menu',
      desc: 'Open Alerts engine, API Console, Workflow automation, and Report builder.',
      before: function () { openMenu('tools'); },
      after: function () { closeMenu('tools'); }
    },
    {
      target: '.menu-item[data-menu="system"]',
      title: 'System Menu',
      desc: 'Settings, Classification, Export CSV, Sync Config, Plugins, and Snappy screenshot tool.',
      before: function () { openMenu('system'); },
      after: function () { closeMenu('system'); }
    },
    {
      target: '.menu-item[data-menu="help"]',
      title: 'Help Menu',
      desc: 'Restart this walkthrough, open docs, join Discord, load placeholder data, or wipe all data.',
      before: function () { openMenu('help'); },
      after: function () { closeMenu('help'); }
    },
    {
      target: '.logo-card',
      title: 'Logo Menu',
      desc: 'Click the logo for About, System Info, Settings, and sync configuration.',
      before: function () { closeAllMenus(); }
    },
    {
      target: '#analysis-tab',
      title: 'Analysis Hub',
      desc: 'Network analysis, risk assessment, credit ranking, AI tag suggestions, and key metrics.',
      before: function () { closeAllMenus(); switchTab('analysis'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#threats-tab',
      title: 'Intelligence Center',
      desc: 'AI security scans, risk distribution charts, hidden connection finder, and context source toggles.',
      before: function () { switchTab('threats'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#search-tab',
      title: 'Universal Search',
      desc: 'Search across names, workplaces, dates, notes, tags, and relationships. Filter by type and field.',
      before: function () { switchTab('search'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#chat-control-tab',
      title: 'Chat Security',
      desc: 'Import chats from WhatsApp, Telegram, Discord, and Signal. Scan for threats, find duplicates, generate reports.',
      before: function () { switchTab('chat-control'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#tracker-tab',
      title: 'LCTX Tracker',
      desc: 'Real-time MapLibre globe tracker. Link tracker profiles to people, view paths, and configure the server.',
      before: function () { switchTab('tracker'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#cases-tab',
      title: 'Case Files',
      desc: 'Create investigation cases, track entities, log evidence, and hand off to Zor for AI analysis.',
      before: function () { switchTab('cases'); },
      after: function () { switchTab(prevTab); }
    },
    {
      target: '#settingsWalkthroughBtn',
      title: 'Settings',
      desc: 'Configure blur effects, skip intro, set AI tool delay, toggle debug mode, password lock, and restart this walkthrough.',
      before: function () {
        closeAllMenus();
        switchTab(prevTab);
        var s = document.getElementById('settingsOption');
        if (s) s.click();
        var m = document.getElementById('settingsModal');
        if (m) m.classList.add('active');
      },
      after: function () {
        var m = document.getElementById('settingsModal');
        if (m) m.classList.remove('active');
      }
    },
    {
      target: '#askAIBtn',
      title: 'Pro Tip: Element Select',
      desc: 'Open Zor and click the select button to pick any element on screen. Zor will show you what it is — you can then ask anything about it without typing selectors.',
      before: function () {
        var m = document.getElementById('settingsModal');
        if (m) m.classList.remove('active');
        closeAllMenus();
        switchTab(prevTab);
      }
    }
  ];

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
    closeAllMenus();
    var m = document.getElementById('settingsModal');
    if (m) m.classList.remove('active');
  }

  function show() {
    var s = steps[cur];
    if (!s) { end(); return; }

    if (s.before) s.before();

    stepEl.textContent = (cur + 1) + ' / ' + steps.length;
    titleEl.textContent = s.title;
    descEl.textContent = s.desc;
    prevBtn.style.display = cur === 0 ? 'none' : 'inline-block';

    if (cur === steps.length - 1) {
      nextBtn.innerHTML = '<i class="fas fa-check"></i> Done';
    } else {
      nextBtn.textContent = 'Next';
    }

    highlightTarget(s.target);
  }

  function highlightTarget(selector) {
    var el = document.querySelector(selector);
    if (!el) { card.classList.add('visible'); return; }

    var r = el.getBoundingClientRect();
    highlight.style.left = (r.left - 4) + 'px';
    highlight.style.top = (r.top - 4) + 'px';
    highlight.style.width = (r.width + 8) + 'px';
    highlight.style.height = (r.height + 8) + 'px';

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
    } else {
      positionCard(el);
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

    card.style.left = '16px';
    card.style.top = '16px';
    card.classList.add('visible');
  }

  function next() {
    var s = steps[cur];
    if (s && s.after) s.after();
    if (cur < steps.length - 1) { cur++; show(); }
    else { end(); }
  }

  function prev() {
    var s = steps[cur];
    if (s && s.after) s.after();
    if (cur > 0) { cur--; show(); }
  }

  function onResize() {
    if (!active) return;
    var s = steps[cur];
    if (!s) return;
    highlightTarget(s.target);
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
