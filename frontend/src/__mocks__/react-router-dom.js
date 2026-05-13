const React = require('react');

const MockLink = ({ children, to, ...props }) =>
  React.createElement('a', { href: to, ...props }, children);

const MockNavigate = ({ to }) =>
  React.createElement('div', null, 'Redirect');

const MockRoutes = ({ children }) =>
  React.createElement('div', null, children);

const MockRoute = ({ element }) => element;

const MockMemoryRouter = ({ children }) =>
  React.createElement('div', null, children);

const useNavigate = () => jest.fn();

const useLocation = () => ({ pathname: '/', search: '', hash: '' });

module.exports = {
  Link: MockLink,
  Navigate: MockNavigate,
  Routes: MockRoutes,
  Route: MockRoute,
  MemoryRouter: MockMemoryRouter,
  useNavigate,
  useLocation,
  BrowserRouter: MockMemoryRouter,
  NavLink: MockLink,
  Outlet: () => null,
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
};
