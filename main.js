// ========================================
// FocusTube — Main Application Logic
// ========================================

let player;
let progressTracker = null;
let currentPlaylistId = "";
let currentVideoIndex = 0;
let playlistLoaded = false;
let studySessionInterval = null;
let lastSoughtId = "";
let cloudSyncTimer = null; // Debounce cloud sync
let checkPlaylistRetries = 0; // Retry counter for playlist loading
let playerSessionId = 0; // Incremented on each player init to cancel stale retries

// --- Data Layer ---
let savedData;
let dataRecoveryRequired = false;
try {
    const raw = localStorage.getItem('playlearn_data');
    savedData = FocusTubeSecurity.normalizeData(raw ? JSON.parse(raw) : { courses: {} });
} catch (err) {
    dataRecoveryRequired = true;
    // Keep the original storage untouched so a malformed backup can be recovered.
    savedData = FocusTubeSecurity.normalizeData({ courses: {} });
    window.addEventListener('DOMContentLoaded', () => alert('Saved data could not be read safely. The original browser data has not been overwritten. Restore a valid backup before making changes.'));
}

let courseData = { id: "", title: "", videos: [], videosProgress: {}, notes: {} };

// --- Firebase Config Object ---
// User must paste their Firebase config here
const firebaseConfig = {
  apiKey: "AIzaSyBJF3av9wODz8r_tu-xwdvZ1Y8tjcI0nnc",
  authDomain: "focustube1-36ac7.firebaseapp.com",
  projectId: "focustube1-36ac7",
  storageBucket: "focustube1-36ac7.firebasestorage.app",
  messagingSenderId: "378393453266",
  appId: "1:378393453266:web:55e0892b397a163645430b",
  measurementId: "G-H8BBPD0R4G"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch (err) {
    if (!/already exists/.test(err.message)) {
        console.error('Firebase initialization error', err.stack);
    }
}

const AuthService = {
    loginWithGoogle: async () => {
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "API_KEY") {
            alert("Firebase is not configured yet! Please create a Firebase project and paste the config keys in main.js.");
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            const result = await firebase.auth().signInWithPopup(provider);
            if (result.user) {
            // onAuthStateChanged will handle routing
                // onAuthStateChanged will handle the rest (merge data, render dashboard)
            }
        } catch (error) {
            console.error("Login failed", error);
            if (error.code !== 'auth/popup-closed-by-user') {
                alert("Login failed: " + error.message);
            }
        }
    },
    logout: async () => {
        if (firebaseConfig.apiKey === "API_KEY") return;
        try {
            await firebase.auth().signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    },
    syncDataToCloud: async (uid) => {
        if (firebaseConfig.apiKey === "API_KEY") return;
        if (dataRecoveryRequired) return;
        try {
            await firebase.firestore().collection("users").doc(uid).set(savedData);
        } catch (err) {
            console.error("Error syncing to cloud:", err);
        }
    },
    fetchDataFromCloud: async (uid) => {
        if (firebaseConfig.apiKey === "API_KEY") return null;
        try {
            const doc = await firebase.firestore().collection("users").doc(uid).get();
            if (doc.exists) return FocusTubeSecurity.normalizeData(doc.data());
        } catch (err) {
            console.error("Error fetching from cloud:", err);
        }
        return null;
    }
};

// Global Auth State Observer
if (firebaseConfig.apiKey !== "API_KEY") {
    let isFirstAuthStateCheck = true;

    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            savedData.authLevel = 'cloud';
            
            try {
                const cloudData = await AuthService.fetchDataFromCloud(user.uid);
                if (cloudData) {
                    // Merge cloud data with local
                    // Use cloud name only if we don't have a local name
                    if (!savedData.userName && cloudData.userName) {
                        savedData.userName = cloudData.userName;
                    }
                    // LOCAL courses win over cloud (local is more recent)
                    // Cloud-only courses are still added
                    savedData.courses = { ...(cloudData.courses || {}), ...(savedData.courses || {}) };
                    savedData.totalStudyTime = Math.max(savedData.totalStudyTime || 0, cloudData.totalStudyTime || 0);
                }
            } catch (err) { console.warn("Cloud sync warning:", err); }

            // Fallback to Google display name if still no name
            if (!savedData.userName) {
                savedData.userName = user.displayName || "User";
            }

            if (!dataRecoveryRequired) localStorage.setItem('playlearn_data', JSON.stringify(savedData));
            updateAuthUI(user);
            
            // Route appropriately based on where we are
            const isCreatorActive = document.getElementById('creator-panel')?.classList.contains('active');
            const isOnLanding = landingScreen?.classList.contains('active');
            
            if (isCreatorActive && isOnLanding) {
                // If they just logged in from the Creator tab, take them to Creator screen
                initCreatorDashboard();
            } else {
                // Otherwise, normal login to Learner Dashboard
                renderDashboard();
            }
        } else {
            if (savedData.authLevel === 'cloud') {
                savedData.authLevel = 'local';
            }
            updateAuthUI(null);
        }
        isFirstAuthStateCheck = false;
    });
}

function updateAuthUI(user) {
    const loginSyncBtn = document.getElementById('login-sync-btn');
    const logoutBtn    = document.getElementById('logout-btn');
    const profileAuthStat = document.getElementById('profile-auth-status');
    
    if (user) {
        if(loginSyncBtn) loginSyncBtn.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'block';
        if(profileAuthStat) {
            profileAuthStat.innerText = 'Cloud Synced ✔️';
            profileAuthStat.style.color = '#10b981'; // Green
        }
    } else {
        if(loginSyncBtn) loginSyncBtn.style.display = 'block';
        if(logoutBtn) logoutBtn.style.display = 'none';
        if(profileAuthStat) {
            profileAuthStat.innerText = 'Local Session';
            profileAuthStat.style.color = 'var(--accent)';
        }
    }
}

// --- Screen & DOM Refs ---
const landingScreen    = document.getElementById('landing-screen');
const welcomeScreen    = document.getElementById('welcome-screen');
const courseScreen     = document.getElementById('course-screen');
const creatorScreen    = document.getElementById('creator-dashboard-screen');

