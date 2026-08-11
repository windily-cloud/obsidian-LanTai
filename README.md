# LanTai（兰台）

[English](README.md) | [中文](README.zh.md)

Obsidian **desktop** plugin for uploading, localizing, and downloading images with built-in object-storage profiles.

## Name

**兰台** (*Lántái*; product spelling **LanTai**) is a classical Chinese name for a place that keeps documents and archives.

- **Pronunciation:** Mandarin Pinyin **Lántái** (both syllables rising tone, 2nd tone). Approximate English: *lahn-tye* (not “lan-tie” as in necktie, and not an arbitrary English reading of the letters).
- **History:** In the Han dynasty, **兰台** was the imperial court’s central repository for books and official records (a stone archive chamber under the Imperial Secretariat / Censorate lineage). Officials such as *Lantai lingshi* (兰台令史) curated texts and, at times, compiled history there. Later usage extended the word to court libraries, historiographers, and related offices; in modern Chinese it remains an elegant name for archival work and archive institutions.
- **Why this plugin:** Notes move images between the local vault and object storage—careful keeping and retrieval, in the spirit of a document archive rather than a throwaway image host.

## Requirements

- Obsidian **desktop** only (`isDesktopOnly`)
- Obsidian **≥ 1.11.4** (credentials use Secret Storage / `SecretComponent`)

## Quick start

1. Open **Settings → LanTai → S3**.
2. Create a **storage profile**, fill in bucket, **public base URL**, region/endpoint as needed, and bind access keys via Secret Storage.
3. Set that profile as the **active** profile.
4. In a Markdown editor (Live Preview or Source), right-click a rendered image → **Upload**, or run **Upload current image** from the command palette.

## Core concepts

| Term | Meaning |
|------|---------|
| **Upload** | Push a local image to the active storage profile; replace the note link with the remote URL. |
| **Localize** | Bring a remote image into the vault (or only rewrite the link if the target path already exists). |
| **Download** | Save the image **outside** the vault via the system “Save as” dialog; does **not** change note links or write into the vault. |
| **Plugin-scoped attachment path** | Directory and filename rules for image writes (localize/upload and new images from paste/drop, etc.). Non-image attachments still use Obsidian’s global default. Avoid running alongside `obsidian-custom-attachment-location` or similar path plugins. |
| **Storage profile** | A named object-storage connection. Uploads always use the **active** profile. |
| **Public base URL** | Prefix for links written into notes: `publicBaseUrl + objectKey` (no presigned URLs in notes for v1). |

## Features

- **Single-image actions:** upload, localize, download (context menu + commands).
- **Note-wide batch:** upload all local images; localize all remote images in the current note (download is single-image only).
- **Storage profiles:** AWS S3, Cloudflare R2, Alibaba Cloud OSS, Tencent Cloud COS, and S3-compatible custom endpoints (e.g. MinIO).
- **Templates:** local path template and per-profile object key template with shared name tokens (`noteFileName`, `noteFolderName`, `noteFilePath`, `noteFolderPath`, `date`, `uuid`, `random`, `originalName`, `ext`).
- **Link style:** Wiki or Markdown for local paths (default Wiki); **remote http(s) URLs always use Markdown** `![](https://...)`. Commands convert image links in the current note between Wiki and Markdown.
- **Delete source after upload** (optional): after a successful upload and link replace, move the local source into Obsidian’s trash.
- **Gallery:** ribbon entry to open the gallery, browse, search, and manage objects for a profile.

## How to trigger

- **Image context menu** — Markdown **edit** views (Live Preview / Source with a rendered image). Reading/preview mode keeps Obsidian’s native image menu.
- **Command palette** — upload / localize / download current image; batch upload / localize; convert links to Wiki or Markdown.
- **Settings → LanTai** — General (attachment base, local path template, link style) and S3 (profiles, active profile, delete-after-upload).
- **Ribbon** — Gallery.

## Limitations

- Desktop only; no paste/drag **auto-upload** in v1 (new image files still use the plugin path template).
- No note-wide batch “download / save as”.
- Preview/reading mode does not take over the image menu.
- Localize/upload write conflicts fail with a notice (no overwrite, no auto suffix); **new** images dedupe like Obsidian (`name 1`).
- Image compression, OCR, and toolkit-style tools are not shipped yet (related settings stubs are hidden).

## Contributing & releasing

- [Contributing](CONTRIBUTING.md) ([中文](CONTRIBUTING.zh.md)) — unit tests are required for behavioral changes before a PR.
- [Releasing](RELEASE.md) ([中文](RELEASE.zh.md)) — maintainer release flow.

## License

MIT
