/* Bridges the scanner to the API.
 *
 * Kept in its own module rather than folded into index.html for one
 * reason: the scanner must keep working with no backend, no wallet and
 * no network. If this file fails to load, the app still looks up
 * barcodes and still tracks a week locally. Sign-in is additive.
 *
 * The rule throughout: the server is the truth when signed in, the
 * device is the truth when not, and the user is told which.
 */

import { api, signIn, signOut, me, getWeek, postClaim, postFlag, health } from './api.js';

const $ = id => document.getElementById(id);
const acct = $('acct'), who = $('acctWho'), btn = $('signIn');

let serverWeek = null;    // server truth when signed in
let apiUp = false;

/* index.html owns rendering. Expose a hook it can call rather than
   duplicating the render logic here. */
function repaint(){
  if (typeof window.renderWeekFrom === 'function') window.renderWeekFrom(serverWeek);
}

function setStatus(text, on){
  who.textContent = text;
  acct.classList.toggle('on', !!on);
  btn.textContent = on ? 'Sign out' : 'Sign in with wallet';
}

async function refresh(){
  if (!api.signedIn){
    serverWeek = null;
    setStatus('Working offline — this week is stored on this device only', false);
    repaint();
    return;
  }
  try {
    const [account, week] = await Promise.all([me(), getWeek()]);
    serverWeek = week;
    const short = account.wallet.slice(0, 6) + '…' + account.wallet.slice(-4);

    /* Personhood is surfaced before anyone photographs a receipt, not
       after. Finding out you cannot be paid at the end is worse than
       knowing at the start. */
    const p = account.passport;
    setStatus(short + (p && p.ok
      ? ' · verified'
      : ' · not yet verified, points bank until it passes'), true);
    repaint();
  } catch (e){
    if (String(e.message).includes('session expired')){
      setStatus('Signed out — session expired', false);
    } else {
      setStatus('Signed in, but the server is unreachable', false);
    }
    serverWeek = null;
    repaint();
  }
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  const previous = who.textContent;
  try {
    if (api.signedIn){
      await signOut();
    } else {
      who.textContent = 'Check your wallet for a signature request…';
      await signIn();
    }
    await refresh();
  } catch (e){
    who.textContent = e.message || 'Could not sign in';
    setTimeout(() => { who.textContent = previous; }, 4000);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- what index.html calls ---------- */

/* Returns true if the claim went to the server. False means the caller
   should fall back to its local week — never silently drop the entry. */
window.pergramClaim = async function(item){
  if (!api.signedIn || !apiUp) return false;
  try {
    /* A typed quantity is not a receipt, and the backend knows it. Until
       the receipt pipeline is wired to the UI this is marked as such
       rather than dressed up as a verified claim. */
    await postClaim(
      { store: 'manual-entry', txn: null, purchased: Date.now(), total_cents: null,
        image_hash: 'manual:' + item.barcode + ':' + Date.now() },
      [{ barcode: item.barcode, product: item.name, source_key: item.source_key,
         protein_g: item.protein, co2: item.co2, mult: item.mult }],
    );
    await refresh();
    return true;
  } catch (e){
    /* Return the reason, not just failure. A claim that vanishes with no
       explanation is the hardest kind of bug to report. */
    console.warn('claim not accepted:', e.message);
    return e.message || false;
  }
};

window.pergramFlag = async function(barcode, said){
  try { await postFlag(barcode, said, null); return true; }
  catch (e){ return false; }
};

window.pergramSignedIn = () => api.signedIn && apiUp;

(async () => {
  try { await health(); apiUp = true; }
  catch (e){
    apiUp = false;
    setStatus('Working offline — this week is stored on this device only', false);
    btn.style.display = 'none';   // nothing to sign in to
    return;
  }
  await refresh();
})();
