import axios, { AxiosResponse, AxiosError } from "axios";
import env from "dotenv";

env.config({ path: __dirname + "/../.env" });

function getApiBaseUrl(): string {
    return `${process.env.NODE_ENV === "production" ? process.env.API_URL : process.env.API_TEST_URL}`;
}

export async function getFromApi<T>(endpoint: string): Promise<T> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/${endpoint}`;

    try {
        const response: AxiosResponse<T> = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch from API:", error);
        throw (error as AxiosError).message;
    }
}

export async function postToApi<T>(
    endpoint: string,
    body?: Record<string, any>,
    params?: Record<string, any>
): Promise<T> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/${endpoint}`;

    try {
        const response: AxiosResponse<T> = await axios.post(url, body, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to post to API:", error);
        throw (error as AxiosError).message;
    }
}

export async function putToApi<T>(
    endpoint: string,
    body?: Record<string, any>,
    params?: Record<string, any>
): Promise<T> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/${endpoint}`;

    try {
        const response: AxiosResponse<T> = await axios.put(url, body, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to put to API:", error);
        throw (error as AxiosError).message;
    }
}

export async function deleteFromApi<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/${endpoint}`;

    try {
        const response: AxiosResponse<T> = await axios.delete(url, { params });
        return response.data;
    } catch (error) {
        console.error("Failed to delete from API:", error);
        throw (error as AxiosError).message;
    }
}
