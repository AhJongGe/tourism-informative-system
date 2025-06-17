function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except space and hyphen
    .replace(/\s+/g, '-')         // Replace spaces with hyphens
    .replace(/-+/g, '-')          // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');     // Trim hyphens from start/end
}

// --- Utilities ---
function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  let cut = text.lastIndexOf(',', maxLen-5);
  if (cut < 0) cut = maxLen-5;
  return text.slice(0, cut) + '.....';
}

// --- Open status calculation ---
function getOpenStatus(hoursObj) {
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const now = dayjs().tz('Asia/Kuching');
  const day = days[now.day()];
  const todayHours = hoursObj ? hoursObj[day] : null;

  if (!todayHours || todayHours.toLowerCase() === 'closed') {
    return { status: 'closed', label: 'Currently Closed', class: 'card-status-closed' };
  }
  const [openStr, closeStr] = todayHours.split('-');
  if (!openStr || !closeStr) return { status: 'closed', label: 'Currently Closed', class: 'card-status-closed' };

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  let openTime = now.hour(openH).minute(openM).second(0);
  let closeTime = now.hour(closeH).minute(closeM).second(0);

  // Handle after-midnight closing
  if (closeTime.isBefore(openTime)) closeTime = closeTime.add(1, 'day');

  if (now.isBefore(openTime)) {
    const diff = openTime.diff(now, 'minute');
    if (diff < 60) return { status: 'opensoon', label: `Opens in ${diff} min`, class: 'card-status-opening' };
    return { status: 'closed', label: 'Currently Closed', class: 'card-status-closed' };
  }
  if (now.isAfter(openTime) && now.isBefore(closeTime)) {
    const diff = closeTime.diff(now, 'minute');
    if (diff < 60) return { status: 'closingsoon', label: `Closes in ${diff} min`, class: 'card-status-closing' };
    return { status: 'open', label: 'Currently Open', class: 'card-status-open' };
  }
  return { status: 'closed', label: 'Currently Closed', class: 'card-status-closed' };
}

// --- Core Logic ---
let placesData = [];
let sectionTags = {};
let activeTags = [];
let labelSearchTerm = '';
let cardSearchTerm = '';
const labelIcons = {};

fetch('/api/places')
  .then(resp => resp.json())
  .then(data => {
    const cat = window.SECTION_CATEGORY;
    placesData = data.filter(place => {
      if (!place.category) return false;
      if (Array.isArray(place.category)) {
        return place.category.includes(cat);
      } else {
        return place.category === cat;
      }
    });

    sectionTags = {};
    placesData.forEach(place => {
      let tag_key = cat + '_tags';
      if (!place[tag_key]) return;
      Object.entries(place[tag_key]).forEach(([section, tags]) => {
        if (!sectionTags[section]) sectionTags[section] = new Set();
        tags.forEach(tag => sectionTags[section].add(tag));
      });
    });

    renderLabels();
    renderCards();
  });

function renderCards() {
  const container = document.getElementById('card-container');
  let filtered = placesData.filter(place =>
    (activeTags.length === 0 ||
      activeTags.every(tag =>
        Object.values(place[window.SECTION_CATEGORY + '_tags'] || {}).some(tagArr => tagArr.includes(tag))
      )
    ) &&
    (
      cardSearchTerm === '' ||
      (place.name && place.name.toLowerCase().includes(cardSearchTerm)) ||
      (place.description && place.description.toLowerCase().includes(cardSearchTerm)) ||
      Object.values(place[window.SECTION_CATEGORY + '_tags'] || {}).some(tagArr => tagArr.some(t => t.toLowerCase().includes(cardSearchTerm)))
    )
  );
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<div style="margin:40px auto;font-size:1.2em;color:#aaa;text-align:center;">No matches found.</div>';
    return;
  }
  filtered.forEach(place => {
    const name = place.name ? truncateText(place.name, 32) : '';
    const description = place.description ? truncateText(place.description, 48) : '';
    let timeAvail = '-';
    if (place.hours) {
      const days = ['sun','mon','tue','wed','thu','fri','sat'];
      const now = dayjs().tz('Asia/Kuching');
      const dayKey = days[now.day()];
      const todayHours = place.hours[dayKey];
      if (todayHours && todayHours.toLowerCase() !== 'closed') {
        timeAvail = todayHours;
      } else {
        timeAvail = 'Closed today';
      }
    }

    // Calculate status object
    let openStatus = { label: '', class: '' };
    if (place.hours) openStatus = getOpenStatus(place.hours);

    let labelSections = '';
    if (place[window.SECTION_CATEGORY + '_tags']) {
      Object.entries(place[window.SECTION_CATEGORY + '_tags']).forEach(([section, tags]) => {
        if (!tags.length) return;
        let sectionTitle = section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        labelSections += `<div class="card-label-section">
          <span class="card-label-section-title">${sectionTitle}:</span>
          <span class="card-label-section-labels">${tags.join(', ')}</span>
        </div>`;
      });
    }
    container.innerHTML += `
      <a href="/place_detail/${slugify(place.name)}" class="card-link" title="View details">
        <div class="card">
          <img src="${place.photo || 'static/images/default.jpg'}" class="card-img" alt="${name}">
          <div class="card-info">
            <div class="card-info-row"><b>Name:</b> ${name}</div>
            <div class="card-info-row"><b>Description:</b> ${description}</div>
            <div class="card-info-row"><b>Time available:</b> ${timeAvail}</div>
            <div class="card-info-row"><span class="${openStatus.class}">${openStatus.label}</span></div>
            <div class="card-labels">${labelSections}</div>
          </div>
        </div>
      </a>
    `;
  });
}