const learnerTab       = document.getElementById('learner-tab');
const creatorTab       = document.getElementById('creator-tab');
const learnerPanel     = document.getElementById('learner-panel');
const creatorPanel     = document.getElementById('creator-panel');
const usernameInput    = document.getElementById('username-input');
const saveNameBtn      = document.getElementById('save-name-btn');
const greetingText     = document.getElementById('greeting-text');
const startBtn         = document.getElementById('start-btn');
const backBtn          = document.getElementById('back-btn');
const playlistInput    = document.getElementById('playlist-input');
const courseTitleInput = document.getElementById('course-title-input');
const videoListEl      = document.getElementById('video-list');
const totalProgressBar = document.getElementById('total-progress-bar');
const progressText     = document.getElementById('progress-text');
const currentVideoFill = document.getElementById('current-video-fill');
const notesListEl      = document.getElementById('notes-list');
const notesInput       = document.getElementById('notes-input');
const saveNoteBtn      = document.getElementById('save-note-btn');
const addTimestampBtn  = document.getElementById('add-timestamp-btn');
const dashboardGrid    = document.getElementById('dashboard-course-grid');
const totalTimeStat    = document.getElementById('total-time-stat');
const lastStudiedStat  = document.getElementById('last-studied-stat');
const toggleImportBtn  = document.getElementById('toggle-import-btn');
const importPanel      = document.getElementById('import-panel');
const cancelImportBtn  = document.getElementById('cancel-import-btn');
const userAvatar       = document.getElementById('user-avatar');
const sidebarTitle     = document.getElementById('sidebar-course-title');
const themeToggle      = document.getElementById('theme-toggle');
const profileDropdown  = document.getElementById('profile-dropdown');
const profileName      = document.getElementById('profile-name');
const profileAuthStat  = document.getElementById('profile-auth-status');
const renameUserBtn    = document.getElementById('rename-user-btn');
const resetDataBtn     = document.getElementById('reset-data-btn');
const loginSyncBtn     = document.getElementById('login-sync-btn');
const logoutBtn        = document.getElementById('logout-btn');
const googleLoginBtn   = document.getElementById('google-login-btn');
const activityTime     = document.getElementById('activity-total-time');
const activityCount    = document.getElementById('activity-course-count');
const activityLast     = document.getElementById('activity-last-course');
const setFocusBtn      = document.getElementById('set-focus-btn');
const backupDataBtn    = document.getElementById('backup-data-btn');
const restoreDataBtn   = document.getElementById('restore-data-btn');
const restoreInput     = document.getElementById('restore-input');
const focusWarningModal = document.getElementById('focus-warning-modal');
const focusWarningDesc  = document.getElementById('focus-warning-desc');
const focusCourseList   = document.getElementById('focus-course-list');
const closeFocusBtn     = document.getElementById('close-focus-warning-btn');
const footerSupportLink = document.getElementById('footer-support-link');
const completionModal  = document.getElementById('completion-modal');
const closeCompletionBtn = document.getElementById('close-completion-btn');
const compTime         = document.getElementById('comp-time');
const compNotes        = document.getElementById('comp-notes');

// --- YouTube API Bootstrap ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

function onYouTubeIframeAPIReady() {
}

// ========================================
//  INIT
// ========================================
window.addEventListener('DOMContentLoaded', async () => {
    // Restore theme
    const savedTheme = localStorage.getItem('playlearn_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').textContent = savedTheme === 'light' ? '🌙 Dark' : '☀️ Light';
    document.getElementById('landing-theme-toggle').textContent = savedTheme === 'light' ? '🌙' : '☀️';

    updateAuthUI(null);

    // Check for shared course link first (?course=XXXXX)
    const hasSharedCourse = await checkForSharedCourse();
    
    // Show the correct screen if no shared course link
    if (!hasSharedCourse) {
        if (!savedData.userName) {
            show(landingScreen);
        } else {
            renderDashboard();
        }
    }
});

function show(screen, pushHistory = true) {
    [landingScreen, welcomeScreen, courseScreen, creatorScreen].forEach(s => {
        if(s) s.classList.remove('active');
    });
    screen.classList.add('active');
    
    // Push state so browser back button works within the app
    const screenName = screen === landingScreen ? 'landing' 
                     : screen === courseScreen ? 'course' 
                     : screen === creatorScreen ? 'creator'
                     : 'dashboard';
    // Avoid duplicate history entries
    const currentState = history.state?.screen;
    if (pushHistory && currentState !== screenName) {
        history.pushState({ screen: screenName }, '', '');
    }
}

// Escape text for the remaining HTML templates, including quoted attributes.
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

// Handle browser back button
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.screen) {
        if (e.state.screen === 'dashboard') {
            if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
            stopProgressTracker();
            saveCurrentProgress();
            saveToLocalStorage();
            show(welcomeScreen, false);
            renderDashboard();
        } else if (e.state.screen === 'landing') {
            show(landingScreen, false);
        } else if (e.state.screen === 'course') {
            show(courseScreen, false);
        }
    } else {
        // No state = initial page, show dashboard or landing
        if (savedData.userName) {
            show(welcomeScreen, false);
            renderDashboard();
        } else {
            show(landingScreen, false);
        }
    }
});

// Replace initial history state so back doesn't leave the app
history.replaceState({ screen: 'initial' }, '', '');

// ========================================
//  THEME TOGGLE (shared by landing + dashboard)
// ========================================
const landingThemeToggle = document.getElementById('landing-theme-toggle');

function applyThemeUI(theme) {
    themeToggle.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
    landingThemeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('playlearn_theme', next);
    applyThemeUI(next);
}

themeToggle.addEventListener('click', toggleTheme);
landingThemeToggle.addEventListener('click', toggleTheme);

// ========================================
//  PROFILE DROPDOWN
// ========================================
userAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('open');
});
document.addEventListener('click', () => {
    profileDropdown?.classList.remove('open');
    document.getElementById('creator-dropdown')?.classList.remove('open');
});
profileDropdown.addEventListener('click', e => e.stopPropagation());

