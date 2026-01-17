// F1 News Web App - Multi-Feed Version

const FEEDS = [
    {
        name: 'F1Tribe Aggregator',
        url: 'https://f1tribe.com/feedme/go-working.php?v=17591122wtwet89473',
        type: 'json',
        enabled: true
    },
    {
        name: 'Formula1.com',
        url: 'https://www.formula1.com/en/latest/all.xml',
        type: 'rss',
        enabled: true
    },
    {
        name: 'Autosport F1',
        url: 'https://www.autosport.com/rss/feed/f1',
        type: 'rss',
        enabled: true
    },
    {
        name: 'RaceFans',
        url: 'https://www.racefans.net/feed/',
        type: 'rss',
        enabled: true
    },
    {
        name: 'PlanetF1',
        url: 'https://www.planetf1.com/feed/',
        type: 'rss',
        enabled: true
    }
];

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'f1_seen_articles';
const AUTO_REFRESH_KEY = 'f1_auto_refresh';
const FEED_SETTINGS_KEY = 'f1_feed_settings';

let articles = [];
let seenArticleIds = new Set();
let autoRefreshEnabled = true;
let refreshTimer = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSeenArticles();
    loadFeedSettings();
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

// Load feed settings
function loadFeedSettings() {
    const stored = localStorage.getItem(FEED_SETTINGS_KEY);
    if (stored) {
        try {
            const settings = JSON.parse(stored);
            FEEDS.forEach(feed => {
                if (settings[feed.name] !== undefined) {
                    feed.enabled = settings[feed.name];
                }
            });
        } catch (e) {
            console.error('Error loading feed settings:', e);
        }
    }
}

// Save feed settings
function saveFeedSettings() {
    const settings = {};
    FEEDS.forEach(feed => {
        settings[feed.name] = feed.enabled;
    });
    localStorage.setItem(FEED_SETTINGS_KEY, JSON.stringify(settings));
}

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

// Parse RSS feed to articles
async function parseRSSFeed(xmlText, sourceName) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    const items = xmlDoc.querySelectorAll('item');
    const articles = [];
    
    items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        
        // Create unique ID from link or title
        const id = `${sourceName}-${link || title}`.replace(/[^a-zA-Z0-9]/g, '-');
        
        // Parse date
        let timestamp = Date.now();
        if (pubDate) {
            const date = new Date(pubDate);
            if (!isNaN(date.getTime())) {
                timestamp = date.getTime();
            }
        }
        
        // Calculate relative time
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        let timeStr = '';
        if (diffMins < 1) {
            timeStr = 'Just now';
        } else if (diffMins < 60) {
            timeStr = `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            timeStr = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            timeStr = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            timeStr = new Date(timestamp).toLocaleDateString();
        }
        
        // Clean up description (remove HTML tags)
        const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
        
        articles.push({
            id: id,
            title: title.trim(),
            summary: cleanDescription.substring(0, 200) + (cleanDescription.length > 200 ? '...' : ''),
            link: link.trim(),
            category: 'General',
            timestamp: timeStr,
            source: sourceName,
            priority: 'medium',
            pubDate: Math.floor(timestamp / 1000)
        });
    });
    
    return articles;
}

// Fetch news from all feeds
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
    
    const allArticles = [];
    const enabledFeeds = FEEDS.filter(feed => feed.enabled);
    
    // Fetch all feeds in parallel
    const feedPromises = enabledFeeds.map(async (feed) => {
        try {
            const response = await fetch(feed.url);
            if (!response.ok) {
                console.error(`Failed to fetch ${feed.name}: ${response.status}`);
                return [];
            }
            
            if (feed.type === 'json') {
                const data = await response.json();
                if (data.success && data.articles) {
                    return data.articles.map(article => ({
                        ...article,
                        source: article.source || feed.name
                    }));
                }
            } else if (feed.type === 'rss') {
                const xmlText = await response.text();
                return await parseRSSFeed(xmlText, feed.name);
            }
            
            return [];
        } catch (err) {
            console.error(`Error fetching ${feed.name}:`, err);
            return [];
        }
    });
    
    try {
        const results = await Promise.all(feedPromises);
        results.forEach(feedArticles => {
            allArticles.push(...feedArticles);
        });
        
        // Sort by pubDate (newest first)
        allArticles.sort((a, b) => b.pubDate - a.pubDate);
        
        // Remove duplicates based on similar titles
        const uniqueArticles = [];
        const seenTitles = new Set();
        
        allArticles.forEach(article => {
            const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                uniqueArticles.push(article);
            }
        });
        
        // Find new articles
        const newArticles = uniqueArticles.filter(article => isNewArticle(article.id));
        
        // Send notifications for new articles
        if (newArticles.length > 0 && Notification.permission === 'granted') {
            sendNotifications(newArticles);
        }
        
        // Mark all articles as seen
        uniqueArticles.forEach(article => markArticleAsSeen(article.id));
        
        // Update articles
        articles = uniqueArticles;
        
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
                icon: 'icon.png',
                badge: 'icon.png',
                tag: article.id,
                requireInteraction: false,
                silent: false
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
                openArticle(article.link);
            };
        }, index * 500);
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
            <div class="article" onclick="openArticle('${escapeHtml(article.link)}')">
                <div class="article-header">
                    <div class="article-source">${escapeHtml(article.source)}</div>
                    <div class="article-time">${escapeHtml(article.timestamp)}</div>
                </div>
                <div class="article-title">${escapeHtml(article.title)}</div>
                <div class="article-summary">${escapeHtml(article.summary)}</div>
                <div class="article-footer">
                    <span class="badge badge-${article.category.toLowerCase()}">${escapeHtml(article.category)}</span>
                    ${article.priority && article.priority.toLowerCase() === 'high' ? '<span class="badge badge-priority">⚡ High Priority</span>' : ''}
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
    
    const enabledCount = FEEDS.filter(f => f.enabled).length;
    
    if (Notification.permission === 'granted' && active) {
        statusDot.className = 'status-dot';
        statusText.textContent = `${enabledCount} Feeds Active`;
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
            new Notification('🏁 F1 News', {
                body: 'Notifications enabled! You\'ll be notified of new F1 articles from multiple sources.',
                icon: 'icon.png'
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
        refreshNews();
    }
});

// Service Worker registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('ServiceWorker registration failed:', err);
    });
}
