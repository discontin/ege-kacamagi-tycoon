# Olive Coast: Resort Tycoon — UI Design Reference

## Instructions for Stitch

Use this document as the visual reference for new Olive Coast screens. Extend the existing pause and office UI into a main menu, settings screen, and onboarding screen. Preserve the recognizable identity of the existing game.

This document describes the current implemented UI from its source files. New screen requirements are listed separately below. It is not a screenshot reference or a request to change game mechanics.

The current palette is **deep teal, warm cream, and amber**, with mint accents. This takes precedence over any earlier generic suggestion to use olive green as the primary UI color. “Olive Coast” is the game name, not an instruction to recolor the interface.

Write all design instructions in English, but keep player-facing copy in Turkish. Support longer English translations without clipping. The current game includes a Turkish / English language selector.

## 1. Identity

- Game title: **Olive Coast: Resort Tycoon**.
- Setting: a relaxed Mediterranean coastal resort with olive trees, turquoise water, sunny terraces, and low-poly scenery.
- UI character: friendly, rounded, clear, and lightly tactile.
- Use solid cream surfaces, teal header strips, circular icon badges, pill tabs, and amber action buttons.
- Keep decorative imagery mainly in the background and tutorial illustrations. Functional panels should stay readable and simple.
- Avoid introducing a corporate dashboard, dark futuristic UI, glass panels, ornate wooden frames, heavy outlines, or a new font family.

## 2. Color tokens

These values come from the current pause and office skin in `src/resort/stitch-menus.css`.

| Token | Value | Usage |
| --- | --- | --- |
| Primary teal | `#00696D` | Header strips, selected tabs, sliders, progress fills, music play button |
| Teal lower edge | `#073C40` | Solid shadow beneath the main panel |
| Active-tab lower edge | `#005154` | Selected pill-tab shadow |
| Main cream | `#FEF9EE` | Main panel and content background |
| Card cream | `#F8F3E8` | Settings, music, rewards, and skill cards |
| Heading inset | `#F1EDE3` | Pause heading background |
| Tab track | `#F0EBE1` | Segmented navigation background |
| White | `#FFFFFF` | Employee cards and nested reward rows |
| Warm divider | `#E8DFCF` | Fine card borders and separators |
| Primary amber | `#F59E0B` | Resume and upgrade actions, important icon badges |
| Amber lower edge | `#A86200` | Resume button's solid bottom shadow |
| Upgrade lower edge | `#B56C00` | Upgrade button's solid bottom shadow |
| Amber text | `#4A2E00` | Resume button label |
| Main text | `#25241E` | Body text and employee skill names |
| Warm heading text | `#704805` | Small section headings |
| Muted text | `#685C4B` | Supporting information |
| Mint accent | `#9DE4DF` | Music and reward icon backgrounds |
| Avatar mint | `#B8EAE8` | Employee avatar backgrounds |
| Disabled background | `#E7E2D7` | Unavailable or completed upgrade buttons |
| Disabled text | `#675D4F` | Disabled button labels |
| Destructive text | `#A63A1D` | New-village/reset action |
| Pause overlay | `#092F36B8` | Dimmed gameplay backdrop, with approximately 4px blur |

Use amber for the most important progression or play action. Use teal for navigation and selected states. Neutral actions use warm cream. Reserve the destructive color for actions that can discard progress.

## 3. Typography and spacing

The implemented font stack is `Inter, "Segoe UI", Arial, sans-serif`. Inter is named in CSS but is not bundled through a font import in the inspected entry page. Preserve this sans-serif character rather than introducing a display serif or handwritten font.

- Main panel headings: approximately 23–24px, bold.
- Resume action: approximately 22px, very bold.
- Section headings: approximately 13–14px, bold.
- Ordinary buttons: approximately 11–13px, bold.
- Supporting copy: approximately 10–12px in the current UI.
- Small uppercase labels use restrained letter spacing.
- Typical panel padding: 22–30px; card padding: 11–16px; gaps: 9–16px.

