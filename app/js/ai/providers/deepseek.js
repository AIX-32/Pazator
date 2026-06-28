(function () {
  'use strict';

  var API_KEY_KEY = 'pazator_ai_deepseek_api_key';
  var MODEL_KEY = 'pazator_ai_deepseek_model';
  var BASE_URL = 'https://api.deepseek.com';
  var DEFAULT_MODEL = 'deepseek-v4-flash';

  var MODELS = [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat (deprecating)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (deprecating)' }
  ];

  function getApiKey() { return localStorage.getItem(API_KEY_KEY) || ''; }
  function setApiKey(key) { localStorage.setItem(API_KEY_KEY, key); }
  function getModel() { return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL; }
  function setModel(model) { localStorage.setItem(MODEL_KEY, model); }

  function buildMessages(messages) {
    var out = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }

  async function chat(messages, signal) {
    var apiKey = getApiKey();
    var model = getModel();
    if (!apiKey) throw new Error('DeepSeek API key not configured.');

    var response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: buildMessages(messages),
        stream: false
      }),
      signal: signal || undefined
    });

    if (!response.ok) {
      var errorText;
      try { var errorJson = await response.json(); errorText = errorJson.error && errorJson.error.message ? errorJson.error.message : JSON.stringify(errorJson); }
      catch (e) { errorText = await response.text(); }
      throw new Error('DeepSeek API error (' + response.status + '): ' + errorText);
    }

    var data = await response.json();
    var text = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      text = data.choices[0].message.content || '';
    }
    return { content: text };
  }

  async function streamChat(messages, onChunk, signal) {
    var apiKey = getApiKey();
    var model = getModel();
    if (!apiKey) throw new Error('DeepSeek API key not configured.');

    var response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: buildMessages(messages),
        stream: true
      }),
      signal: signal
    });

    if (!response.ok) {
      var errorText;
      try { var errorJson = await response.json(); errorText = errorJson.error && errorJson.error.message ? errorJson.error.message : JSON.stringify(errorJson); }
      catch (e) { errorText = await response.text(); }
      throw new Error('DeepSeek API error (' + response.status + '): ' + errorText);
    }

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';
    var buffer = '';
    while (true) {
      var readResult = await reader.read();
      if (readResult.done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      var done = false;
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (line.startsWith('data: ')) {
          var jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { done = true; break; }
          if (jsonStr) {
            try {
              var parsed = JSON.parse(jsonStr);
              if (parsed.choices && parsed.choices[0]) {
                var delta = parsed.choices[0].delta;
                if (delta && delta.content) {
                  fullText += delta.content;
                  if (onChunk) onChunk(delta.content, fullText);
                }
              }
            } catch (e) {}
          }
        }
      }
      if (done) break;
    }
    return fullText;
  }

  var provider = {
    name: 'DeepSeek',
    models: MODELS,
    defaultModel: DEFAULT_MODEL,
    chat: chat,
    streamChat: streamChat,
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    getModel: getModel,
    setModel: setModel
  };

  if (window.pazatorAI) {
    window.pazatorAI.register('deepseek', provider);
  }
})();
