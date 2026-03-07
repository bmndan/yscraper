function getTokenFromPrivateRepo() {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://api.github.com/repos/bmndan/yscraper/contents/token.txt?ref=main',
      headers: {
        'Authorization': 'Bearer ' + GITHUB_PAT,
        'Accept': 'application/vnd.github.raw+json'
      },
      onload: function (res) {
        if (res.status >= 200 && res.status < 300) {
          const token = String(res.responseText || '').trim();
          if (!token) return reject(new Error('token.txt empty'));
          resolve(token);
        } else {
          reject(new Error('GitHub fetch failed: ' + res.status));
        }
      },
      onerror: function () {
        reject(new Error('GitHub request failed'));
      }
    });
  });
}