For new screens, improve readability when space allows: use roughly 14–16px explanatory text rather than copying the smallest existing labels into long paragraphs. Keep the same typeface, weight hierarchy, and density of controls.

## 4. Shared component language

### Panel shell

- Large warm-cream surface with a full-width solid teal header.
- Rounded outer corners: approximately 25–28px on desktop, 20–22px on narrow screens.
- No thick decorative frame in the current Stitch skin.
- A dark teal solid bottom shadow creates a shallow raised effect, with a soft outer shadow behind it.
- White header text; translucent white badges and circular close buttons.
- Example pause shell shadow: `0 8px 0 #073C40, 0 30px 90px #042C3C88`.

### Cards

- Warm off-white or white, with subtle warm borders.
- Approximately 14–16px corner radius; employee cards use 20px.
- Avoid stacking strong shadows on every nested card.
- Group related information rather than adding decorative containers around every label.

### Buttons and navigation

- Main resume/play action: amber, dark brown text, rounded corners, visible lower shadow.
- Resume reference: 60px high, 16px corner radius, `0 5px 0 #A86200` shadow.
- Upgrade action: amber pill button, optional separate cream cost badge.
- Selected tab: teal pill with white text and a subtle bottom shadow.
- Unselected tab: transparent on a warm neutral pill track.
- Neutral button: warm cream, restrained border, darker text.
- Close button: circular translucent white button in the teal header.
- Disabled actions: neutral fill, no raised shadow, clearly readable status text.
- Show default, hover, pressed, keyboard-focus, and disabled states. New states must preserve the same color family; use a visible focus ring.

### Icons and indicators

- Simple, compact symbols with consistent weight.
- Circular mint or amber icon backgrounds; circular employee initials.
- Teal slider thumb and active track with a visible percentage value.
- Three-segment skill meter: neutral empty segments, teal filled segments.
- Use text or symbols alongside color to communicate status.

## 5. Existing reference: ESC / pause screen

Preserve this information hierarchy when designing additions:

1. Teal header: `☀ OLIVE COAST`, `MOLA ZAMANI` status badge, circular close button.
2. Inset heading: amber pause badge, `OYUN DURAKLATILDI`, game title, and a short welcoming sentence.
3. Full-width amber primary action: `Oyuna dön`, with an `ESC` keyboard badge.
4. Two-column content area on desktop:
   - Left: sound-effects slider, music player with track information and music volume, Turkish / English selector.
   - Right: optional reward cards, local-save status, and the subdued destructive `Yeni köy kur` action.

The pause panel is currently capped at approximately 830px wide and 94% of viewport height. Content scrolls inside the panel when necessary. At 680px and below, the content becomes one column.

Do not silently remove the music player, language selector, optional rewards, or save status when presenting an updated pause-screen concept. A separate settings screen can reuse those components; removing or moving existing features is a product decision, not a visual styling change.

The reset confirmation is a separate existing dialog. It still uses an older, more framed teal-and-gold style from `game-menus.css`. Do not mistake that legacy variation for the primary reference. A new confirmation concept should use the shared cream-and-teal shell, while retaining a clear warning and distinct cancel/confirm actions.

## 6. Existing reference: office screen

- Centered cream panel, approximately 840px maximum width and 90% of viewport height.
- Teal header containing `OLIVE COAST`, `İşletme ofisi`, a short description, employee count, and close control.
- Pill navigation: `Ekip yükseltmeleri` and `Çamaşırhane`.
- Staff tab: three employee-card columns on desktop. Each card contains a circular initial avatar, name, role, level badge, and skill blocks.
- Each skill block contains an icon, skill name, short benefit description, level indicator, three-segment meter, and amber `Geliştir` action with a price badge.
- Reception staff have the service-speed upgrade; other roles also have walking and carrying upgrades. Do not invent extra skill categories.
- Laundry tab: a department card for machine capacity and clean-towel purchasing.
- Include clear unavailable states such as `EN İYİ SEVİYE` and `RAF DOLU`.
- Include an empty staff state, rather than fabricated employees when none exist.
- At 680px and below, employee cards stack vertically; tabs remain usable; content scrolls inside the panel.

