# PWA Coffee Theme Design

## Goal

Make the app installable on Android as `咖Day`, add a basic offline app shell, and align the visual style with the provided coffee UI reference.

## Visual Direction

The UI uses a warm coffee palette:

- Cream background for the app shell.
- Deep coffee brown for primary cards and buttons.
- Caramel accents for highlights and small status elements.
- White or light cream cards for dense forms and lists.
- Rounded 8px controls, matching the existing app constraints.

The design stays utility-first rather than decorative. The reference image informs color, spacing, and mobile feel, but this step does not redesign every feature screen into a full mockup.

## PWA Scope

This step adds:

- `manifest.webmanifest`
- Android-friendly app name `咖Day`
- App icons
- Theme color and mobile metadata
- Service worker registration
- Basic app-shell caching
- Online/offline status display

This step does not add offline create/edit queues, IndexedDB sync, or conflict resolution.

## Offline Behavior

When online, the app works as before. When offline after a prior successful load, the service worker can serve the cached app shell and static assets. Cloud writes, login, backup import/export metadata, and DeepSeek recommendations still require network.

## Acceptance

- The app title and manifest name are `咖Day`.
- Android Chrome can offer install/add-to-home-screen when opened from GitHub Pages.
- The page shows current online/offline state.
- Production build succeeds.
