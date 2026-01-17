// F1 News Web App - Main JavaScript

const FEED_URL = 'https://f1tribe.com/feedme/go-working.php?v=17591122wtwet89473';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'f1_seen_articles';
const AUTO_REFRESH_KEY = 'f1_auto_refresh';

let articles = [];
let seenArticleIds = new Set();
let autoRefreshEnabled = true;
let refreshTimer = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSeenArticles();
    checkNotificationPermission();
    checkInstallPrompt();
    
    // Load auto-refresh preference
    const savedAutoRefresh = localStorage.getItem(AUTO_REFRESH_KEY);
    if (savedAutoRefresh !== null) {
        autoRefreshEnabled = savedAutoRefresh === 'true';
    }
    updateAutoRefreshButton();
    
    // Initial load
    refreshNews();
    
    // Start auto-refresh if enabled
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }
    
    // Pull to refresh
    let touchStartY = 0;
    let isPulling = false;
    
    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            touchStartY = e.touches[0].clientY;
            isPulling = true;
        }
    });
    
    document.addEventListener('touchmove', (e) => {
        if (isPulling && window.scrollY === 0) {
            const touchY = e.touches[0].clientY;
            const pullDistance = touchY - touchStartY;
            
            if (pullDistance > 100) {
                isPulling = false;
                refreshNews();
            }
        }
    });
    
    document.addEventListener('touchend', () => {
        isPulling = false;
    });
});

// Load seen articles from localStorage
function loadSeenArticles() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            seenArticleIds = new Set(JSON.parse(stored));
        } catch (e) {
            console.error('Error loading seen articles:', e);
            seenArticleIds = new Set();
        }
    }
}

// Save seen articles to localStorage
function saveSeenArticles() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seenArticleIds]));
}

// Mark article as seen
function markArticleAsSeen(articleId) {
    seenArticleIds.add(articleId);
    saveSeenArticles();
}

// Check if article is new
function isNewArticle(articleId) {
    return !seenArticleIds.has(articleId);
}

// Fetch news from API
async function refreshNews() {
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = document.getElementById('refresh-icon');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const articlesContainer = document.getElementById('articles');
    const empty = document.getElementById('empty');
    
    // Show loading state
    if (articles.length === 0) {
        loading.style.display = 'block';
        articlesContainer.style.display = 'none';
        empty.style.display = 'none';
    }
    error.style.display = 'none';
    
    // Disable refresh button and animate
    refreshBtn.disabled = true;
    refreshIcon.style.animation = 'spin 1s linear infinite';
    
    try {
        const response = await fetch(FEED_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load feed');
        }
        
        // Find new articles
        const newArticles = data.articles.filter(article => isNewArticle(article.id));
        
        // Send notifications for new articles
        if (newArticles.length > 0 && Notification.permission === 'granted') {
            sendNotifications(newArticles);
        }
        
        // Mark all articles as seen
        data.articles.forEach(article => markArticleAsSeen(article.id));
        
        // Update articles
        articles = data.articles;
        
        // Update UI
        updateArticlesDisplay();
        updateLastUpdate();
        updateArticleCount();
        
        // Hide loading
        loading.style.display = 'none';
        
        if (articles.length === 0) {
            empty.style.display = 'block';
            articlesContainer.style.display = 'none';
        } else {
            empty.style.display = 'none';
            articlesContainer.style.display = 'block';
        }
        
    } catch (err) {
        console.error('Error fetching news:', err);
        error.textContent = `Failed to load news: ${err.message}`;
        error.style.display = 'block';
        loading.style.display = 'none';
        
        if (articles.length === 0) {
            empty.style.display = 'block';
        }
    } finally {
        // Re-enable refresh button
        refreshBtn.disabled = false;
        refreshIcon.style.animation = '';
    }
}

