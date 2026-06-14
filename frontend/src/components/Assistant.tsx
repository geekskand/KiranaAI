import { useEffect, useRef, useState } from 'react';
import { useKiranaSocket, type AssistantProduct } from '../hooks/useKiranaSocket';
import { useCart } from '../store/CartContext';
import { PRODUCTS, categoryIcon, type Product } from '../data/catalog';
import './Assistant.css';

const PERSONAS = [
  { id: 'persona-budget-rahul', label: 'Rahul · Budget' },
  { id: 'persona-health-priya', label: 'Priya · Health' },
];

const SUGGESTIONS = ['milk', 'add rice', 'healthy snacks', 'substitute for butter', 'chocolate'];

/** Resolve an assistant product into a full catalog Product for the cart. */
function toCatalogProduct(p: AssistantProduct): Product {
  const found = PRODUCTS.find((x) => x.productId === p.productId);
  if (found) return found;
  return {
    productId: p.productId,
    name: p.name,
    brand: p.brand ?? 'KiranaAI',
    category: p.category ?? 'staples',
    price: p.price,
    imageUrl: p.imageUrl,
    isOrganic: false,
    isLowSugar: false,
    isGlutenFree: false,
    containsPalmOil: false,
    qualityTier: 'mid',
    inStock: true,
    dietaryLabels: [],
  };
}

function ProductChip({ p }: { p: AssistantProduct }) {
  const { addItem, quantityOf, decrement } = useCart();
  const qty = quantityOf(p.productId);
  const ph = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#f1f5f9"/><text x="28" y="28" font-size="26" text-anchor="middle" dominant-baseline="central">${categoryIcon(p.category || '')}</text></svg>`
  )}`;
  const [src, setSrc] = useState(p.imageUrl || ph);
  return (
    <div className="achip">
      <img src={src} alt={p.name} loading="lazy" onError={() => setSrc(ph)} />
      <div className="achip__info">
        <span className="achip__name">{p.name}</span>
        {p.brand && <span className="achip__brand">{p.brand}</span>}
        <span className="achip__price">₹{p.price}</span>
      </div>
      {qty === 0 ? (
        <button className="achip__add" onClick={() => addItem(toCatalogProduct(p))}>ADD</button>
      ) : (
        <div className="achip__step">
          <button onClick={() => decrement(p.productId)}>−</button>
          <span>{qty}</span>
          <button onClick={() => addItem(toCatalogProduct(p))}>+</button>
        </div>
      )}
    </div>
  );
}

export function Assistant() {
  const [persona, setPersona] = useState(PERSONAS[0].id);
  const { status, messages, thinking, send } = useKiranaSocket(persona);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const submit = () => {
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  return (
    <div className="assistant">
      <div className="assistant__head">
        <div>
          <h2>🧠 Ask KiranaAI</h2>
          <p>Tell me what you need — I'll pick the right product for you.</p>
        </div>
        <div className="assistant__persona">
          <label>Shopping as</label>
          <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Persona">
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span className={`assistant__dot assistant__dot--${status}`} title={status} />
        </div>
      </div>

      <div className="assistant__thread">
        {messages.length === 0 && (
          <div className="assistant__empty">
            <p>Try asking:</p>
            <div className="assistant__suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`abubble abubble--${m.role}`}>
            <div className="abubble__text">{m.content}</div>
            {m.products && m.products.length > 0 && (
              <div className="abubble__products">
                {m.products.map((p) => (
                  <ProductChip key={p.productId} p={p} />
                ))}
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="abubble abubble--assistant"><div className="abubble__text typing">KiranaAI is thinking…</div></div>}
        <div ref={endRef} />
      </div>

      <div className="assistant__input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={status === 'connected' ? 'e.g. "milk" or "healthy snacks"' : 'Connecting to KiranaAI…'}
        />
        <button onClick={submit} disabled={!input.trim()}>Send</button>
      </div>
    </div>
  );
}

export default Assistant;
