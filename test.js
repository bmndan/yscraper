// ==UserScript==
// @name         Y2 Test
// @namespace    bmndan
// @version      1.3
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

  const DEFAULT_DOMAIN = 'yad2.co.il';
  const ACTIVE_DOMAIN = GM_getValue('y2_domain', DEFAULT_DOMAIN);

  if (!GM_getValue('y2_domain', null)) {
    GM_setValue('y2_domain', DEFAULT_DOMAIN);
  }

  if (!location.hostname.includes(ACTIVE_DOMAIN)) return;

  const TOKEN_URL = 'https://raw.githubusercontent.com/bmndan/yscraper/main/token.txt';

  function clean(s){
    return String(s || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r/g,'')
      .trim();
  }

  function getToken(){
    return new Promise((resolve,reject)=>{
      GM_xmlhttpRequest({
        method:'GET',
        url: TOKEN_URL + '?t=' + Date.now(),
        onload:r=>{
          if(r.status===200) resolve(clean(r.responseText));
          else reject('token load failed ' + r.status);
        },
        onerror:()=>reject('token request failed')
      });
    });
  }

  async function test(){
    const token = await getToken();

    GM_setValue('memento_token_length', token.length);

    alert(
      'Domain: ' + ACTIVE_DOMAIN +
      '\nToken length: ' + token.length +
      '\nStored keys: ' + GM_listValues().join(', ')
    );
  }

  const btn = document.createElement('button');
  btn.textContent = 'TEST STORAGE';
  btn.style =
    'position:fixed;top:60px;right:20px;z-index:999999;padding:10px;background:#2196f3;color:#fff;border:none;border-radius:8px;cursor:pointer;';
  btn.onclick = test;
  document.body.appendChild(btn);

})();