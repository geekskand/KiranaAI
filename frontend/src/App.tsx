import { useState } from 'react';
import { CartProvider } from './store/CartContext';
import { Navbar, type View } from './components/Navbar';
import { Home } from './views/Home';
import { Store } from './views/Store';
import { Cart } from './views/Cart';
import { Checkout } from './views/Checkout';
import './App.css';

function App() {
  const [view, setView] = useState<View>('home');
  const [storeCategory, setStoreCategory] = useState<string | undefined>(undefined);

  const navigate = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pickCategory = (c: string) => {
    setStoreCategory(c);
    navigate('store');
  };

  return (
    <CartProvider>
      <div className="app-shell">
        <Navbar view={view} onNavigate={navigate} />
        <main className="app-main">
          {view === 'home' && <Home onNavigate={navigate} onPickCategory={pickCategory} />}
          {view === 'store' && <Store initialCategory={storeCategory} />}
          {view === 'cart' && <Cart onNavigate={navigate} />}
          {view === 'checkout' && <Checkout onNavigate={navigate} />}
        </main>
        <footer className="app-footer">
          KiranaAI · Intent Intelligence Commerce · Demo
        </footer>
      </div>
    </CartProvider>
  );
}

export default App;
