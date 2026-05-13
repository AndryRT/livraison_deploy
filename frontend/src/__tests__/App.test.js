import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-router-dom');

const App = require('../App').default;

beforeEach(() => {
  localStorage.clear();
});

test('renders login page when no token', () => {
  localStorage.removeItem('authToken');
  render(<App />);
  expect(screen.getByText(/Viseo Livraison/i)).toBeInTheDocument();
});

test('renders login page when token is removed', () => {
  render(<App />);
  expect(screen.getByText(/Viseo Livraison/i)).toBeInTheDocument();
});
