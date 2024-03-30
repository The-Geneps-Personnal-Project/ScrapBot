// src/updateList.ts

import axios, { AxiosResponse } from "axios";
import dotenv from "dotenv";
import { GraphqlParams, GraphqlQuery } from "./types";

// Load environment variables
dotenv.config();

const query = `
mutation ($mediaId: Int, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress) {
        mediaId
    }
}
`;

export function updateList({ mediaId, progress }: GraphqlParams): void {
    if (mediaId == 0) return;

    const config = {
    method: "post",
    url: "https://graphql.anilist.co",
    headers: {
        Authorization: `Bearer ${process.env.ANILIST_TOKEN}`,
        "Content-Type": "application/json",
    },
    data: JSON.stringify({
        query,
        variables: { mediaId, progress },
    } as GraphqlQuery),
    };

    axios(config)
    .then((response: AxiosResponse) => {
        console.log(JSON.stringify(response.data));
    })
    .catch((error) => {
        console.error(error.response?.data);
    });
}
