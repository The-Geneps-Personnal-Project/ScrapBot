import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from "axios";

/**
 * Error raised by every ScrapAPI call.
 *
 * This class exists because the previous implementation did `throw error.message`
 * — throwing a bare *string*. A string has no `.message`, so every downstream
 * `catch (e) { editReply((e as Error).message) }` evaluated to `undefined` and
 * Discord answered "Cannot send an empty message". Always throw an Error.
 */
export class ApiError extends Error {
    constructor(
        readonly method: Method,
        readonly endpoint: string,
        readonly status: number | null,
        message: string,
        readonly body?: unknown
    ) {
        super(message);
        this.name = "ApiError";
    }

    get isNotFound(): boolean {
        return this.status === 404;
    }
}

/** 15s — ScrapAPI is a local SQLite CRUD; anything slower is a hang, not latency. */
const REQUEST_TIMEOUT_MS = 15_000;

function getApiBaseUrl(): string {
    const isProduction = process.env.NODE_ENV === "production";
    const url = isProduction ? process.env.API_URL : (process.env.API_TEST_URL ?? process.env.API_URL);

    if (!url) {
        // Without this guard the template literal used to yield the *string*
        // "undefined", so requests went to "undefined/mangas" and failed with an
        // opaque URL parse error instead of a configuration error.
        throw new Error(
            `Missing API base URL: set ${isProduction ? "API_URL" : "API_TEST_URL"} in your .env (NODE_ENV=${process.env.NODE_ENV ?? "unset"}).`
        );
    }

    return url.replace(/\/+$/, "");
}

async function request<T>(
    method: Method,
    endpoint: string,
    { body, params }: { body?: unknown; params?: Record<string, unknown> } = {}
): Promise<T> {
    const url = `${getApiBaseUrl()}/${endpoint}`;
    const config: AxiosRequestConfig = { method, url, data: body, params, timeout: REQUEST_TIMEOUT_MS };

    try {
        const response: AxiosResponse<T> = await axios(config);
        return response.data;
    } catch (error) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status ?? null;
        const detail = axiosError.response?.data;

        throw new ApiError(
            method,
            endpoint,
            status,
            `${method} ${endpoint} failed${status ? ` with status ${status}` : ""}: ${
                typeof detail === "string" && detail ? detail : axiosError.message
            }`,
            detail
        );
    }
}

export async function getFromApi<T>(endpoint: string): Promise<T> {
    return request<T>("GET", endpoint);
}

export async function postToApi<T>(
    endpoint: string,
    body?: unknown,
    params?: Record<string, unknown>
): Promise<T> {
    return request<T>("POST", endpoint, { body, params });
}

export async function putToApi<T>(
    endpoint: string,
    body?: unknown,
    params?: Record<string, unknown>
): Promise<T> {
    return request<T>("PUT", endpoint, { body, params });
}

export async function deleteFromApi<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>("DELETE", endpoint, { params });
}
