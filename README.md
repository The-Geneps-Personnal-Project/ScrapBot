# ScrapTS

ScrapTS is a simple web scraping tool that allows you to scrape websites and extract data from them. It is written in TypeScript and uses the [Puppeteer](https://pptr.dev/) library for parsing HTML.

The objective is to allow anyone to scrap mangas from any websites and have alerts everyday when a new chapter is released.

## Installation

```bash
npm install
```
or
```bash
yarn install
```

## Usage

```bash
npm run start
```

## Environment variables

```bash
# Discord.js
TOKEN= # Discord Bot Token
GUILD_ID= # Discord Guild ID

BACKUP= # Discord Channel ID for Backup
UPDATE= # Discord Channel ID for Update
ERROR= # Discord Channel ID for Error

# Discord Test
TEST_BACKUP= # Discord Channel ID for Backup in development
TEST_UPDATE= # Discord Channel ID for Update in development
TEST_ERROR= # Discord Channel ID for Error in development

# Anilist
ANILIST_TOKEN= # Anilist Token
ANILIST_ID= # Anilist account ID

# Database
DB_NAME= # Database name
DB_TEST= # Database name in development

# Puppeteer
PUPPETEER_EXECUTABLE_PATH= # Path to Puppeteer executable | Keep empty if you want to use the default path

# ENV
NODE_ENV=development # development or production
```

## Discord

This project uses [Discord.js](https://discord.js.org/) to receives updates and send commands

### Commands

`/create [site|manga]`

Create a new manga or site.

#### Site
̀`/create site [url]`

Scrapes all the necessary information from the given URL.

- `[url]`: The URL of the site to be scraped.
  

#### Manga

`/create manga [anilist_id] [chapter] [name] [site]`

Creates a new manga entry.

- `[anilist_id]`: The ID of the manga from Anilist. Keep to 0 if
  - The manga is not on Anilist.
  - You don't want to track it
  - You don't use Anilist
  
- `[chapter]`: The last chapter you read from the manga.
- `[name]`: The name of the manga.
- `[site]`: The site where you want to read the manga (You can add more sites with the `create site_to_manga` command).

#### Common commands
  
- `/remove [site|manga]`: Remove a manga or site.

- `/update [site|manga]`: Update a manga or site.

- `/run`: Run the scraper to gather the latest data from the specified sites and mangas.
 - `/create site_to_manga [manga] [site]`: Add a site to a manga.
   - `[manga]`: The manga name that will be linked to the site.
   - `[site]`: The site name that will be linked to the manga.
  
#### Autocompletion and Choices

Most of the command have autocompletion and choices to help you fill the command.
The choices will show the mangas and sites that you have already registered in the database. It will display only the 25 only elements at first but you can type in the input field to have more refined results.

Discord is only a way of interact, a website will soon be available to have access to yours ressources in a more user-friendly way.

## Requirements

To run this project bu yourself, you need the [API](https://github.com/The-Geneps-Personnal-Project/ScrapAPI)

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.