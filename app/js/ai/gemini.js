(function () {
  'use strict';

  var GEMINI_API_KEY_KEY = 'pazator_ai_gemini_api_key';
  var GEMINI_MODEL_KEY = 'pazator_ai_gemini_model';
  var DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

  if (localStorage.getItem('pazator_gemini_api_key') && !localStorage.getItem(GEMINI_API_KEY_KEY)) {
    localStorage.setItem(GEMINI_API_KEY_KEY, localStorage.getItem('pazator_gemini_api_key'));
  }
  if (localStorage.getItem('pazator_gemini_model') && !localStorage.getItem(GEMINI_MODEL_KEY)) {
    localStorage.setItem(GEMINI_MODEL_KEY, localStorage.getItem('pazator_gemini_model'));
  }

  var MODELS = [
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-pro-exp-03-25', name: 'Gemini 2.5 Pro (exp)' },
    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash (preview)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
  ];

  function getApiKey() { return localStorage.getItem(GEMINI_API_KEY_KEY) || ''; }
  function setApiKey(key) { localStorage.setItem(GEMINI_API_KEY_KEY, key); }
  function getModel() { return localStorage.getItem(GEMINI_MODEL_KEY) || DEFAULT_MODEL; }
  function setModel(model) { localStorage.setItem(GEMINI_MODEL_KEY, model); }

  async function chat(messages, signal) {
    var apiKey = getApiKey();
    var model = getModel();
    if (!apiKey) throw new Error('Gemini API key not configured.');

    var systemInstruction = '';
    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (msg.role === 'system') {
        systemInstruction += msg.content + '\n';
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      }
    }

    var requestBody = { contents: contents };
    if (systemInstruction.trim()) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
    }

    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
        signal: signal || undefined
      }
    );

    if (!response.ok) {
      var errorText;
      try { var errorJson = await response.json(); errorText = errorJson.error && errorJson.error.message ? errorJson.error.message : JSON.stringify(errorJson); }
      catch (e) { errorText = await response.text(); }
      throw new Error('Gemini API error (' + response.status + '): ' + errorText);
    }

    var data = await response.json();
    var text = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      text = data.candidates[0].content.parts[0].text || '';
    }
    return { content: text };
  }

  async function streamChat(messages, onChunk, signal) {
    var apiKey = getApiKey();
    var model = getModel();
    if (!apiKey) throw new Error('Gemini API key not configured.');

    var systemInstruction = '';
    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (msg.role === 'system') { systemInstruction += msg.content + '\n'; }
      else if (msg.role === 'assistant') { contents.push({ role: 'model', parts: [{ text: msg.content }] }); }
      else { contents.push({ role: 'user', parts: [{ text: msg.content }] }); }
    }

    var requestBody = { contents: contents };
    if (systemInstruction.trim()) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
    }

    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':streamGenerateContent?alt=sse',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(requestBody),
        signal: signal
      }
    );

    if (!response.ok) {
      var errorText;
      try { var errorJson = await response.json(); errorText = errorJson.error && errorJson.error.message ? errorJson.error.message : JSON.stringify(errorJson); }
      catch (e) { errorText = await response.text(); }
      throw new Error('Gemini API error (' + response.status + '): ' + errorText);
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
              if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content &&
                  parsed.candidates[0].content.parts) {
                for (var pi = 0; pi < parsed.candidates[0].content.parts.length; pi++) {
                  var t = parsed.candidates[0].content.parts[pi].text || '';
                  fullText += t;
                  if (onChunk) onChunk(t, fullText);
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
    name: 'Gemini',
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
    window.pazatorAI.register('gemini', provider);
  }
})();
