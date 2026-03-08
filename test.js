// ==UserScript==
// @name         Y2 Test
// @namespace    bmndan
// @version      1.8
// @match        *://*/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      raw.githubusercontent.com
// @connect      api.mementodatabase.com
// @downloadURL  https://raw.githubusercontent.com/bmndan/yscraper/main/test.js
// @updateURL    https://raw.githubusercontent.com/bmndan/yscraper/main/test.js
// ==/UserScript==

(function () {
  'use strict';

  const TOKEN_URL = 'https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt';
  const LIBRARY_ID = 'jRdNE9YJP';
  const LIBRARY_URL = `https://api.mementodatabase.com/v1/libraries/${LIBRARY_ID}`;
  const DOMAIN_KEY = 'target_domain';

  function clean(s) {
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\r\n\t ]+/g, '')
      .trim();
  }

  function maskToken(token) {
    token = clean(token);
    if (token.length <= 10) return token;
    return token.slice(0, 6) + '...' + token.slice(-4);
  }

  function getStoredDomain() {
    return GM_getValue(DOMAIN_KEY, '');
  }

  function setStoredDomain(value) {
    GM_setValue(DOMAIN_KEY, String(value || '').trim());
  }

  function clearStoredDomain() {
    GM_deleteValue(DOMAIN_KEY);
  }

  function getToken() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: TOKEN_URL + '?t=' + Date.now(),
        headers: { 'Cache-Control': 'no-cache' },
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

  function authTest(token) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: LIBRARY_URL,
        headers: {
          'Authorization': token
        },
        onload: r => resolve(r),
        onerror: () => reject('Memento auth test failed')
      });
    });
  }

  async function runAuthTest() {
    const token = await getToken();
    const r = await authTest(token);

    alert(
      'Status: ' + r.status +
      '\nToken length: ' + token.length +
      '\nToken mask: ' + maskToken(token) +
      '\nStored domain: ' + getStoredDomain() +
      '\nCurrent host: ' + location.hostname +
      '\nKeys: ' + GM_listValues().join(', ') +
      '\n\nResponse:\n' + r.responseText
    );
  }

  function addButton(id, text, top, bg, onClick) {
    if (document.getElementById(id)) return;

    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.style =
      `position:fixed;top:${top}px;right:20px;z-index:999999;padding:10px 14px;background:${bg};color:#fff;border:none;border-radius:8px;cursor:pointer;`;
    btn.onclick = onClick;
    document.body.appendChild(btn);
  }

  function init() {
    addButton('y2-show-btn', 'SHOW DOMAIN', 20, '#2196f3', () => {
      alert(
        'Stored domain: ' + getStoredDomain() +
        '\nCurrent host: ' + location.hostname +
        '\nKeys: ' + GM_listValues().join(', ')
      );
    });

    addButton('y2-set-btn', 'SET THIS DOMAIN', 60, '#4caf50', () => {
      setStoredDomain(location.hostname);
      alert('Stored domain set to: ' + getStoredDomain());
      location.reload();
    });

    addButton('y2-change-btn', 'CHANGE DOMAIN', 100, '#9c27b0', () => {
      const current = getStoredDomain();
      const value = prompt('Enter domain/hostname', current || location.hostname);
      if (!value) return;
      setStoredDomain(value);
      alert('Stored domain changed to: ' + getStoredDomain());
      location.reload();
    });

    addButton('y2-clear-btn', 'CLEAR DOMAIN', 140, '#ff9800', () => {
      clearStoredDomain();
      alert('Stored domain cleared');
      location.reload();
    });

    if (getStoredDomain() && location.hostname === getStoredDomain()) {
      addButton('y2-auth-btn', 'TEST AUTH', 180, '#e91e63', () => {
        runAuthTest().catch(err => alert(String(err)));
      });
    }
  }

  if (document.body) init();
  else window.addEventListener('load', init);
})();