import '@testing-library/jest-dom';

jest.mock('axios');
jest.mock('react-data-table-component', () => () => null);
jest.mock('lucide-react', () => ({
  Package: 'Package', Truck: 'Truck', MapPin: 'MapPin',
  Info: 'Info', Maximize2: 'Maximize2', X: 'X', Loader: 'Loader',
}));
jest.mock('@react-google-maps/api', () => ({
  GoogleMap: 'GoogleMap', LoadScript: 'LoadScript',
  DirectionsRenderer: 'DirectionsRenderer', Marker: 'Marker',
}));

const { filterData } = require('../Page/Livraison');

const mockOrders = [
  {
    id: '1',
    numero_devis: 'DEV-001',
    client_name: 'Client Alpha',
    adresse_livraison: '123 Rue A',
    number: '0340000001',
    Adresse_client: '456 Rue B',
    ref_produit: 'REF-001',
    Name: 'Produit X',
    quantity: 10,
    planification_date: '2025-06-01',
    period: 'AM',
  },
  {
    id: '2',
    numero_devis: 'DEV-002',
    client_name: 'Client Beta',
    adresse_livraison: '789 Rue C',
    number: '0340000002',
    Adresse_client: '012 Rue D',
    ref_produit: 'REF-002',
    Name: 'Produit Y',
    quantity: 5,
    planification_date: '2025-06-02',
    period: 'PM',
  },
];

const searchFields = [
  'numero_devis', 'client_name', 'adresse_livraison', 'number',
  'Adresse_client', 'ref_produit', 'Name', 'quantity',
  'planification_date', 'period'
];

test('filterData returns all items with empty search', () => {
  const result = filterData(mockOrders, '', searchFields);
  expect(result).toEqual(mockOrders);
});

test('filterData filters by client name', () => {
  const result = filterData(mockOrders, 'Alpha', searchFields);
  expect(result).toHaveLength(1);
  expect(result[0].client_name).toBe('Client Alpha');
});

test('filterData filters by product name', () => {
  const result = filterData(mockOrders, 'Produit Y', searchFields);
  expect(result).toHaveLength(1);
  expect(result[0].Name).toBe('Produit Y');
});

test('filterData returns empty for no match', () => {
  const result = filterData(mockOrders, 'NonExistent', searchFields);
  expect(result).toHaveLength(0);
});

test('filterData is case insensitive', () => {
  const result = filterData(mockOrders, 'alpha', searchFields);
  expect(result).toHaveLength(1);
});

test('filterData handles empty data array', () => {
  const result = filterData([], 'test', searchFields);
  expect(result).toHaveLength(0);
});

test('filterData handles items with missing fields', () => {
  const incompleteData = [{ id: '3' }];
  const result = filterData(incompleteData, 'test', searchFields);
  expect(result).toHaveLength(0);
});
