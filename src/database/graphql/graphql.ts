import axios, { AxiosResponse } from "axios";
import env from "dotenv";
import { GraphqlQuery, GraphqlQueryMediaOutput, ScrapingResult } from "../../types/types";

env.config({ path: __dirname + "/../.env" });

const mutationQuery = `
mutation ($mediaId: Int, $progress: Int) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress) {
        mediaId
    }
}
`;

const mangaQuery = `
query ($id: Int){
    Media(id: $id) {
      tags {
        name
      },
      description,
      coverImage {
            medium
      }
    }
  }
`;

export async function getMangaInfos(id: Number): Promise<GraphqlQueryMediaOutput> {
    const config = {
        method: "post",
        url: "https://graphql.anilist.co",
        headers: {
            Authorization: `Bearer ${process.env.ANILIST_TOKEN}`,
            "Content-Type": "application/json",
        },
        data: JSON.stringify({
            query: mangaQuery,
            variables: { id: id },
        } as GraphqlQuery),
    };

    return axios(config)
        .then((response: AxiosResponse) => {
            return response.data.data.Media as GraphqlQueryMediaOutput;
        })
        .catch(error => {
            console.error(error.response?.data);
            throw error;
        });
}

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
                query: mutationQuery,
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