renameUserBtn.addEventListener('click', () => {
    // Replace button with an input field
    const container = renameUserBtn.parentElement;
    renameUserBtn.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = savedData.userName;
    inp.className = 'inline-edit-input';
    inp.style.margin = '0 0.5rem';
    container.insertBefore(inp, renameUserBtn.nextSibling);
    inp.focus();
    inp.select();
    
    const commit = () => {
        const v = inp.value.trim();
        if (v) {
            savedData.userName = v;
            saveToLocalStorage();
        }
        inp.remove();
        renameUserBtn.style.display = '';
        profileDropdown.classList.remove('open');
        renderDashboard();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keypress', ev => { if (ev.key === 'Enter') commit(); });
});


setFocusBtn.addEventListener('click', () => {
    // Replace button with an input field
    const container = setFocusBtn.parentElement;
    setFocusBtn.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = 1;
    inp.max = 50;
    inp.value = savedData.maxCourses || 5;
    inp.className = 'inline-edit-input';
    inp.style.margin = '0 0.5rem';
    container.insertBefore(inp, setFocusBtn.nextSibling);
    inp.focus();
    inp.select();
    
    const commit = () => {
        const v = parseInt(inp.value);
        if (v && v > 0) {
            savedData.maxCourses = v;
            saveToLocalStorage();
        }
        inp.remove();
        setFocusBtn.style.display = '';
        profileDropdown.classList.remove('open');
        renderDashboard();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keypress', ev => { if (ev.key === 'Enter') commit(); });
});

// Reset — two-click safety
let resetPending = false;
resetDataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!resetPending) {
        resetPending = true;
        resetDataBtn.textContent = '⚠️ Click again to confirm';
        resetDataBtn.style.color = '#ef4444';
        setTimeout(() => {
            resetPending = false;
            resetDataBtn.textContent = '🗑️ Reset All Data';
            resetDataBtn.style.color = '';
        }, 3000);
    } else {
        stopProgressTracker(); // Stop intervals to prevent race condition re-saves
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        savedData = {}; // Clear in-memory state
        localStorage.removeItem('playlearn_data');
        localStorage.removeItem('playlearn_theme');
        location.reload();
    }
});

// Backup & Restore
backupDataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dataStr = JSON.stringify(savedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focustube_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    profileDropdown.classList.remove('open');
});

restoreDataBtn.addEventListener('click', () => {
    restoreInput.click();
});

restoreInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > FocusTubeSecurity.MAX_BACKUP_BYTES) {
        alert('Backup is too large. Maximum size is 10 MB.');
        restoreInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = FocusTubeSecurity.normalizeData(JSON.parse(event.target.result));
            // A backup cannot choose authentication state or an executable support link.
            importedData.authLevel = firebase.auth().currentUser ? 'cloud' : 'local';

            if (confirm("⚠️ This will OVERWRITE all your current courses and notes. Are you sure you want to restore this backup?")) {
                savedData = importedData;
                dataRecoveryRequired = false;
                saveToLocalStorage();
                location.reload();
            }
        } catch (err) {
            alert("Error: " + err.message);
        }
    };
    reader.readAsText(file);
    profileDropdown.classList.remove('open');
});

// ========================================
//  LANDING PAGE
// ========================================
learnerTab.addEventListener('click', () => {
    // If the user is already logged in as a learner, take them back to the dashboard immediately
    if (savedData.userName) {
        renderDashboard();
    } else {
        learnerTab.classList.add('active');
        creatorTab.classList.remove('active');
        learnerPanel.classList.add('active');
        creatorPanel.classList.remove('active');
    }
});
creatorTab.addEventListener('click', () => {
    creatorTab.classList.add('active');
    learnerTab.classList.remove('active');
    creatorPanel.classList.add('active');
    learnerPanel.classList.remove('active');
});

// Navigate from Dashboard to Creator
document.getElementById('open-creator-dashboard-btn').addEventListener('click', () => {
    profileDropdown.classList.remove('open');
    initCreatorDashboard();
});

saveNameBtn.addEventListener('click', handleSaveName);
usernameInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSaveName(); });

if (googleLoginBtn) googleLoginBtn.addEventListener('click', AuthService.loginWithGoogle);
if (loginSyncBtn) loginSyncBtn.addEventListener('click', AuthService.loginWithGoogle);
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        AuthService.logout().then(() => {
            // Clear local data — it's safe in the cloud
            localStorage.removeItem('playlearn_data');
            location.reload(); // Will show landing page since userName is gone
        });
    });
}

function handleSaveName() {
    const name = usernameInput.value.trim();
    if (!name) return;
    savedData.userName = name;
    
    const limitInp = document.getElementById('focus-limit-input');
    if (limitInp) {
        savedData.maxCourses = parseInt(limitInp.value) || 5;
    }

    saveToLocalStorage();
    renderDashboard();
}

