// FILE: frontend/src/api.js
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    timeout: 120000,
});

const isValidJwt = (value) => {
    if (typeof value !== "string") return false;
    const parts = value.split(".");
    return parts.length === 3 && parts.every(Boolean);
};

export function setAuthToken(jwt) {
    if (jwt) api.defaults.headers.common.Authorization = `Bearer ${jwt}`;
    else delete api.defaults.headers.common.Authorization;
}

// Zet defaults meteen bij load (page refresh)
const bootToken = localStorage.getItem("access_token");
if (isValidJwt(bootToken)) {
    setAuthToken(bootToken);
} else if (bootToken) {
    localStorage.removeItem("access_token");
}

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("access_token");
    config.headers = config.headers ?? {};
    if (isValidJwt(token)) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        const status = err?.response?.status;
        const hadAuthHeader = !!err?.config?.headers?.Authorization;

        // ✅ alleen token droppen als we zeker weten dat we een token hebben meegestuurd
        if ((status === 401 || status === 403) && hadAuthHeader) {
            localStorage.removeItem("access_token");
            setAuthToken(null);
        }
        return Promise.reject(err);
    }
);

export default api;
