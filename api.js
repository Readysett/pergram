/* Per Gram — API client and wallet sign-in.
 *
 * The scanner works with no backend at all: look up a barcode, see the
 * number. That must keep working, because it is the part that is useful
 * to a stranger with no wallet. Signing in adds the week and claims on
 * top; it is never a gate in front of the thing people came for.
 *
 * So every call here degrades. If the API is down or the user is signed
 * out, the app falls back to local storage and says so quietly.
 */

const API = window.PERGRAM_API || 'http://localhost:8787';
const TOKEN_KEY = 'pergram.token.v1';

export const api = {
  get token(){ try { return localStorage.getItem(TOKEN_KEY); } catch(e){ return null; } },
  set token(t){
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
    catch(e){}
  },
  get signedIn(){ return !!this.token; },
};

async function call(path, { method = 'GET', body, auth = false, raw } = {}){
  const headers = {};
  if (body && !raw) headers['Content-Type'] = 'application/json';
  if (auth){
    if (!api.token) throw new Error('not signed in');
    headers.Authorization = 'Bearer ' + api.token;
  }

  const res = await fetch(API + path, {
    method,
    headers,
    body: raw ? body : (body ? JSON.stringify(body) : undefined),
  });

  /* A 401 means the session died — expired, revoked, or the server was
     rebuilt. Clear it rather than leaving the user staring at failures
     they cannot explain. */
  if (res.status === 401){
    api.token = null;
    throw new Error('session expired');
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
  return json;
}

export const health = () => call('/api/health');

/* ---------- sign in ----------
 *
 * VeWorld injects window.vechain. Ask it for an address, get a nonce,
 * have the wallet sign the message, exchange the signature for a token.
 * The signature proves control of the key; nothing is spent.
 */
export async function signIn(){
  /* VeChain wallets sign *certificates*, not Ethereum personal_sign
     messages — that was the first wrong turn. VeWorld exposes
     newConnexSigner(); Sync2 and older setups expose window.connex.
     Both return the signature split from its context: an `annex`
     carrying domain, timestamp and signer, plus the signature itself.
     The full certificate has to be reassembled from the message we sent
     and the annex we got back, or the server has nothing to verify. */
  const GENESIS = {
    main: '0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a',
    test: '0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127',
  };
  const net = (window.PERGRAM_NET === 'test') ? 'test' : 'main';

  const challenge = ([...crypto.getRandomValues(new Uint8Array(24))]
    .map(b => b.toString(16).padStart(2, '0')).join(''));

  const message = {
    purpose: 'identification',
    payload: {
      type: 'text',
      content:
        'Per Gram — prove you control this wallet.\n\n' +
        'Challenge: ' + challenge + '\n\n' +
        'Signing costs nothing and authorises no transaction.',
    },
  };

  let res;
  if (window.vechain && typeof window.vechain.newConnexSigner === 'function'){
    const signer = window.vechain.newConnexSigner(GENESIS[net]);
    res = await signer.signCert(message, {});
  } else if (window.connex && window.connex.vendor){
    res = await window.connex.vendor.sign('cert', message).request();
  } else {
    throw new Error('No VeChain wallet found. Install VeWorld to sign in.');
  }

  /* Connex returns a certificate *response*: the annex plus a signature,
     with purpose and payload dropped because the caller already has
     them. The server has neither, so the full certificate is rebuilt
     here. Prefer any field the wallet did return — some return a
     complete object, and overwriting it would be wrong. */
  const annex = res.annex || res;
  const certificate = {
    purpose:   res.purpose   ?? message.purpose,
    payload:   res.payload   ?? message.payload,
    domain:    res.domain    ?? annex.domain,
    timestamp: res.timestamp ?? annex.timestamp,
    signer:    res.signer    ?? annex.signer,
    signature: res.signature,
  };

  const out = await call('/api/auth/verify', {
    method: 'POST',
    body: { challenge, certificate },
  });

  api.token = out.token;
  return out.wallet;
}

export async function signOut(){
  try { await call('/api/auth/logout', { method: 'POST', auth: true }); } catch(e){}
  api.token = null;
}

export const me       = () => call('/api/me', { auth: true });
export const getWeek  = () => call('/api/week', { auth: true });

export const postClaim = (receipt, items) =>
  call('/api/claim', { method: 'POST', auth: true, body: { receipt, items } });

/* Flagging works signed out on purpose: a misclassification report is
   useful whoever sends it, and there is nothing to gain by faking one. */
export const postFlag = (barcode, said, note) =>
  call('/api/flag', { method: 'POST', body: { barcode, said, note } });

export async function postReceipt(file, scanned){
  const fd = new FormData();
  fd.append('image', file);
  fd.append('scanned', JSON.stringify(scanned || []));
  return call('/api/receipt', { method: 'POST', auth: true, raw: true, body: fd });
}
