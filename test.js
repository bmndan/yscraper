// ==UserScript==
// @name         Y2 Test
// @namespace    bmndan
// @version      1.4
// @match        *://*/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @connect      raw.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/bmndan/yscraper/main/test.js
// @updateURL    https://raw.githubusercontent.com/bmndan/yscraper/main/test.js
// ==/UserScript==

(function () {
  'use strict';

  const TOKEN_URL = 'https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt';
  const LIBRARY_ID = 'jRdNE9YJP';
  const API = `https://api.mementodatabase.com/v1/libraries/${LIBRARY_ID}/entries`;

  const URL_FIELD = 0;

  function clean(s) {
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r/g, '')
      .trim();
  }

  const storedDomain = GM_getValue('target_domain', '');

  if (!storedDomain) {
    GM_setValue('target_domain', location.hostname);
    console.log('Stored target_domain:', location.hostname);
  }

  if (location.hostname !== GM_getValue('target_domain', '')) return;

  function getToken() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: TOKEN_URL + '?t=' + Date.now(),
        onload: r => {
          if (r.status === 200) {
            const token = clean(r.responseText);
            if (!token) reject('token empty');
            else resolve(token);
          } else {
            reject('token load failed ' + r.status);
          }
        },
        onerror: () => reject('token request failed')
      });
    });
  }

  async function create() {
    const token = await getToken();
    const url = location.href.split('?')[0];

    const payload = {
      fields: [
        { id: URL_FIELD, value: url }
      ]
    };

    const r = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await r.text();

    alert(
      'Status: ' + r.status +
      '\nToken length: ' + token.length +
      '\nStored domain: ' + GM_getValue('target_domain', '') +
      '\nStored keys: ' + GM_listValues().join(', ') +
      '\n\nResponse:\n' + text
    );
  }

  function addButton() {
    if (document.getElementById('y2-test-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'y2-test-btn';
    btn.textContent = 'TEST → Memento';
    btn.style =
      'position:fixed;top:60px;right:20px;z-index:999999;padding:10px;background:#e91e63;color:#fff;border:none;border-radius:8px;cursor:pointer;';

    btn.onclick = create;
    document.body.appendChild(btn);
  }

  if (document.body) addButton();
  else window.addEventListener('load', addButton);
})();