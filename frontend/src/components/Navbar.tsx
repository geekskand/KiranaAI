import { useCart } from '../store/CartContext';
import './Navbar.css';

export type View = 'home' | 'store' | 'cart' | 'checkout';

export function Navbar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { totals } = useCart();

  return (
    <header className="nav">
      <button className="nav__brand" onClick={() => onNavigate('home')}>
        <span className="nav__logo">🛒</span>
        <span className="nav__title">KiranaAI</span>
      </button>

      <nav className="nav__links">
        <button className={view === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}>
          Home
        </button>
        <button className={view === 'store' ? 'active' : ''} onClick={() => onNavigate('store')}>
          Store
        </button>
        <button
          className={`nav__cart ${view === 'cart' ? 'active' : ''}`}
          onClick={() => onNavigate('cart')}
        >
          🛍️ Cart
          {totals.itemCount > 0 && <span className="nav__badge">{totals.itemCount}</span>}
        </button>
      </nav>
    </header>
  );
}

export default Navbar;