function renderLabels() {
  const chosen = document.getElementById('chosen-labels');
  chosen.innerHTML = '';
  activeTags.forEach(tag => {
    chosen.innerHTML += `
      <div class="label-btn chosen" data-tag="${tag}" onclick="toggleTag('${tag}')">
        <img src="${labelIcons[tag] || 'static/images/label.png'}" alt="">
        <span class="scroll-text">${tag}</span>
      </div>
    `;
  });

  const all = document.getElementById('all-labels');
  all.innerHTML = '';

  Object.entries(sectionTags).forEach(([section, tagSet]) => {
    const filtered = Array.from(tagSet).filter(tag =>
      !activeTags.includes(tag) &&
      (!labelSearchTerm || tag.toLowerCase().includes(labelSearchTerm))
    );
    if (!filtered.length) return;

    let sectionTitle = section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    all.innerHTML += `
      <div class="label-section">
        <div class="label-section-title">${sectionTitle}</div>
        <div class="label-section-labels">
          ${filtered.map(tag => `
            <div class="label-btn" data-tag="${tag}" onclick="toggleTag('${tag}')">
              <span class="scroll-text">${tag}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  setTimeout(attachLabelScrollers, 200);
}

// --- Tag toggling ---
window.toggleTag = function(tag) {
  if (activeTags.includes(tag)) {
    activeTags = activeTags.filter(t => t !== tag);
  } else {
    activeTags.push(tag);
  }
  renderLabels();
  renderCards();
};

// --- Search listeners ---
document.addEventListener('DOMContentLoaded', function() {
  // Placeholder for search bar:
  document.getElementById('main-search').placeholder = "Search " + window.SECTION_CATEGORY + "...";

  document.getElementById('main-search').addEventListener('input',
    debounce(function(e) {
      cardSearchTerm = e.target.value.trim().toLowerCase();
      renderCards();
    }, 100)
  );

  document.getElementById('label-search').addEventListener('input',
    debounce(function(e) {
      labelSearchTerm = e.target.value.trim().toLowerCase();
      renderLabels();
    }, 100)
  );

  // Filter button: show/hide megamenu
  const megamenu = document.getElementById('megamenu');
  const filterBtn = document.getElementById('filterBtn');

  filterBtn.addEventListener('click', function(e) {
    megamenu.style.display = 'block';
    renderLabels();
    attachLabelScrollers();
    e.stopPropagation();
  });

  document.addEventListener('click', function(e) {
    if (!megamenu.contains(e.target) && e.target !== filterBtn) {
      megamenu.style.display = 'none';
    }
  });

  megamenu.addEventListener('click', function(e) {
    e.stopPropagation();
  });
});

// --- Animated label scroll (minimal) ---
function attachLabelScrollers() {
  document.querySelectorAll('.label-btn').forEach(btn => {
    if (btn._scrollStop) btn._scrollStop();
  });
  document.querySelectorAll('.label-btn .scroll-text').forEach(span => {
    const btn = span.parentElement;
    const available = btn.offsetWidth - 34;
    span.style.transform = `translateX(0px)`;
    span.style.transition = "none";
    if (span.scrollWidth > available) {
      let maxScroll = span.scrollWidth - available;
      let running = true;
      function animateScroll() {
        if (!running) return;
        span.style.transition = "none";
        span.style.transform = `translateX(0px)`;
        setTimeout(() => {
          if (!running) return;
          span.style.transition = "transform 3s linear";
          span.style.transform = `translateX(-${maxScroll}px)`;
          setTimeout(() => {
            if (!running) return;
            span.style.transition = "none";
            span.style.transform = `translateX(-${maxScroll}px)`;
            setTimeout(() => {
              if (!running) return;
              animateScroll();
            }, 1000);
          }, 3000);
        }, 1500);
      }
      animateScroll();
      btn._scrollStop = () => { running = false; };
    }
  });
}
