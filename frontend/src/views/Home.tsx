import type { View } from '../components/Navbar';
import { CATEGORIES, categoryIcon, categoryLabel, PRODUCTS } from '../data/catalog';
import { Assistant } from '../components/Assistant';
import './Home.css';

export function Home({ onNavigate, onPickCategory }: { onNavigate: (v: View) => void; onPickCategory: (c: string) => void }) {
  const topCategories = CATEGORIES.slice(0, 12);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__content">
          <h1>
            Groceries in minutes, <span>with a human touch.</span>
          </h1>
          <p>
            Meet <b>Sanaya</b> — your Amazon Now shopping companion. She knows what you like,
            picks the right product, and completes your basket, so you decide less and get more.
          </p>
          <div className="hero__actions">
            <button className="btn btn--primary" onClick={() => onNavigate('store')}>
              Start Shopping
            </button>
            <span className="hero__stat">{PRODUCTS.length}+ products · free delivery over ₹199</span>
          </div>
        </div>
        <div className="hero__art">🛒🥛🍫🥖🍎</div>
      </section>

      <section className="home__assistant">
        <Assistant />
      </section>

      <section className="home__section">
        <h2>Shop by category</h2>
        <div className="home__cats">
          {topCategories.map((c) => (
            <button key={c} className="catcard" onClick={() => onPickCategory(c)}>
              <span className="catcard__icon">{categoryIcon(c)}</span>
              <span className="catcard__label">{categoryLabel(c)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home__features">
        <div className="feat">
          <span>🧠</span>
          <h3>Sanaya understands you</h3>
          <p>She gets what you mean, not just what you type.</p>
        </div>
        <div className="feat">
          <span>🎯</span>
          <h3>Personalised picks</h3>
          <p>Learns your brands, diet and budget over time.</p>
        </div>
        <div className="feat">
          <span>⚡</span>
          <h3>Faster checkout</h3>
          <p>Fewer decisions, smart basket completion, gap-fill for free delivery.</p>
        </div>
      </section>
    </div>
  );
}

export default Home;
