CREATE TABLE mangas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anilist_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    chapter TEXT,
    alert BOOLEAN DEFAULT TRUE
);

CREATE TABLE sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    chapter_url TEXT NOT NULL,
    chapter_limiter TEXT NOT NULL
);

CREATE TABLE manga_sites (
    manga_id INTEGER NOT NULL,
    site_id INTEGER NOT NULL,
    FOREIGN KEY (manga_id) REFERENCES mangas(id),
    FOREIGN KEY (site_id) REFERENCES sites(id),
    PRIMARY KEY (manga_id, site_id)
);
