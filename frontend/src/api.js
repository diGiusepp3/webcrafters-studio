// frontend/src/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: "/api",
    timeout: 120000,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    config.headers = config.headers ?? {};
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        // Als je token verlopen/ongeldig is: voorkom eindeloze "not authenticated" loops
        if (err?.response?.status === 401) localStorage.removeItem("token");
        return Promise.reject(err);
    }
);

export default api;
