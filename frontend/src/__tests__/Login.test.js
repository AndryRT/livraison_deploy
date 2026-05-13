import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-router-dom');

const Login = require('../Page/Login').default;

const mockOnLoginSuccess = jest.fn();

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test('renders login form with all fields', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  expect(screen.getByText(/Viseo Livraison/i)).toBeInTheDocument();
  expect(screen.getByText(/Se connecter/i)).toBeInTheDocument();
  expect(screen.getByText(/S['\u2019]inscrire/i)).toBeInTheDocument();
});

test('shows identifier error when submitting empty form', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  const submitButton = screen.getByText(/Se connecter/i);
  fireEvent.click(submitButton);
  expect(screen.getByText(/L'identifiant est requis/i)).toBeInTheDocument();
});

test('shows password error when password is too short', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  const identifierInput = screen.getByPlaceholderText('Identifiant');
  const passwordInput = screen.getByPlaceholderText('Mot de passe');

  fireEvent.change(identifierInput, { target: { value: 'testuser' } });
  fireEvent.change(passwordInput, { target: { value: 'abc' } });

  const submitButton = screen.getByText(/Se connecter/i);
  fireEvent.click(submitButton);

  expect(screen.getByText(/Le mot de passe doit contenir au moins 6 caractères/i)).toBeInTheDocument();
});

test('toggles password visibility', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  const passwordInput = screen.getByPlaceholderText('Mot de passe');
  expect(passwordInput.type).toBe('password');

  const toggleButton = document.querySelector('button[type="button"]');
  if (toggleButton) {
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
  }
});

test('removes error when user starts typing', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  const submitButton = screen.getByText(/Se connecter/i);
  fireEvent.click(submitButton);

  expect(screen.getByText(/L'identifiant est requis/i)).toBeInTheDocument();

  const identifierInput = screen.getByPlaceholderText('Identifiant');
  fireEvent.change(identifierInput, { target: { value: 'test' } });

  expect(screen.queryByText(/L'identifiant est requis/i)).not.toBeInTheDocument();
});

test('has link to register page', () => {
  render(<Login onLoginSuccess={mockOnLoginSuccess} />);
  const registerLink = screen.getByText(/S['\u2019]inscrire/i);
  expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
});
