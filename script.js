document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'F12' || 
    (e.ctrlKey && e.shiftKey && e.key === 'I') ||
    (e.ctrlKey && e.shiftKey && e.key === 'J') ||
    (e.ctrlKey && e.key === 'U')
  ) {
    e.preventDefault();
  }
});

// Debounce function to limit how often the search is performed
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const addOnsGrid = document.getElementById('addOnsGrid');

  // Enhanced search functionality
  const performSearch = () => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const cards = addOnsGrid.querySelectorAll('.card');
    let hasResults = false;

    cards.forEach(card => {
      const title = card.querySelector('.glow-text').textContent.toLowerCase();
      const isMatch = searchTerm === '' || title.includes(searchTerm);
      card.style.display = isMatch ? '' : 'none';
      if (isMatch) hasResults = true;
    });

    // Show no results message if needed
    let noResultsMsg = addOnsGrid.querySelector('.no-results');
    if (!hasResults && searchTerm !== '') {
      if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results';
        noResultsMsg.textContent = 'No add-ons found';
        addOnsGrid.appendChild(noResultsMsg);
      }
      noResultsMsg.style.display = '';
    } else if (noResultsMsg) {
      noResultsMsg.style.display = 'none';
    }
  };

  // Debounce the search to improve performance
  const debouncedSearch = debounce(performSearch, 300);
  searchInput.addEventListener('input', debouncedSearch);

  // Redirect link handling
  document.addEventListener('click', (e) => {
    if (e.target.closest('.redirect-link')) {
      e.preventDefault();
      const link = e.target.closest('.redirect-link');
      const redirectUrl = link.getAttribute('data-redirect');
      window.location.href = redirectUrl;
    }
  });
});
