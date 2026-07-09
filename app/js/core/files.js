(function () {
  'use strict';

  function getServer() {
    try {
      var cfg = JSON.parse(localStorage.getItem('pazator_sync_config') || 'null');
      var token = localStorage.getItem('pazator_auth_token');
      return cfg && token ? { url: cfg.url.replace(/\/+$/, ''), token: token } : null;
    } catch (e) { return null; }
  }

  function uploadBase64(name, mimeType, base64Data, entityId, entityStore) {
    return new Promise(function (resolve, reject) {
      var server = getServer();
      if (!server) { resolve(null); return; }

      // Strip data: prefix if present
      var raw = base64Data;
      if (raw.indexOf('base64,') !== -1) raw = raw.split('base64,')[1];
      if (raw.indexOf(',') !== -1) raw = raw.split(',')[1];

      fetch(server.url + '/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + server.token
        },
        body: JSON.stringify({
          name: name,
          mimeType: mimeType || 'application/octet-stream',
          data: raw,
          entityId: entityId || null,
          entityStore: entityStore || null
        })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { reject(new Error(e.error || 'Upload failed')); });
        return r.json();
      }).then(function (result) {
        resolve(server.url + '/api/files/' + result.id);
      }).catch(function (err) {
        reject(err);
      });
    });
  }

  function getFileUrl(fileId, serverUrl) {
    var s = serverUrl || (getServer() ? getServer().url : '');
    return s ? s + '/api/files/' + fileId : null;
  }

  function getFileMeta(fileId) {
    var server = getServer();
    if (!server) return Promise.reject(new Error('No PZLS connection'));
    return fetch(server.url + '/api/files/meta/' + fileId, {
      headers: { 'Authorization': 'Bearer ' + server.token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Failed to get file meta');
      return r.json();
    });
  }

  function getEntityFiles(entityId, entityStore) {
    var server = getServer();
    if (!server) return Promise.resolve([]);
    return fetch(server.url + '/api/files?entityId=' + encodeURIComponent(entityId) + '&entityStore=' + encodeURIComponent(entityStore), {
      headers: { 'Authorization': 'Bearer ' + server.token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Failed to list files');
      return r.json().then(function (d) { return d.files || []; });
    });
  }

  function deleteFile(fileId) {
    var server = getServer();
    if (!server) return Promise.reject(new Error('No PZLS connection'));
    return fetch(server.url + '/api/files/' + fileId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + server.token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Failed to delete file');
      return r.json();
    });
  }

  window.pazatorFile = {
    uploadBase64: uploadBase64,
    getFileUrl: getFileUrl,
    getFileMeta: getFileMeta,
    getEntityFiles: getEntityFiles,
    deleteFile: deleteFile
  };
})();