The new main menu and tutorial should look like companion screens to this office, using its tokens and components without inheriting its dense management layout.

## 7. Requested new screens — design proposals

These are requested concepts, not claims that the screens already exist in the game.

### Main menu

- Mediterranean resort background with a clear cream-and-teal menu surface.
- Title: `Olive Coast`; subtitle: `Resort Tycoon`.
- Actions: `Devam Et`, `Yeni Oyun`, `Nasıl Oynanır`, `Ayarlar`.
- Show `Devam Et` only when a usable saved game exists.
- Make the relevant play action amber and prominent: `Yeni Oyun` for a new player, `Devam Et` for a returning player.
- Reuse the existing sun symbol and visual identity; do not invent a replacement logo.
- Starting a new game when progress exists should have an explicit confirmation.

### Settings

- Reuse the cream panel shell, teal header, sliders, percentage outputs, and language selector.
- Labels: `Müzik`, `Ses Efektleri`, and `Geri`.
- Accessible from both the main menu and the pause menu, with a clear return path to the originating screen.
- Do not add unrequested graphics settings, account systems, subscriptions, or purchases.

### How to play / first-time onboarding

One concise screen with three illustrated steps:

| Title | Supporting copy |
| --- | --- |
| `Misafirlerini Ağırla` | `Misafirlerine yer aç ve ihtiyaçlarını karşıla.` |
| `Gelir Kazan` | `Sunduğun hizmetlerden para kazan.` |
| `Tesisini Geliştir` | `Kazancını yeni alanlara ve iyileştirmelere yatır.` |

- Reuse rounded cards, mint icon badges, teal headings, and an amber main action.
- Use simple low-poly resort illustrations consistent with the game setting.
- On first launch: primary action `Başlayalım`, secondary action `Atla`.
- When opened from a menu: `Geri`.
- Include a compact `Kontroller` area with editable placeholders. Actual input mappings are outside this document; do not invent them.
- Keep onboarding separate from the dense office-management screen.

## 8. Responsive layout and usability

- Provide desktop concepts at 1920×1080 or another 16:9 resolution, plus a narrow-screen adaptation.
- Keep panels within the viewport; long content should scroll without hiding the close or return action.
- Collapse multi-column layouts rather than shrinking all text.
- Keep button labels on screen in both Turkish and English.
- For new screens, target at least 44px touch areas for principal controls. This is a new usability target, not the current size of every existing control.
- Keep main actions visually dominant, support keyboard focus, and distinguish destructive actions from resume/play actions.
- Use a short, restrained fade/scale transition; avoid constant decorative motion and provide a reduced-motion alternative.

## 9. Delivery checklist for Stitch

Produce a main menu, settings screen, and onboarding screen that clearly belong to the existing pause and office UI. If an updated pause concept is included, retain its current functional content.

Before finalizing, verify:

- Teal `#00696D`, cream `#FEF9EE`, and amber `#F59E0B` remain the defining palette.
- Panel shells, card corners, pills, avatars, sliders, and button shadows are consistent across screens.
- Player-facing copy is Turkish; translation expansion is accommodated.
- New-player, returning-player, and confirmation states are shown.
- Desktop and narrow layouts remain readable.
- No existing office or pause feature is removed without an explicit product instruction.
- New screen concepts are not presented as already implemented gameplay.

## Source provenance

Prepared from the current project source on 2026-10-01:

- `src/resort/stitch-menus.css`: current pause and office visual skin, tokens, sizing, and responsive overrides.
- `src/resort/UI.ts`: current content, labels, component hierarchy, and stylesheet import order.
- `src/resort/style.css`: base font stack and global control defaults.
- `src/resort/game-menus.css`: underlying pause/reset styles; the pause skin overrides these.
- `src/resort/office-window.css`: underlying office styles; the current skin overrides these.
- `src/resort/gameplay-stitch.css`: related teal-and-amber gameplay HUD styling.

The local source paths document provenance. This file is self-contained; Stitch does not need access to the repository to use the reference.
