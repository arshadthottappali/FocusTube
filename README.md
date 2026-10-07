# FocusTube

Turn any YouTube playlist into a distraction-free course with progress tracking and timestamped notes. Local learning needs no sign-up. Optional Google sign-in syncs learning data to Firebase.

## Features

- 🎥 **Distraction-Free Player** — Watch YouTube playlists without ads, recommendations, or comments
- 📊 **Progress Tracking** — Automatically tracks which videos you've completed and resumes where you left off
- 📝 **Timestamped Notes** — Take notes linked to specific moments in any video
- 📥 **Study Guide Export** — Download all your notes as a clean Markdown file
- 🏆 **Completion Celebration** — Confetti burst and summary when you finish a course
- 💾 **Backup & Restore** — Export/import your entire study history as JSON
- 🎯 **Focus Limit** — Set a cap on active courses to stay productive
- 🌙 **Light/Dark Mode** — Beautiful theming with light mode as default
- 🔒 **Local storage with optional cloud sync** — Signed-out learning data is stored in your browser. When you sign in, your name, courses, progress, notes and study settings sync to Firebase Firestore. YouTube, Google sign-in, thumbnail, font and metadata services also receive requests.

## Getting Started

1. Clone this repo
2. Open `index.html` with [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VS Code
3. Enter your name and start importing YouTube playlists!

## Tech Stack

- Vanilla HTML5, CSS3, JavaScript
- YouTube IFrame API
- Canvas Confetti (CDN)
- No frontend framework or build step
- Firebase Authentication and Firestore for optional cloud sync and shared courses

## License

MIT

## Security status

Shared-course creation and access are temporarily paused in this patch. The previous implementation stored passwords with course content and checked them in the browser. They were not meaningful access control. Existing records and old clients remain exposed if the deployed Firestore rules still allow reads. Secure password-protected sharing needs trusted server-side checks, restricted Firestore rules, and migration of existing records; frontend hashing alone does not fix it.

The Firebase browser configuration is public configuration, not an authorization mechanism. Firestore rules must restrict each user's learning record to that user. The deployed rules have not been verified by this patch.

Backups are plaintext JSON containing learning data and notes. Store them privately. Imported backups are validated before replacing data; links and authentication state cannot be chosen by a backup. Third-party scripts remain a separate supply-chain risk.

## Tests

Run `node --test tests/security.test.cjs` and `node --check main.js`. Browser regression tests in `tests/browser-security.cjs` use Playwright installed outside the project and a stubbed Firebase/YouTube environment. They never contact the production database.

### Required server-side containment (not deployed by this patch)

`firestore.rules.proposed` is a proposed complete ruleset for the two collections observed in this repository. Review the currently deployed rules and other consumers first. It denies all shared-course reads and writes, including old clients, while allowing a signed-in user to read/write only their own learning record. The default denies unknown collections. Do not deploy blindly if other applications use this Firebase project.

Deploy reviewed rules through the Firebase console or authorized tooling. Verify owner-only learning sync still works and unauthenticated/other-user reads fail. Review existing shared-course records, remove plaintext passwords through an approved cleanup, and rotate any passwords that were reused. The client patch does not perform this migration or delete records.