// ========================================
//  CREATOR MODE
// ========================================
const SHARING_PAUSED_MESSAGE = 'Shared courses are temporarily unavailable while access protection is updated. Your personal courses and cloud sync still work.';
const CreatorService = {
    extractPlaylistId: (url) => {
        const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    },

    generateCourseId: () => {
        return 'ft_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    },

    createCourse: async () => {
        // Do not create records, store passwords, or publish new share links.
        throw new Error(SHARING_PAUSED_MESSAGE);
    },

    fetchPlaylistVideos: async (playlistId) => {
        // Use noembed to get playlist info — fetch first video to verify playlist exists
        // Then build video list from YouTube embed API
        const videos = [];
        try {
            // Try loading the playlist via a temporary hidden player
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${playlistId}&format=json`);
            if (!response.ok) throw new Error("Playlist not found");
        } catch (e) {
            // Still try to proceed — oembed might not support playlists directly
        }
        
        // We'll let the student's player handle the actual video list
        // Save the playlistId so the player can load it
        return [{ id: playlistId, title: "Playlist" }];
    },

    loadSharedCourse: async () => {
        // Client containment only. Firestore rules must also block old clients.
        throw new Error(SHARING_PAUSED_MESSAGE);
    },

    incrementAccess: async () => {
        // Sharing is paused: no anonymous counter writes.
    }
};

// --- Creator Form Elements ---
const creatorGoogleBtn = document.getElementById('creator-google-btn');
const creatorLoginSection = document.getElementById('creator-login-section');
const creatorFormSection = document.getElementById('creator-form-section');
const creatorPlaylistInput = document.getElementById('creator-playlist-input');
const creatorTitleInput = document.getElementById('creator-title-input');
const creatorPasswordInput = document.getElementById('creator-password-input');
const createCourseBtn = document.getElementById('create-course-btn');
const creatorResult = document.getElementById('creator-result');
const shareLinkOutput = document.getElementById('share-link-output');
const copyLinkBtn = document.getElementById('copy-link-btn');

// --- Shared Course Modal Elements ---
const sharedCourseModal = document.getElementById('shared-course-modal');
const sharedCourseTitle = document.getElementById('shared-course-title');
const sharedCourseMeta = document.getElementById('shared-course-meta');
const sharedPasswordSection = document.getElementById('shared-password-section');
const sharedPasswordInput = document.getElementById('shared-password-input');
const sharedErrorMsg = document.getElementById('shared-error-msg');
const sharedAccessBtn = document.getElementById('shared-access-btn');
const sharedCancelBtn = document.getElementById('shared-cancel-btn');

let pendingSharedCourse = null; // stores loaded shared course data
let pendingSharedCourseId = null;

// No creator sign-in is needed while sharing is paused.
if (creatorGoogleBtn) creatorGoogleBtn.disabled = true;

// Update creator tab when auth changes -> now initCreatorDashboard
async function initCreatorDashboard() {
    const user = firebase.auth().currentUser;
    if (!user) {
        show(landingScreen);
        creatorTab.click();
        return;
    }
    
    // Show the creator screen
    show(creatorScreen);

    // Set avatar & name
    const creatorAvatar = document.getElementById('creator-avatar');
    const creatorDropdownName = document.getElementById('creator-dropdown-name');
    const creatorGreeting = document.getElementById('creator-greeting');
    
    const userName = user.displayName || 'Creator';
    if (creatorAvatar) creatorAvatar.textContent = userName.charAt(0).toUpperCase();
    if (creatorDropdownName) creatorDropdownName.textContent = userName;
    if (creatorGreeting) creatorGreeting.textContent = `Welcome, ${userName.split(' ')[0]}`;

    // No shared-course collection reads while sharing is paused.
    document.getElementById('creator-existing-course').style.display = 'none';
    document.getElementById('creator-new-form').style.display = 'none';
    document.getElementById('creator-content-title').textContent = 'Shared courses temporarily unavailable';
    document.getElementById('creator-stat-courses').textContent = 'Paused';
    document.getElementById('creator-stat-privacy').textContent = 'Unavailable';
}

// Creator Theme Toggle
document.getElementById('creator-theme-toggle')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('playlearn_theme', newTheme);
    
    const icon = newTheme === 'light' ? '☀️' : '🌙';
    document.getElementById('theme-toggle').textContent = icon + ' ' + (newTheme === 'light' ? 'Light' : 'Dark');
    document.getElementById('landing-theme-toggle').textContent = icon;
    document.getElementById('creator-theme-toggle').textContent = icon;
});

// Creator Profile Dropdown logic
const creatorAvatar = document.getElementById('creator-avatar');
const creatorDropdown = document.getElementById('creator-dropdown');
if (creatorAvatar && creatorDropdown) {
    creatorAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        creatorDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => creatorDropdown.classList.remove('open'));
    creatorDropdown.addEventListener('click', e => e.stopPropagation());
}

// Creator Dropdown Actions
document.getElementById('creator-switch-learner-btn')?.addEventListener('click', () => {
    creatorDropdown?.classList.remove('open');
    if (savedData.userName) {
        renderDashboard();
    } else {
        show(landingScreen);
        learnerTab.click();
    }
});

const creatorLogoutBtn = document.getElementById('creator-logout-btn');
if (creatorLogoutBtn) {
    creatorLogoutBtn.addEventListener('click', async () => {
        creatorDropdown?.classList.remove('open');
        await AuthService.logout();
        localStorage.removeItem('playlearn_data');
        location.reload(); // Clear session and reload cleanly
    });
}

// Creator: Copy existing course link
const creatorCopyExistingBtn = document.getElementById('creator-copy-existing-btn');
if (creatorCopyExistingBtn) {
    creatorCopyExistingBtn.addEventListener('click', () => {
        const url = document.getElementById('creator-existing-course').dataset.courseUrl;
        navigator.clipboard.writeText(url).then(() => {
            const originalText = creatorCopyExistingBtn.textContent;
            creatorCopyExistingBtn.textContent = '✅ Link Copied!';
            setTimeout(() => { creatorCopyExistingBtn.textContent = originalText; }, 2000);
        });
    });
}

// Shared-course management is paused. Existing records need server-side containment.
// Creation stays disabled even if an old UI event is dispatched programmatically.
if (createCourseBtn) {
    createCourseBtn.disabled = true;
    createCourseBtn.textContent = 'Sharing Temporarily Unavailable';
}

// Creator: Copy link
if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
        shareLinkOutput.select();
        navigator.clipboard.writeText(shareLinkOutput.value).then(() => {
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
        });
    });
}

// --- Shared Course URL Detection ---
async function checkForSharedCourse() {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('course')) return false;
    // No Firestore read, password prompt or link import while sharing is paused.
    alert(SHARING_PAUSED_MESSAGE);
    window.history.replaceState({}, '', window.location.pathname);
    return false;
}

// Defense in depth if stale UI is still present.
if (sharedAccessBtn) {
    sharedAccessBtn.disabled = true;
}

// Shared: Cancel button
if (sharedCancelBtn) {
    sharedCancelBtn.addEventListener('click', () => {
        sharedCourseModal.classList.remove('active');
        window.history.replaceState({}, '', window.location.pathname);
        if (!savedData.userName) {
            show(landingScreen);
        } else {
            renderDashboard();
        }
    });
}

// ========================================
//  DASHBOARD
// ========================================
toggleImportBtn.addEventListener('click', () => {
    importPanel.style.display = importPanel.style.display === 'none' ? 'block' : 'none';
    if (importPanel.style.display === 'block') playlistInput.focus();
});
cancelImportBtn.addEventListener('click', () => {
    importPanel.style.display = 'none';
    playlistInput.value = '';
    courseTitleInput.value = '';
});

startBtn.addEventListener('click', handleNewImport);
playlistInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleNewImport(); });
courseTitleInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleNewImport(); });

backBtn.addEventListener('click', () => {
    if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
    stopProgressTracker();
    saveCurrentProgress();
    saveToLocalStorage();
    forceCloudSync();
    renderDashboard();
});

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function renderDashboard() {
    show(welcomeScreen);
    greetingText.innerText = `${getGreeting()}, ${savedData.userName}`;
    userAvatar.innerText = savedData.userName.charAt(0).toUpperCase();
    profileName.innerText = savedData.userName;

    // Support Link Footer (always show hardcoded developer link)
    footerSupportLink.href = FocusTubeSecurity.SUPPORT_URL;
    footerSupportLink.innerHTML = `💖 Support the Developer`;

    // Topbar stat
    totalTimeStat.innerText = formatHoursMins(savedData.totalStudyTime) + ' studied';
    const lastTitle = savedData.lastAccessedCourseTitle;
    lastStudiedStat.innerText = lastTitle ? `Last studied: ${lastTitle}` : 'Add your first course to get started.';

    // Activity insight cards
    const courseCount = Object.keys(savedData.courses).filter(k => savedData.courses[k].videos && savedData.courses[k].videos.length > 0).length;
    activityTime.innerText = formatHoursMins(savedData.totalStudyTime);
    activityCount.innerText = courseCount;
    activityLast.innerText = lastTitle || '—';

    // Reset import
    importPanel.style.display = 'none';
    playlistInput.value = '';
    courseTitleInput.value = '';

    // Render cards
    dashboardGrid.innerHTML = '';
    const courseIds = Object.keys(savedData.courses);

    if (courseIds.length === 0) {
        dashboardGrid.innerHTML = '<div class="empty-state">No courses yet. Click <strong>+ New Course</strong> to import a YouTube playlist.</div>';
        return;
    }

    courseIds.forEach(cId => {
        const c = savedData.courses[cId];
        if (!c) return;
        if (!c.videos) c.videos = [];
        if (!c.videosProgress) c.videosProgress = {};
        if (!c.notes) c.notes = {};
        if (!c.title) c.title = 'Untitled Course';
        const totalVids = c.videos.length || 0;
        let completed = 0;
        if (totalVids > 0) {
            Object.keys(c.videosProgress).forEach(vId => {
                if (c.videosProgress[vId] && c.videosProgress[vId].completed) completed++;
            });
        }
        const percent = totalVids > 0 ? Math.round((completed / totalVids) * 100) : 0;
        const isDone = totalVids > 0 && percent === 100;
        const title = c.title || 'Untitled Course';
        const thumbnailId = totalVids > 0 && c.videos[0] && FocusTubeSecurity.safeId(c.videos[0].id) ? c.videos[0].id : null;
        const thumbUrl = thumbnailId ? `https://img.youtube.com/vi/${thumbnailId}/mqdefault.jpg` : 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=600';

        const card = document.createElement('div');
        card.className = `course-card${isDone ? ' completed' : ''}`;
        card.innerHTML = `
            <div class="course-card-thumb">
                <div class="card-overlay">
                    <button class="overlay-btn rename" title="Rename">✏️ Rename</button>
                    <button class="overlay-btn export-btn" title="Export Study Guide">📥 Export</button>
                    <button class="overlay-btn delete-btn" title="Delete">🗑️ Delete</button>
                </div>
            </div>
            <div class="course-card-body">
                <h4 class="course-card-title"></h4>
                <div class="course-card-meta">
                    <span>${completed}/${totalVids} modules</span>
                    <span>${percent}%</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${percent}%"></div></div>
            </div>
        `;

        card.querySelector('.course-card-thumb').style.backgroundImage = `url("${thumbUrl}")`;
        card.querySelector('.course-card-title').textContent = title;
        card.querySelector('.course-card-title').title = title;

        // Delete — two-click safety (no confirm dialog)
        const delBtn = card.querySelector('.delete-btn');
        let confirmPending = false;
        delBtn.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            
            if (!confirmPending) {
                // First click: change to confirmation state
                confirmPending = true;
                delBtn.textContent = '⚠️ Sure?';
                delBtn.style.background = 'rgba(239,68,68,0.4)';
                delBtn.style.borderColor = '#ef4444';
                
                // Auto-reset after 3 seconds
                setTimeout(() => {
                    if (confirmPending) {
                        confirmPending = false;
                        delBtn.textContent = '🗑️ Delete';
                        delBtn.style.background = '';
                        delBtn.style.borderColor = '';
                    }
                }, 3000);
            } else {
                // Second click: actually delete
                delete savedData.courses[cId];
                saveToLocalStorage();
                forceCloudSync();
                renderDashboard();
            }
        });

        const renameBtn = card.querySelector('.rename');
        const exportBtn = card.querySelector('.export-btn');
        exportBtn.addEventListener('click', e => {
            e.stopPropagation();
            exportCourseNotes(cId);
        });

        const titleEl = card.querySelector('.course-card-title');
        renameBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (titleEl.querySelector('input')) return;
            const original = savedData.courses[cId].title;
            titleEl.innerHTML = '';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'inline-edit-input';
            inp.value = original;
            titleEl.appendChild(inp);
            inp.focus();
            inp.select();
            const commit = () => {
                const v = inp.value.trim();
                if (v) {
                    savedData.courses[cId].title = v;
                    saveToLocalStorage();
                }
                renderDashboard();
            };
            inp.addEventListener('blur', commit);
            inp.addEventListener('keypress', ev => { if (ev.key === 'Enter') commit(); });
            inp.addEventListener('click', ev => ev.stopPropagation());
        });

        card.addEventListener('click', () => resumeCourse(cId));
        dashboardGrid.appendChild(card);
    });
}

