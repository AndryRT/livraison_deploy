import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Toast from '../components/Toast';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders toast with message', () => {
  const mockOnClose = jest.fn();
  render(<Toast message="Test notification" type="success" onClose={mockOnClose} />);
  expect(screen.getByText('Test notification')).toBeInTheDocument();
});

test('applies correct type class', () => {
  const mockOnClose = jest.fn();
  const { container } = render(<Toast message="Error message" type="error" onClose={mockOnClose} />);
  const toastDiv = container.querySelector('.toast');
  expect(toastDiv).toHaveClass('toast-error');
});

test('returns null when visible is false', () => {
  const mockOnClose = jest.fn();
  const { container } = render(<Toast message="" type="success" onClose={mockOnClose} />);
  expect(container.innerHTML).toBe('');
});

test('calls onClose after 3 seconds', () => {
  const mockOnClose = jest.fn();
  render(<Toast message="Auto close" type="info" onClose={mockOnClose} />);

  expect(mockOnClose).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(mockOnClose).toHaveBeenCalledTimes(1);
});

test('cleans up timer on unmount', () => {
  const mockOnClose = jest.fn();
  const { unmount } = render(<Toast message="Cleanup" type="success" onClose={mockOnClose} />);

  unmount();

  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(mockOnClose).not.toHaveBeenCalled();
});
