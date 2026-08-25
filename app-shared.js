import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------------------------------------------------------------
// PASTE YOUR OWN FIREBASE CONFIG HERE (see README.md, Step 1-3)
// This is the ONLY place it needs to go — every page imports it from here.
// ---------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// "database name" tags each history line so multiple lists can share one
// history collection and still be told apart. One constant per list.
export const DATABASE_NAME = 'meal_prep';
export const COMPONENTS_DATABASE_NAME = 'components';

// Pages shown in the sidebar. Add a new { href, label, icon } entry here
// whenever you add a new page — every page's sidebar updates automatically.
export const PAGES = [
  { href: 'index.html', label: 'Stock List', icon: 'list' },
  { href: 'components.html', label: 'Components', icon: 'chip' },
  { href: 'history.html', label: 'History Log', icon: 'clock' }
];

const ICONS = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>',
  chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/><line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="22"/><line x1="15" y1="18" x2="15" y2="22"/><line x1="2" y1="9" x2="6" y2="9"/><line x1="2" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="22" y2="9"/><line x1="18" y1="15" x2="22" y2="15"/></svg>'
};

export let db, auth;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (err) {
  console.error('Firebase init failed:', err);
}

export const state = { userEmail: null };

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Builds one history log line from a Firestore history entry (as returned
// by onSnapshot, e.g. { date, time, user, database, item, prevQty, newQty,
// category?, partNumber? }). Base format (unchanged, used by the Stock List):
//   date, time, user, database name, item name, prev quantity, new quantity
// When an entry carries a category and/or part number (currently just the
// Components list), two extra trailing columns are appended:
//   ..., new quantity, category, part number
// Older/plain entries have no category/partNumber fields, so they render
// exactly as before — this is backwards compatible with existing logs.
export function formatHistoryLine(entry) {
  const { date, time, user, database, item, prevQty, newQty, category, partNumber } = entry;
  let line = `${date}, ${time}, ${user}, ${database}, ${item}, ${prevQty}, ${newQty}`;
  if (category !== undefined || partNumber !== undefined) {
    line += `, ${category || ''}, ${partNumber || ''}`;
  }
  return line;
}

// Writes one entry to the shared "history" collection. `extra` lets callers
// tag which list this belongs to (defaults to the Stock List) and, for the
// Components list, attach the item's category and part/model number so
// they show up as extra columns in the log. Notes are deliberately left out
// of history lines — free text with commas/newlines would break the
// line-per-entry .txt format; notes only live on the item itself.
export async function logChange(itemName, prevQty, newQty, extra = {}) {
  if (!db) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB'); // dd/mm/yyyy
  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS
  const entry = {
    date: dateStr,
    time: timeStr,
    user: state.userEmail || 'unknown',
    database: extra.database || DATABASE_NAME,
    item: itemName,
    prevQty,
    newQty,
    sortKey: now.getTime()
  };
  if (extra.category !== undefined) entry.category = extra.category;
  if (extra.partNumber !== undefined) entry.partNumber = extra.partNumber;
  try {
    await addDoc(collection(db, "history"), entry);
  } catch (err) {
    console.error('Could not write history entry:', err);
  }
}

// ---------------------------------------------------------------
// Sidebar: injects the nav markup into #sidebarNav and wires the
// mobile hamburger toggle. Call once per page with the current page's
// filename (e.g. 'history.html') so it can highlight the active link.
// ---------------------------------------------------------------
export function renderSidebar(activeHref) {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;
  nav.innerHTML = PAGES.map(p => `
    <a class="nav-link ${p.href === activeHref ? 'active' : ''}" href="${p.href}">
      ${ICONS[p.icon] || ''}<span>${p.label}</span>
    </a>
  `).join('');

  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (menuBtn && sidebar && backdrop) {
    const close = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('open');
    });
    backdrop.addEventListener('click', close);
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }
}

// ---------------------------------------------------------------
// Auth gate: wires the sign-in form (shared markup across pages),
// shows/hides #authCard vs #appWrap, and calls onSignedIn() every
// time a user is authenticated so the page can start its own
// Firestore listeners.
// ---------------------------------------------------------------
export function initAuthGate({ activePage, onSignedIn }) {
  renderSidebar(activePage);

  const authCard = document.getElementById('authCard');
  const authSub = document.getElementById('authSub');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authBtn = document.getElementById('authBtn');
  const authError = document.getElementById('authError');
  const appWrap = document.getElementById('appWrap');
  const signedInAs = document.getElementById('signedInAs');
  const signOutBtn = document.getElementById('signOutBtn');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  if (!auth) {
    if (authError) authError.textContent = 'Firebase config missing or invalid — see README.md to finish setup.';
    return;
  }

  authBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authError.textContent = '';
    if (!email || !password) { authError.textContent = 'Enter both your email and password.'; return; }

    authBtn.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(err.code)) {
        authError.textContent = "That email/password combination isn't recognised — check with whoever set this up.";
      } else if (err.code === 'auth/too-many-requests') {
        authError.textContent = 'Too many attempts — wait a few minutes and try again.';
      } else {
        authError.textContent = 'Could not sign in — check your connection and try again.';
      }
    } finally {
      authBtn.disabled = false;
    }
  });

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = authEmail.value.trim();
      authError.textContent = '';
      if (!email) { authError.textContent = 'Enter your email above first, then click "Forgot your password?" again.'; return; }
      try {
        await sendPasswordResetEmail(auth, email);
        authSub.textContent = `A password reset link has been sent to ${email}.`;
      } catch (err) {
        authError.textContent = 'Could not send a reset email for that address.';
      }
    });
  }

  signOutBtn.addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.userEmail = user.email;
      authCard.classList.add('hidden');
      appWrap.classList.remove('hidden');
      if (signedInAs) signedInAs.textContent = `Signed in as ${user.email}`;
      onSignedIn(user);
    } else {
      state.userEmail = null;
      appWrap.classList.add('hidden');
      authCard.classList.remove('hidden');
    }
  });
}