// ========================================
//  IMPORT / LOAD COURSE
// ========================================
function handleNewImport() {
    const inputVal = playlistInput.value.trim();
    const courseName = courseTitleInput.value.trim();
    if (!inputVal) return;

    // 1. Focus Limit Check
    const activeCount = Object.keys(savedData.courses).length;
    if (activeCount >= (savedData.maxCourses || 5)) {
        showFocusWarning();
        return;
    }

    let playlistId = inputVal;
    if (inputVal.includes('list=')) {
        try { playlistId = new URL(inputVal).searchParams.get('list'); }
        catch (e) { playlistId = inputVal.split('list=')[1].split('&')[0]; }
    }
    loadCourseUI(playlistId, courseName);
}

function resumeCourse(playlistId) {
    loadCourseUI(playlistId, null);
}

function loadCourseUI(playlistId, optionalName) {
    if (!FocusTubeSecurity.safeId(playlistId)) {
        alert('Invalid YouTube playlist ID.');
        return;
    }
    currentPlaylistId = playlistId;
    lastSoughtId = ""; // Reset so seek-to-saved-time works on re-entry

    if (savedData.courses[playlistId]) {
        courseData = savedData.courses[playlistId];
        currentVideoIndex = courseData.lastVideoIndex || 0;
        if (optionalName) courseData.title = optionalName;
    } else {
        courseData = {
            id: playlistId,
            title: optionalName || 'Untitled Course',
            videos: [], videosProgress: {}, notes: {}, lastVideoIndex: 0
        };
        savedData.courses[playlistId] = courseData;
    }

    savedData.lastAccessedCourseTitle = courseData.title;
    syncCurrentCourseToStorage();

    sidebarTitle.innerText = courseData.title;
    show(courseScreen);
    videoListEl.innerHTML = '<li class="video-item" style="justify-content:center;color:var(--text-tertiary);padding:2rem;">Loading playlist…</li>';
    initPlaylistPlayer(playlistId);
}