// Send browser notifications
function sendNotifications(newArticles) {
    // Limit to 5 notifications to avoid spam
    const articlesToNotify = newArticles.slice(0, 5);
    
    articlesToNotify.forEach((article, index) => {
        // Delay each notification slightly
        setTimeout(() => {
            const notification = new Notification('🏁 New F1 News', {
                body: `${article.source}: ${article.title}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23E10600" width="100" height="100"/><text y="75" x="50" text-anchor="middle" font-size="60" fill="white" font-family="Arial Black">F1</text></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23E10600" width="100" height="100"/><text y="75" x="50" text-anchor="middle" font-size="60" fill="white" font-family="Arial Black">F1</text></svg>',
                tag: article.id,
                requireInteraction: false,
                silent: false
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
                openArticle(article.link);
            };
        }, index * 500); // 500ms delay between notifications
    });
}

// Display articles in UI
function updateArticlesDisplay() {
    const container = document.getElementById('articles');
    
    if (articles.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = articles.map(article => {
        const isNew = isNewArticle(article.id);
        
        return `
            <div class="article" onclick="openArticle('${article.link}')">
                <div class="article-header">
                    <div class="article-source">${escapeHtml(article.source)}</div>
                    <div class="article-time">${escapeHtml(article.timestamp)}</div>
                </div>
                <div class="article-title">${escapeHtml(article.title)}</div>
                <div class="article-summary">${escapeHtml(article.summary)}</div>
                <div class="article-footer">
                    <span class="badge badge-${article.category.toLowerCase()}">${escapeHtml(article.category)}</span>
                    ${article.priority.toLowerCase() === 'high' ? '<span class="badge badge-priority">⚡ High Priority</span>' : ''}
                    ${isNew ? '<span class="badge new-badge">✨ NEW</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Open article in new tab
function openArticle(url) {
    window.open(url, '_blank');
}

// Update last update time
function updateLastUpdate() {
    const lastUpdateEl = document.getElementById('last-update');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
    lastUpdateEl.textContent = timeStr;
}

// Update article count
function updateArticleCount() {
    const countEl = document.getElementById('article-count');
    countEl.textContent = articles.length;
}

// Auto-refresh controls
function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(refreshNews, REFRESH_INTERVAL);
    updateStatusIndicator(true);
}

function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    updateStatusIndicator(false);
}

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    localStorage.setItem(AUTO_REFRESH_KEY, autoRefreshEnabled.toString());
    
    if (autoRefreshEnabled) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
    
    updateAutoRefreshButton();
}

function updateAutoRefreshButton() {
    const btn = document.getElementById('auto-refresh-btn');
    const icon = document.getElementById('auto-icon');
    const text = document.getElementById('auto-text');
    
    if (autoRefreshEnabled) {
        icon.textContent = '⏸️';
        text.textContent = 'Pause';
        btn.title = 'Pause auto-refresh';
    } else {
        icon.textContent = '▶️';
        text.textContent = 'Resume';
        btn.title = 'Resume auto-refresh';
    }
}

function updateStatusIndicator(active) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (Notification.permission === 'granted' && active) {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Notifications ON';
    } else if (Notification.permission === 'granted' && !active) {
        statusDot.className = 'status-dot disabled';
        statusText.textContent = 'Paused';
    } else if (Notification.permission === 'denied') {
        statusDot.className = 'status-dot disabled';
        statusText.textContent = 'Notifications OFF';
    } else {
        statusDot.className = 'status-dot disabled';
        statusText.textContent = 'Enable Notifications';
    }
}

// Notification permission handling
function checkNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('Notifications not supported');
        return;
    }
    
    const prompt = document.getElementById('notification-prompt');
    
    if (Notification.permission === 'default') {
        prompt.style.display = 'flex';
    } else {
        prompt.style.display = 'none';
    }
    
    updateStatusIndicator(autoRefreshEnabled);
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Your browser does not support notifications');
        return;
    }
    
    try {
        const permission = await Notification.requestPermission();
        checkNotificationPermission();
        
        if (permission === 'granted') {
            // Send test notification
            new Notification('🏁 F1 News', {
                body: 'Notifications enabled! You\'ll be notified of new F1 articles.',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23E10600" width="100" height="100"/><text y="75" x="50" text-anchor="middle" font-size="60" fill="white" font-family="Arial Black">F1</text></svg>'
            });
        }
    } catch (err) {
        console.error('Error requesting notification permission:', err);
    }
}

// Check if should show install prompt
function checkInstallPrompt() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.navigator.standalone === true;
    const prompt = document.getElementById('install-prompt');
    
    // Show install prompt for iOS users not in standalone mode
    if (isIOS && !isInStandaloneMode) {
        prompt.style.display = 'block';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && autoRefreshEnabled) {
        // Refresh when page becomes visible
        refreshNews();
    }
});

// Service Worker registration for better offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('ServiceWorker registration failed:', err);
    });
}
