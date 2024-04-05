import axios, { AxiosResponse } from "axios";
import env from "dotenv";
import { GraphqlQuery, ScrapingResult } from "./types";

env.config({ path: __dirname + "/../.env" });

const query = `
mutation ($mediaId: Int, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress) {
        mediaId
    }
}
`;

export async function updateList(results: ScrapingResult[]): Promise<void> {

    for (const { manga, lastChapter } of results) {
        const progress = Number(lastChapter);
        const mediaId = manga.anilist_id;

        if (isNaN(progress) || mediaId === 0) continue;

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

        await axios(config)
            .then((response: AxiosResponse) => {
                console.log(JSON.stringify(response.data));
            })
            .catch(error => {
                console.error(error.response?.data);
            });
    }
}