// ========================================
//  YOUTUBE PLAYER
// ========================================
function initPlaylistPlayer(playlistId) {
    playerSessionId++; // Invalidate any pending checkPlaylist retry chains
    if (player && typeof player.destroy === 'function') player.destroy();

    if (!document.getElementById('player')) {
        const wrapper = document.querySelector('.aspect-ratio-wrapper');
        const div = document.createElement('div');
        div.id = 'player';
        wrapper.insertBefore(div, wrapper.firstChild);
    }

    playlistLoaded = false;
    player = new YT.Player('player', {
        height: '100%', width: '100%',
        host: 'https://www.youtube.com',
        playerVars: { 
            playsinline: 1, 
            rel: 0, 
            modestbranding: 1, 
            listType: 'playlist', 
            list: playlistId,
            origin: window.location.origin
        },
        events: { 
            onReady: onPlayerReady, 
            onStateChange: onPlayerStateChange,
            onError: (e) => {
                console.error("YouTube Player Error:", e.data);
                const msg = (e.data === 150 || e.data === 101) 
                    ? "Embedding Restricted. This playlist is private or restricted by its owner."
                    : "Unable to load playlist. Check your internet connection or URL.";
                videoListEl.innerHTML = `<li class="video-item error" style="justify-content:center;color:var(--red);padding:2rem;text-align:center;">${msg}</li>`;
            }
        }
    });

    if (courseData.videos && courseData.videos.length > 0) {
        playlistLoaded = true;
        renderSidebar();
        renderNotes();
        setTimeout(() => loadSpecificVideo(currentVideoIndex), 1000);
    }
}

function checkPlaylist() {
    if (playlistLoaded || !player || typeof player.getPlaylist !== 'function') return;
    const pList = player.getPlaylist();
    if (pList && pList.length > 0) {
        playlistLoaded = true;
        checkPlaylistRetries = 0;
        buildCourseData(pList);
    } else if (checkPlaylistRetries < 20) {
        checkPlaylistRetries++;
        const capturedSession = playerSessionId;
        setTimeout(() => {
            if (playerSessionId === capturedSession) checkPlaylist();
        }, 500);
    } else {
        console.warn("Playlist failed to load after 20 retries");
        checkPlaylistRetries = 0;
    }
}

function onPlayerReady() { checkPlaylist(); }

function onPlayerStateChange(event) {
    checkPlaylist();
    if (event.data === YT.PlayerState.PLAYING) {
        syncVideoIndex();
        startProgressTracker();
    } else {
        stopProgressTracker();
        saveCurrentProgress();
    }
}

function syncVideoIndex() {
    const currentId = player.getVideoData().video_id;
    const index = courseData.videos.findIndex(v => v.id === currentId);
    if (index !== -1 && index !== currentVideoIndex) {
        currentVideoIndex = index;
        courseData.lastVideoIndex = index;
        syncCurrentCourseToStorage();
        renderSidebar();
        renderNotes();
    }

    // Progress Resume (Seek) — Added small delay for reliability
    if (currentId && currentId !== lastSoughtId) {
        lastSoughtId = currentId;
        const progress = courseData.videosProgress[currentId];
        if (progress && progress.watchTime > 0 && !progress.completed) {
            // Seek to saved time
            // Delay seek slightly to ensure player is ready
            setTimeout(() => {
                if (player && typeof player.seekTo === 'function') {
                    player.seekTo(progress.watchTime, true);
                }
            }, 600);
        }
    }
    if (index !== -1 && (!courseData.videos[index].title || courseData.videos[index].title.startsWith('Video '))) {
        const vData = player.getVideoData();
        if (vData && vData.title) {
            courseData.videos[index].title = vData.title;
            syncCurrentCourseToStorage();
            renderSidebar();
        }
    }
}

