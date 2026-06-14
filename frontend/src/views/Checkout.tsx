import { useState } from 'react';
import type { View } from '../components/Navbar';
import { useCart } from '../store/CartContext';
import './Checkout.css';

type Step = 'address' | 'payment' | 'success';

export function Checkout({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { totals, clear } = useCart();
  const [step, setStep] = useState<Step>('address');
  const [orderId] = useState(() => 'KIR' + Math.floor(100000 + Math.random() * 900000));

  const [address, setAddress] = useState({ name: '', phone: '', line: '', city: '', pincode: '' });
  const [payMethod, setPayMethod] = useState('upi');
  const [placing, setPlacing] = useState(false);

  const addressValid =
    address.name.trim() && address.phone.trim().length >= 10 && address.line.trim() && address.city.trim() && address.pincode.trim().length >= 5;

  const placeOrder = () => {
    setPlacing(true);
    setTimeout(() => {
      setPlacing(false);
      setStep('success');
      clear();
    }, 1200);
  };

  return (
    <div className="checkout">
      {/* Steps indicator */}
      {step !== 'success' && (
        <div className="steps">
          <span className={step === 'address' ? 'on' : 'done'}>1. Address</span>
          <span className={step === 'payment' ? 'on' : ''}>2. Payment</span>
          <span>3. Done</span>
        </div>
      )}

      {step === 'address' && (
        <div className="panel">
          <h2>Delivery Address</h2>
          <div className="form">
            <input placeholder="Full name" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} />
            <input placeholder="Phone number" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value.replace(/\D/g, '') })} maxLength={10} />
            <input placeholder="Flat / House no, Street, Area" value={address.line} onChange={(e) => setAddress({ ...address, line: e.target.value })} />
            <div className="form__row">
              <input placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              <input placeholder="Pincode" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, '') })} maxLength={6} />
            </div>
          </div>
          <button className="btn btn--primary wide" disabled={!addressValid} onClick={() => setStep('payment')}>
            Continue to Payment
          </button>
        </div>
      )}

      {step === 'payment' && (
        <div className="panel">
          <h2>Payment Method</h2>
          <div className="pay">
            {[
              { id: 'upi', label: 'UPI', icon: '📱', sub: 'Pay by any UPI app' },
              { id: 'card', label: 'Credit / Debit Card', icon: '💳', sub: 'Visa, Mastercard, RuPay' },
              { id: 'cod', label: 'Cash on Delivery', icon: '💵', sub: 'Pay when it arrives' },
            ].map((m) => (
              <button key={m.id} className={`payopt ${payMethod === m.id ? 'on' : ''}`} onClick={() => setPayMethod(m.id)}>
                <span className="payopt__icon">{m.icon}</span>
                <span className="payopt__text">
                  <b>{m.label}</b>
                  <small>{m.sub}</small>
                </span>
                <span className="payopt__radio">{payMethod === m.id ? '●' : '○'}</span>
              </button>
            ))}
          </div>
          <div className="payamount">
            <span>Amount payable</span>
            <b>₹{totals.total}</b>
          </div>
          <button className="btn btn--primary wide" disabled={placing} onClick={placeOrder}>
            {placing ? 'Placing order…' : `Pay ₹${totals.total}`}
          </button>
          <button className="link" onClick={() => setStep('address')}>← Back to address</button>
        </div>
      )}

      {step === 'success' && (
        <div className="success">
          <div className="success__check">✓</div>
          <h2>Order placed successfully!</h2>
          <p>Your order <b>#{orderId}</b> is confirmed and will be delivered shortly.</p>
          <div className="success__eta">🛵 Arriving in ~12 minutes</div>
          <button className="btn btn--primary" onClick={() => onNavigate('store')}>
            Continue Shopping
          </button>
        </div>
      )}
    </div>
  );
}

export default Checkout;
