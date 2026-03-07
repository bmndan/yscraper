// ==UserScript==
// @name         Y2 -> Memento Create
// @namespace    bmndan
// @version      1.0.0
// @match        *://*.yad2.co.il/realestate/item/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/bmndan/yscraper/main/y2-memento.user.js
// @updateURL    https://raw.githubusercontent.com/bmndan/yscraper/main/y2-memento.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TOKEN_URL = 'https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt';
  const LIBRARY_ID = 'jRdNE9YJP';
  const API = 'https://api.mementodatabase.com/v1/libraries/' + LIBRARY_ID + '/entries';

  const URL_FIELD_ID = 0;
  const PUBLISHED_FIELD_ID = 41;

  function clean(s) {
    return String(s || '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getTokenFromRepo() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: TOKEN_URL,
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            const token = clean(res.responseText);
            if (!token) return reject(new Error('token.txt empty'));
            resolve(token);
          } else {
            reject(new Error('Token fetch failed: ' + res.status));
          }
        },
        onerror: function () {
          reject(new Error('Token request failed'));
        }
      });
    });
  }

  function extractPublishedText() {
    const el = document.querySelector('[class*="report-ad_createdAt__"]');
    if (!el) return null;

    const txt = clean(el.textContent);
    const m = txt.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
    return m ? m[1] : null;
  }

  function waitForPublishedText(timeoutMs) {
    return new Promise(resolve => {
      const start = Date.now();

      function check() {
        const txt = extractPublishedText();
        if (txt) return resolve(txt);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(check, 250);
      }

      check();
    });
  }

  function parseDateToTimestamp(text) {
    const m = String(text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) return null;

    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);

    if (year < 100) year += 2000;

    return Date.UTC(year, month - 1, day, 0, 0, 0);
  }

  async function createEntry() {
    const token = await getTokenFromRepo();
    const url = location.href.split('?')[0];
    const publishedText = await waitForPublishedText(5000);
    const publishedTimestamp = parseDateToTimestamp(publishedText);

    if (!publishedText) {
      alert('Published date not found');
      return;
    }

    if (!publishedTimestamp) {
      alert('Date parse failed: ' + publishedText);
      return;
    }

    const payload = {
      fields: [
        { id: URL_FIELD_ID, value: url },
        { id: PUBLISHED_FIELD_ID, value: publishedTimestamp }
      ]
    };

    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    alert('Status: ' + res.status + '\n\nResponse:\n' + text);
  }

  function addButton() {
    if (document.getElementById('y2-memento-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'y2-memento-btn';
    btn.textContent = 'Create in Memento';
    btn.style.position = 'fixed';
    btn.style.top = '20px';
    btn.style.right = '20px';
    btn.style.zIndex = '999999';
    btn.style.padding = '12px 16px';
    btn.style.background = '#673ab7';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.fontSize = '16px';
    btn.style.cursor = 'pointer';

    btn.onclick = () => {
      createEntry().catch(err => {
        alert('Script error:\n' + (err && err.stack ? err.stack : err));
      });
    };

    document.body.appendChild(btn);
  }

  function waitForBody() {
    if (document.body) addButton();
    else setTimeout(waitForBody, 300);
  }

  waitForBody();
})();