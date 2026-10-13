// Client-side Card Database & Query Helpers
window.CardsDB = {
  data: { cards: [], threats: [], categories: [] },
  isLoaded: false,

  async init() {
    if (this.isLoaded) return;
    try {
      const res = await fetch('/api/cards');
      if (!res.ok) throw new Error('Catalogul nu poate fi încărcat.');
      this.data = await res.json();
      this.isLoaded = true;
      console.log('CardsDB loaded:', this.data.cards.length, 'cards');
    } catch (e) {
      console.error('Failed to load CardsDB:', e);
    }
  },

  getAll() {
    return this.data.cards || [];
  },

  getByCategory(catSlug) {
    if (!catSlug) return this.getAll();
    return this.data.cards.filter((c) => c.category === catSlug);
  },

  getById(cardId) {
    return (
      this.data.cards.find((c) => c.id === cardId) || this.data.threats.find((t) => t.id === cardId)
    );
  },

  search(query, catSlug = null) {
    let list = catSlug ? this.getByCategory(catSlug) : this.getAll();
    if (!query || !query.trim()) return list;

    const q = window.BunkerRules.normalize(query.trim());
    return list.filter((c) => {
      const tMatch = c.title && window.BunkerRules.normalize(c.title).includes(q);
      const dMatch = c.description && window.BunkerRules.normalize(c.description).includes(q);
      const fMatch = c.filename && window.BunkerRules.normalize(c.filename).includes(q);
      return tMatch || dMatch || fMatch;
    });
  },

  getCategoryInfo(catSlug) {
    return (
      (this.data.categories || []).find((c) => c.slug === catSlug) || {
        slug: catSlug,
        name: catSlug,
        color: '#f59e0b',
      }
    );
  },
};