async function buildCourseData(videoIdsList) {
    if (courseData.videos && courseData.videos.length > 0) return;
    courseData.videos = videoIdsList.map((id, i) => ({ id, title: `Video ${i + 1}` }));
    currentVideoIndex = 0;

    const hasCustomTitle = courseData.title && courseData.title !== 'Untitled Course';
    if (!hasCustomTitle) courseData.title = 'Untitled Course';

    savedData.lastAccessedCourseTitle = courseData.title;
    sidebarTitle.innerText = courseData.title;
    syncCurrentCourseToStorage();
    renderSidebar();
    renderNotes();

    // Fetch individual video titles (throttled — 3 at a time)
    const fetchTitle = async (vid, idx) => {
        try {
            const r = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vid.id}`);
            const data = await r.json();
            if (data?.title) courseData.videos[idx].title = data.title;
        } catch (e) {}
    };
    // Process in batches of 3 — render ONCE per batch to avoid DOM thrashing
    for (let i = 0; i < courseData.videos.length; i += 3) {
        const batch = courseData.videos.slice(i, i + 3);
        await Promise.all(batch.map((vid, j) => fetchTitle(vid, i + j)));
        renderSidebar(); // One render per batch instead of one per video
        if (i + 3 < courseData.videos.length) {
            await new Promise(r => setTimeout(r, 150)); // Rate-limit noembed.com
        }
    }
    syncCurrentCourseToStorage();
}

// ========================================
//  SIDEBAR
// ========================================
function renderSidebar() {
    if (!courseData.videos || !courseData.videos.length) return;
    videoListEl.innerHTML = '';
    let completedCount = 0;

    courseData.videos.forEach((vid, index) => {
        const progress = courseData.videosProgress[vid.id];
        const done = progress && progress.completed;
        if (done) completedCount++;

        const li = document.createElement('li');
        li.className = `video-item${index === currentVideoIndex ? ' active' : ''}`;
        li.innerHTML = `
            <div class="video-thumbnail"></div>
            <div class="video-info">
                <span class="video-title"></span>
                <span class="video-status">${done ? '✓ Done' : (progress && progress.watchTime > 0 ? '◔ In progress' : '○ Not started')}</span>
            </div>
        `;
        const videoTitle = li.querySelector('.video-title');
        videoTitle.textContent = vid.title;
        videoTitle.title = vid.title;
        if (FocusTubeSecurity.safeId(vid.id)) {
            li.querySelector('.video-thumbnail').style.backgroundImage = `url("https://img.youtube.com/vi/${vid.id}/default.jpg")`;
        }
        li.addEventListener('click', () => loadSpecificVideo(index));
        videoListEl.appendChild(li);
    });

    const pct = Math.round((completedCount / courseData.videos.length) * 100);
    totalProgressBar.style.width = `${pct}%`;
    progressText.innerText = `${pct}%`;
}

function loadSpecificVideo(index) {
    currentVideoIndex = index;
    courseData.lastVideoIndex = index;
    syncCurrentCourseToStorage();
    renderSidebar();
    renderNotes();
    if (player && typeof player.playVideoAt === 'function') player.playVideoAt(index);
}

// ========================================
//  PROGRESS TRACKING
// ========================================
function startProgressTracker() {
    stopProgressTracker();
    progressTracker = setInterval(() => {
        saveCurrentProgress();
        updateCurrentVideoBar();
        savedData.totalStudyTime += 1;
        totalTimeStat.innerText = formatHoursMins(savedData.totalStudyTime) + ' studied';
        activityTime.innerText = formatHoursMins(savedData.totalStudyTime);
    }, 1000);
    studySessionInterval = setInterval(saveToLocalStorage, 30000);
}

function stopProgressTracker() {
    if (progressTracker) { clearInterval(progressTracker); progressTracker = null; }
    if (studySessionInterval) { clearInterval(studySessionInterval); studySessionInterval = null; }
}

function saveCurrentProgress() {
    if (!player || typeof player.getCurrentTime !== 'function' || !courseData.videos || !courseData.videos.length) return;
    const t = Math.floor(player.getCurrentTime());
    const d = Math.floor(player.getDuration());
    const vid = courseData.videos[currentVideoIndex].id;
    if (!courseData.videosProgress[vid]) courseData.videosProgress[vid] = { watchTime: 0, completed: false };
    courseData.videosProgress[vid].watchTime = t;
    if (d > 0 && t / d > 0.9) {
        if (!courseData.videosProgress[vid].completed) {
            courseData.videosProgress[vid].completed = true;
            renderSidebar();
            checkCourseCompletion();
        }
    }
}

function checkCourseCompletion() {
    if (courseData.isCompleted) return; // Only celebrate once
    if (!courseData.videos || courseData.videos.length === 0) return;
    
    const allDone = courseData.videos.every(v => 
        courseData.videosProgress[v.id] && courseData.videosProgress[v.id].completed
    );

    if (allDone) {
        courseData.isCompleted = true;
        syncCurrentCourseToStorage();
        triggerCelebration();
    }
}

function triggerCelebration() {
    // 1. Confetti burst
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#FFD700', '#FFA500', '#8b5cf6']
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#FFD700', '#FFA500', '#8b5cf6']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());

    // 2. Populate and show modal
    let totalSecs = 0;
    Object.values(courseData.videosProgress).forEach(p => totalSecs += (p.watchTime || 0));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    compTime.innerText = `${h}h ${m}m`;
    
    let noteCount = 0;
    Object.values(courseData.notes).forEach(cat => noteCount += cat.length);
    compNotes.innerText = noteCount;

    setTimeout(() => {
        completionModal.classList.add('active');
    }, 1000);
}

function showFocusWarning() {
    const max = savedData.maxCourses || 5;
    focusWarningDesc.innerText = `You set a focus limit of ${max} courses to stay productive. Finish or remove a course before starting something new.`;

    // Build course list
    focusCourseList.innerHTML = '';
    Object.values(savedData.courses).forEach(c => {
        const totalVids = c.videos ? c.videos.length : 0;
        let completed = 0;
        if (c.videosProgress) {
            Object.values(c.videosProgress).forEach(p => { if (p.completed) completed++; });
        }
        const pct = totalVids > 0 ? Math.round((completed / totalVids) * 100) : 0;
        const item = document.createElement('div');
        item.className = 'focus-course-item';
        item.innerHTML = `
            <span class="course-dot"></span>
            <span class="focus-course-title"></span>
            <span class="course-pct">${pct}% done</span>
        `;
        item.querySelector('.focus-course-title').textContent = c.title || 'Untitled Course';
        focusCourseList.appendChild(item);
    });

    focusWarningModal.classList.add('active');
}

closeFocusBtn.addEventListener('click', () => {
    focusWarningModal.classList.remove('active');
});

closeCompletionBtn.addEventListener('click', () => {
    completionModal.classList.remove('active');
    renderDashboard();
});

function updateCurrentVideoBar() {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const t = player.getCurrentTime();
    const d = player.getDuration();
    if (d > 0) currentVideoFill.style.width = `${(t / d) * 100}%`;
}

// ========================================
//  NOTES
// ========================================
addTimestampBtn.addEventListener('click', () => {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const time = Math.floor(player.getCurrentTime());
    notesInput.value = `[${formatTime(time)}] ` + notesInput.value;
    notesInput.focus();
    player.pauseVideo();
});

saveNoteBtn.addEventListener('click', () => {
    const text = notesInput.value.trim();
    if (!text || !courseData.videos || !courseData.videos.length) return;
    const match = text.match(/^\[(\d+):(\d+)\]/);
    let time = Math.floor(player.getCurrentTime?.() || 0);
    if (match) time = parseInt(match[1]) * 60 + parseInt(match[2]);

    const videoId = courseData.videos[currentVideoIndex].id;
    if (!courseData.notes[videoId]) courseData.notes[videoId] = [];
    courseData.notes[videoId].push({ time, text: text.replace(/^\[\d+:\d+\]\s*/, '') });
    courseData.notes[videoId].sort((a, b) => a.time - b.time);
    syncCurrentCourseToStorage();
    renderNotes();
    notesInput.value = '';
});

function renderNotes() {
    notesListEl.innerHTML = '';
    if (!courseData.videos || !courseData.videos.length) return;
    const notes = courseData.notes[courseData.videos[currentVideoIndex].id] || [];
    if (!notes.length) {
        notesListEl.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:2rem 0;font-size:0.8125rem;">No notes yet. Use the timestamp button to mark key moments.</p>';
        return;
    }
    notes.forEach((note, noteIndex) => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `
            <span class="note-timestamp"></span>
            <p class="note-text"></p>
            <button class="note-delete-btn" title="Delete note">×</button>
        `;
        const timestamp = div.querySelector('.note-timestamp');
        const safeTime = typeof note.time === 'number' && Number.isFinite(note.time) && note.time >= 0 ? note.time : 0;
        timestamp.textContent = formatTime(safeTime);
        timestamp.addEventListener('click', () => jumpToTime(safeTime));
        div.querySelector('.note-text').textContent = note.text;
        div.querySelector('.note-delete-btn').addEventListener('click', () => {
            const videoId = courseData.videos[currentVideoIndex].id;
            courseData.notes[videoId].splice(noteIndex, 1);
            syncCurrentCourseToStorage();
            renderNotes();
        });
        notesListEl.appendChild(div);
    });
}

function jumpToTime(time) {
    if (player && typeof player.seekTo === 'function') {
        player.seekTo(time, true);
        player.playVideo();
    }
}

// ========================================
//  STORAGE
// ========================================
function syncCurrentCourseToStorage() {
    savedData.courses[currentPlaylistId] = courseData;
    saveToLocalStorage();
}
function saveToLocalStorage() {
    if (dataRecoveryRequired) return;
    try {
        localStorage.setItem('playlearn_data', JSON.stringify(savedData));
    } catch (e) {
        console.warn("localStorage quota exceeded", e);
    }
    // Debounce cloud sync — max once per 60 seconds
    if (savedData.authLevel === 'cloud' && firebaseConfig.apiKey !== "API_KEY") {
        if (!cloudSyncTimer) {
            cloudSyncTimer = setTimeout(() => {
                cloudSyncTimer = null;
                const user = firebase.auth().currentUser;
                if (user) {
                    AuthService.syncDataToCloud(user.uid);
                }
            }, 60000);
        }
    }
}

// Force immediate cloud sync (used on back button, logout, etc.)
function forceCloudSync() {
    if (dataRecoveryRequired) return;
    if (cloudSyncTimer) { clearTimeout(cloudSyncTimer); cloudSyncTimer = null; }
    if (savedData.authLevel === 'cloud' && firebaseConfig.apiKey !== "API_KEY") {
        const user = firebase.auth().currentUser;
        if (user) AuthService.syncDataToCloud(user.uid);
    }
}

// ========================================
//  UTILS
// ========================================
document.getElementById('export-notes-btn').addEventListener('click', () => {
    exportCourseNotes(currentPlaylistId);
});

function exportCourseNotes(courseId) {
    const course = savedData.courses[courseId];
    if (!course) return;

    let md = `# ${course.title}\n`;
    md += `*Generated by FocusTube Study Guide — ${new Date().toLocaleDateString()}*\n\n`;

    let hasNotes = false;
    course.videos.forEach((vid, idx) => {
        const notes = course.notes[vid.id];
        if (notes && notes.length > 0) {
            hasNotes = true;
            md += `## Lesson ${idx + 1}: ${vid.title}\n`;
            notes.forEach(note => {
                md += `- **[${formatTime(note.time)}]**: ${note.text}\n`;
            });
            md += `\n---\n\n`;
        }
    });

    if (!hasNotes) {
        alert("You haven't taken any notes for this course yet!");
        return;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.title.replace(/[^a-z0-9]/gi, '_')}_Notes.md`;
    a.click();
    URL.revokeObjectURL(url);
}

function formatTime(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
function formatHoursMins(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
                }
