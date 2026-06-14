import { useMemo, useState, useEffect } from 'react';
import { PRODUCTS, CATEGORIES, categoryLabel, categoryIcon } from '../data/catalog';
import { ProductTile } from '../components/ProductTile';
import './Store.css';

type SortKey = 'relevance' | 'price-asc' | 'price-desc';

const PAGE_SIZE = 24;

export function Store({ initialCategory }: { initialCategory?: string }) {
  const [activeCat, setActiveCat] = useState<string | 'all'>(initialCategory ?? 'all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (initialCategory) setActiveCat(initialCategory);
  }, [initialCategory]);

  // Reset pagination when filters change
  useEffect(() => setVisible(PAGE_SIZE), [activeCat, search, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = PRODUCTS.filter((p) => {
      if (activeCat !== 'all' && p.category !== activeCat) return false;
      if (q) {
        const hay = `${p.name} ${p.brand} ${p.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [activeCat, search, sort]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="store">
      <aside className="store__sidebar">
        <h3>Categories</h3>
        <button
          className={`catfilter ${activeCat === 'all' ? 'active' : ''}`}
          onClick={() => setActiveCat('all')}
        >
          🛒 All Products
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`catfilter ${activeCat === c ? 'active' : ''}`}
            onClick={() => setActiveCat(c)}
          >
            {categoryIcon(c)} {categoryLabel(c)}
          </button>
        ))}
      </aside>

      <main className="store__main">
        <div className="store__toolbar">
          <input
            className="store__search"
            type="text"
            placeholder="Search products or brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="store__sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort products"
          >
            <option value="relevance">Sort: Featured</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        <div className="store__heading">
          <h2>{activeCat === 'all' ? 'All Products' : categoryLabel(activeCat)}</h2>
          <span>{filtered.length} items</span>
        </div>

        {shown.length === 0 ? (
          <p className="store__empty">No products match your search.</p>
        ) : (
          <div className="store__grid">
            {shown.map((p) => (
              <ProductTile key={p.productId} product={p} />
            ))}
          </div>
        )}

        {visible < filtered.length && (
          <div className="store__more">
            <button onClick={() => setVisible((v) => v + PAGE_SIZE)}>Load more</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default Store;
