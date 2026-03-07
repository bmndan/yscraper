// ==UserScript==
// @name         Y2 -> Memento
// @namespace    bmndan
// @version      1.0
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
  const API = `https://api.mementodatabase.com/v1/libraries/${LIBRARY_ID}/entries`;

  const URL_FIELD = 0;
  const PUBLISHED_FIELD = 41;

  function clean(s) {
    return String(s || '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getToken() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: TOKEN_URL,
        onload: r => {
          if (r.status === 200) resolve(clean(r.responseText));
          else reject(new Error('token load failed: ' + r.status));
        },
        onerror: () => reject(new Error('token request failed'))
      });
    });
  }

  function getDateText() {
    const el = document.querySelector('[class*="report-ad_createdAt__"]');
    if (!el) return null;

    const m = clean(el.textContent).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    return m ? m[0] : null;
  }

  function parseDateToTimestamp(text) {
    const m = String(text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) return null;

    let y = +m[3];
    if (y < 100) y += 2000;

    return Date.UTC(y, +m[2] - 1, +m[1], 0, 0, 0);
  }

  async function create() {
    const token = await getToken();
    const dateText = getDateText();
    const date = parseDateToTimestamp(dateText);

    if (!date) {
      alert('date not found');
      return;
    }

    const payload = {
      fields: [
        { id: URL_FIELD, value: location.href.split('?')[0] },
        { id: PUBLISHED_FIELD, value: date }
      ]
    };

    const r = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    alert('status ' + r.status + '\n\n' + text);
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
    btn.style.padding = '10px 14px';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.background = '#673ab7';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';

    btn.onclick = () => {
      create().catch(err => alert(String(err && err.stack ? err.stack : err)));
    };

    document.body.appendChild(btn);
  }

  if (document.body) addButton();
  else window.addEventListener('load', addButton);
})();