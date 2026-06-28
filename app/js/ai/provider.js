(function () {
  'use strict';

  var PROVIDER_KEY = 'pazator_ai_provider';
  var _providers = {};
  var _current = localStorage.getItem(PROVIDER_KEY) || 'gemini';

  function _impl() {
    var p = _providers[_current];
    if (!p) throw new Error('AI provider "' + _current + '" not loaded.');
    return p;
  }

  var api = {
    register: function (name, impl) {
      _providers[name] = impl;
      if (name === _current) _current = name;
    },

    getCurrent: function () { return _current; },

    setCurrent: function (name) {
      if (!_providers[name]) throw new Error('Provider "' + name + '" not registered');
      _current = name;
      localStorage.setItem(PROVIDER_KEY, name);
    },

    list: function () { return Object.keys(_providers); },

    getProvider: function (name) { return _providers[name] || null; },

    chat: function (messages, signal) {
      return _impl().chat(messages, signal);
    },

    streamChat: function (messages, onChunk, signal) {
      var impl = _impl();
      if (impl.streamChat) return impl.streamChat(messages, onChunk, signal);
      return impl.chat(messages, signal).then(function (r) {
        if (onChunk) onChunk(r.content, r.content);
        return r.content;
      });
    },

    getApiKey: function () {
      var impl = _impl();
      return impl.getApiKey ? impl.getApiKey() : '';
    },

    setApiKey: function (key) {
      var impl = _impl();
      if (impl.setApiKey) impl.setApiKey(key);
    },

    getModel: function () {
      var impl = _impl();
      return impl.getModel ? impl.getModel() : '';
    },

    setModel: function (model) {
      var impl = _impl();
      if (impl.setModel) impl.setModel(model);
    },

    getModels: function () {
      return _impl().models || [];
    },

    getName: function () {
      return _impl().name || _current;
    },

    getDefaultModel: function () {
      return _impl().defaultModel || '';
    }
  };

  window.pazatorAI = api;

  window.geminiChat = function (messages, signal) {
    return api.chat(messages, signal);
  };
  window.pazatorGemini = {
    getApiKey: function () { return api.getApiKey(); },
    setApiKey: function (k) { api.setApiKey(k); },
    getModel: function () { return api.getModel(); },
    setModel: function (m) { api.setModel(m); },
    get models() { return api.getModels(); },
    get defaultModel() { return api.getDefaultModel ? api.getDefaultModel() : ''; }
  };
})();
