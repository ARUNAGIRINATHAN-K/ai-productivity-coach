const CATEGORY_DOMAINS = {
  Coding: [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackblitz.com',
    'vscode.dev',
    'codepen.io',
    'stackshare.io'
  ],
  Learning: [
    'coursera.org',
    'edx.org',
    'udemy.com',
    'khanacademy.org',
    'pluralsight.com',
    'nptel.ac.in',
    'w3schools.com',
    'developer.mozilla.org'
  ],
  Social: [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'reddit.com',
    'linkedin.com',
    'tiktok.com'
  ],
  Entertainment: [
    'youtube.com',
    'netflix.com',
    'spotify.com',
    'hulu.com',
    'primevideo.com',
    'twitch.tv'
  ],
  Communication: [
    'slack.com',
    'teams.microsoft.com',
    'discord.com',
    'mail.google.com',
    'outlook.live.com',
    'zoom.us',
    'meet.google.com'
  ],
  Shopping: ['amazon.com', 'ebay.com', 'etsy.com', 'flipkart.com'],
  News: ['nytimes.com', 'bbc.com', 'cnn.com', 'theguardian.com']
};

const CATEGORY_KEYWORDS = [
  { keywords: ['docs', 'notion', 'confluence'], category: 'Productivity' },
  { keywords: ['blog', 'news'], category: 'News' },
  { keywords: ['video', 'stream'], category: 'Entertainment' }
];

let cachedUsage = {};
let pieChart = null;

function normalizeDomain(domain) {
  if (!domain) return '';
  const trimmed = domain.trim().toLowerCase();
  return trimmed.startsWith('www.') ? trimmed.slice(4) : trimmed;
}

function domainMatches(normalizedDomain, target) {
  const normalizedTarget = normalizeDomain(target);
  return (
    normalizedDomain === normalizedTarget ||
    normalizedDomain.endsWith(`.${normalizedTarget}`)
  );
}

function domainToCategory(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return 'Other';

  for (const [category, domains] of Object.entries(CATEGORY_DOMAINS)) {
    if (domains.some(target => domainMatches(normalized, target))) {
      return category;
    }
  }

  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return category;
    }
  }

  return 'Other';
}

function renderPieChart(ctx, dataObj) {
  if (!ctx || !window.Chart) return;
  const labels = Object.keys(dataObj);
  const data = Object.values(dataObj);

  if (!labels.length) {
    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }
    return;
  }

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            '#2563eb',
            '#16a34a',
            '#f97316',
            '#a855f7',
            '#facc15',
            '#0891b2',
            '#ef4444'
          ]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

async function fetchUsage() {
  return new Promise(resolve => {
    chrome.storage.local.get(['usage'], data => resolve(data.usage || {}));
  });
}

async function resetUsage() {
  await chrome.storage.local.set({ usage: {} });
  cachedUsage = {};
  await main();
}

function formatSecondsAsMinSec(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

function computeProductivity(usage, productiveDomains) {
  const entries = Object.entries(usage);
  if (!entries.length) return 0;

  const totalSeconds = entries.reduce((sum, [, sec]) => sum + sec, 0);
  if (!totalSeconds) return 0;

  const productiveSeconds = entries.reduce((sum, [domain, sec]) => {
    const normalized = normalizeDomain(domain);
    const explicitMatch = productiveDomains.some(target =>
      domainMatches(normalized, target)
    );
    if (explicitMatch) return sum + sec;

    const category = domainToCategory(normalized);
    return category === 'Coding' || category === 'Learning'
      ? sum + sec
      : sum;
  }, 0);

  return Math.min(100, Math.round((productiveSeconds / totalSeconds) * 100));
}

function buildCategoryUsage(usage) {
  return Object.entries(usage).reduce((acc, [domain, seconds]) => {
    const category = domainToCategory(domain);
    acc[category] = (acc[category] || 0) + Math.round(seconds);
    return acc;
  }, {});
}

async function sendToAI(usage) {
  const aiOut = document.getElementById('ai-output');
  if (!aiOut) return;

  if (!usage || !Object.keys(usage).length) {
    aiOut.innerText = 'No data yet. Browse a few sites and try again!';
    return;
  }

  aiOut.innerText = 'Thinking...';
  const payload = Object.entries(usage).map(([domain, seconds]) => ({
    domain,
    time: Number((seconds / 60).toFixed(1))
  }));

  try {
    const resp = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usage: payload })
    });

    if (!resp.ok) throw new Error(`AI server error (${resp.status})`);

    const data = await resp.json();
    if (data.analysis) {
      aiOut.innerText = data.analysis;
    } else if (data.advice) {
      aiOut.innerText = data.advice;
    } else if (data.error) {
      aiOut.innerText = `AI server error: ${data.error}`;
    } else {
      aiOut.innerText = 'AI server returned an unexpected response.';
    }
  } catch (err) {
    aiOut.innerText = 'Unable to contact AI server. Run server/app.py and ensure CORS is enabled.';
    console.error(err);
  }
}

async function renderUsage() {
  const usage = await fetchUsage();
  cachedUsage = usage;

  const scoreEl = document.getElementById('score-val');
  const sitesList = document.getElementById('sites-list');
  const pieCtx = document.getElementById('pie')?.getContext('2d');

  const productiveDomains = [
    'github.com',
    'stackoverflow.com',
    'colab.research.google.com',
    'coursera.org',
    'edx.org',
    'udemy.com',
    'nptel.ac.in'
  ];

  const score = computeProductivity(usage, productiveDomains);
  if (scoreEl) scoreEl.innerText = `${score}`;

  const categoryUsage = buildCategoryUsage(usage);
  renderPieChart(pieCtx, categoryUsage);

  if (!sitesList) return;
  sitesList.innerHTML = '';

  const sorted = Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!sorted.length) {
    const emptyLi = document.createElement('li');
    emptyLi.innerText = 'No browsing data yet.';
    sitesList.appendChild(emptyLi);
    return;
  }

  sorted.forEach(([domain, sec]) => {
    const li = document.createElement('li');
    li.innerText = `${domain} — ${formatSecondsAsMinSec(sec)}`;
    sitesList.appendChild(li);
  });
}

async function main() {
  await renderUsage();
}

function bindEvents() {
  const aiBtn = document.getElementById('get-ai');
  const resetBtn = document.getElementById('reset');

  if (aiBtn) {
    aiBtn.addEventListener('click', () => sendToAI(cachedUsage));
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetUsage());
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await main();
});
