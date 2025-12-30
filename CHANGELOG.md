# Changelog

## [0.4.2] - 2025-12-31

### Fixes
- Restore full-titlebar drag region while keeping window controls clickable.
- Allow custom titlebar buttons to minimize, maximize, and close the window.

## [0.4.1] - 2025-12-30

### Features
- Store dropped IO DLLs under the config IO folder and update paths automatically.
- Show update notes from the local CHANGELOG instead of remote release body.
- Add a dedicated light theme background.

## [0.4.0] - 2025-12-30

### Features
- Redesign the app shell with a custom titlebar, navigation rails, and layered backgrounds.
- Overhaul the games page layout with Library/Overview/News sections and a fixed launch CTA.
- Add a news panel placeholder and refreshed launch controls.
- Add a config toolbar with trust status display.
- Enable drag-and-drop in OptionField and ManageModsPage.
- Add auto-detection for game folders and VHDs in GameEditorDialog.

## [0.3.0] - 2025-12-24

### Features
- Add VHD support for game launching and configuration.
- Enhance VHD mounting with elevation support and helper functionality.
- Implement launch progress tracking and update UI for game launching.
- Enhance GameEditorDialog with dynamic panel height adjustments, radio buttons for launch mode, and improved layout.
- Add canonical game name handling.

## [0.2.3] - 2025-12-24

### Features
- Set `SEGATOOLS_CONFIG_PATH` environment variable for game launch.
- Refactor segatools path handling and improve game launch commands.
- Add `FSDECRYPT_KEY_URL_STORAGE_KEY` for managing decryption key URLs in local storage.
