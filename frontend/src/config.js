const API_BASE_URL = process.env.REACT_APP_API_URL
  || `http://${window.location.hostname}:8000/api`;

export default API_BASE_URL;
