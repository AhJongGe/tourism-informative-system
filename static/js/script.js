// ====== NAVIGATION & SECTION SCROLL (SHARED) ======
document.querySelectorAll('.nav-item, .dropdown-content a').forEach(item => {
  item.addEventListener('click', function(event) {
    const sectionId = this.getAttribute('href');
    if (sectionId === "#") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelector('.dropdown').classList.remove('show');
      return;
    }
    if (sectionId && sectionId.startsWith('#')) {
      event.preventDefault();
      document.querySelector(sectionId).scrollIntoView({ behavior: 'smooth' });
      document.querySelector('.dropdown').classList.remove('show');
    }
  });
});
// ====== DROPDOWN SHOW/HIDE (SHARED) ======
document.getElementById('moreDropdown').addEventListener('click', function(event) {
  event.stopPropagation();
  const dropdown = this.parentElement;
  dropdown.classList.toggle('show');
});
document.body.addEventListener('click', function() {
  document.querySelector('.dropdown').classList.remove('show');
});

// ====== SLUGIFY (NEEDED ONLY FOR userpage.html CARD DETAIL) ======
function slugify(text) {
  return text.toLowerCase()
    .normalize('NFKD').replace(/[^\w\s-]/g, '')
    .replace(/'/g, '')
    .replace(/&/g, 'and')
    .replace(/\(|\)/g, '')
    .replace(/\//g, '-')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '-');
}

// ====== SECTION RENDERING (SHARED, with card detail logic toggled) ======
const FLASK_ROUTES = {
  cuisine: "/cuisines",
  shopping: "/shopping",
  attractions: "/attractions",
  accomodation: "/accomodation",
  entertainment: "/entertainment",
  transport: "/transport",
  services: "/services",
  religion: "/religion"
};
const SECTIONS = [
  { id: 'cuisine-cards', category: 'cuisine' },
  { id: 'shopping-cards', category: 'shopping' },
  { id: 'attractions-cards', category: 'attractions' },
  { id: 'accomodation-cards', category: 'accomodation' },
  { id: 'entertainment-cards', category: 'entertainment' },
  { id: 'transport-cards', category: 'transport' },
  { id: 'services-cards', category: 'services' },
  { id: 'religion-cards', category: 'religion' }
];

// Fetch places and render cards
fetch('/api/places')
  .then(resp => resp.json())
  .then(data => {
    SECTIONS.forEach(section => {
      const container = document.getElementById(section.id);
      if (!container) return;

      const items = data.filter(place =>
        Array.isArray(place.category)
          ? place.category.includes(section.category)
          : place.category === section.category
      );
      items.sort(() => Math.random() - 0.5);

      // Render up to 6 places
      items.slice(0, 6).forEach(place => {
      const slug = slugify(place.name);
      const cardLink = document.createElement('a');
      cardLink.className = 'card-link';
      cardLink.href = '/place_detail/' + slug;
      cardLink.title = "View details";

      // You can use your preferred HTML structure inside:
      cardLink.innerHTML = `
        <div class="card">
          <img src="${place.photo || '/static/images/default.jpg'}" alt="${place.name}">
          <div class="banner">${place.name}</div>
          <div class="description">${place.description}</div>
        </div>
  `   ;

      // No need for ENABLE_CARD_DETAIL or click listeners!
      container.appendChild(cardLink);
    });

      // Add More button if there are more than 6
      if (items.length > 6) {
        const moreBtn = document.createElement('div');
        moreBtn.className = 'card more-card';
        moreBtn.textContent = "More";
        moreBtn.style.cursor = "pointer";
        moreBtn.addEventListener('click', () => {
          window.location.href = FLASK_ROUTES[section.category];
        });
        container.appendChild(moreBtn);
      }
    });
  })
  .catch(err => {
    console.error("Failed to load places:", err);
    // Optionally show an error message on the page
  });

