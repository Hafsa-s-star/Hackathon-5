import axios from "axios";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiUrl = import.meta.env.PROD
  ? "/api"
  : configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, "")
  : "http://localhost:5000/api";

const api = axios.create({
  baseURL: /\/api$/i.test(apiUrl) ? apiUrl : `${apiUrl}/api`,
  withCredentials: true
});

export default api;
