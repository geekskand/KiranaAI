import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCard, ProductCardProps } from './ProductCard';

describe('ProductCard', () => {
  const defaultProps: ProductCardProps = {
    productId: 'prod-001',
    name: 'Organic Milk 1L',
    price: 65,
    onAddToCart: vi.fn(),
  };

  it('renders product name', () => {
    render(<ProductCard {...defaultProps} />);
    expect(screen.getByText('Organic Milk 1L')).toBeDefined();
  });

  it('renders formatted price with rupee symbol', () => {
    render(<ProductCard {...defaultProps} />);
    expect(screen.getByText('₹65')).toBeDefined();
  });

  it('renders recommendation reason when provided', () => {
    render(<ProductCard {...defaultProps} reason="Frequently bought together" />);
    expect(screen.getByText('Frequently bought together')).toBeDefined();
  });

  it('does not render reason element when reason is not provided', () => {
    const { container } = render(<ProductCard {...defaultProps} />);
    expect(container.querySelector('.product-card__reason')).toBeNull();
  });

  it('renders add-to-cart button', () => {
    render(<ProductCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add organic milk 1l to cart/i })).toBeDefined();
  });

  it('calls onAddToCart with productId when add button is clicked', () => {
    const onAddToCart = vi.fn();
    render(<ProductCard {...defaultProps} onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole('button', { name: /add organic milk 1l to cart/i }));
    expect(onAddToCart).toHaveBeenCalledWith('prod-001');
  });

  it('disables the add button when isAdding is true', () => {
    render(<ProductCard {...defaultProps} isAdding={true} />);
    const button = screen.getByRole('button', { name: /add organic milk 1l to cart/i });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText('Adding...')).toBeDefined();
  });

  it('does not call onAddToCart when button is disabled', () => {
    const onAddToCart = vi.fn();
    render(<ProductCard {...defaultProps} onAddToCart={onAddToCart} isAdding={true} />);

    fireEvent.click(screen.getByRole('button', { name: /add organic milk 1l to cart/i }));
    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it('renders product image when imageUrl is provided', () => {
    render(<ProductCard {...defaultProps} imageUrl="https://example.com/milk.jpg" />);
    const img = screen.getByRole('img', { name: 'Organic Milk 1L' });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/milk.jpg');
  });

  it('does not render image section when imageUrl is not provided', () => {
    const { container } = render(<ProductCard {...defaultProps} />);
    expect(container.querySelector('.product-card__image')).toBeNull();
  });

  it('formats price without decimals for whole numbers', () => {
    render(<ProductCard {...defaultProps} price={120} />);
    expect(screen.getByText('₹120')).toBeDefined();
  });

  it('has proper accessibility role and label', () => {
    render(<ProductCard {...defaultProps} />);
    expect(screen.getByRole('article', { name: 'Product: Organic Milk 1L' })).toBeDefined();
  });

  it('renders gap-fill reason correctly', () => {
    render(<ProductCard {...defaultProps} reason="Get free delivery" />);
    expect(screen.getByText('Get free delivery')).toBeDefined();
  });
});
