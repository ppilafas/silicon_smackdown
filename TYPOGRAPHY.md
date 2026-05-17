# Typography System Reference

This document outlines the centralized typography system for Silicon Smackdown. All text styles are defined in `index.css` using Tailwind's `@apply` directive for consistency across the application.

## 📋 Quick Reference

### Display Text (Hero & Headers)

| Class | Usage | Example |
|-------|-------|---------|
| `.text-display-hero` | Main hero titles | App title on splash screen |
| `.text-display-large` | Large section headers | Major page headings |
| `.text-display-medium` | Medium headers | Sub-section titles |

**Example:**
```tsx
<h1 className="text-display-hero">Silicon Smackdown</h1>
```

---

### Headings (Sections & Components)

| Class | Usage | Example |
|-------|-------|---------|
| `.text-heading-primary` | Primary component headings | "Silicon Smackdown" in header |
| `.text-heading-secondary` | Secondary headings | Rivalry card titles |
| `.text-heading-tertiary` | Tertiary headings | Sub-component titles |

**Example:**
```tsx
<h2 className="text-heading-primary">Select Your Rivalry</h2>
<h3 className="text-heading-secondary">Logic vs. Hype</h3>
```

---

### Guest-Specific Text

| Class | Usage | Example |
|-------|-------|---------|
| `.text-guest-name` | Guest names | "Dr. Orion", "Luna Nova" |
| `.text-guest-role` | Guest roles | "Philosopher & Ethicist" |
| `.text-guest-personality` | Personality descriptions | Guest card personality text |

**Example:**
```tsx
<h3 className="text-guest-name">{guest.name}</h3>
<p className="text-guest-role">{guest.role}</p>
<p className="text-guest-personality">"{guest.personality}"</p>
```

---

### Labels & Metadata

| Class | Usage | Example |
|-------|-------|---------|
| `.text-label-primary` | Primary labels | "Live Feed", section labels |
| `.text-label-secondary` | Secondary labels | "Global Discussion Log" |
| `.text-label-accent` | Accent labels | "Syncing Live Conversation..." |

**Example:**
```tsx
<span className="text-label-primary">Live Feed</span>
<span className="text-label-secondary">Global Discussion Log</span>
```

---

### Status Indicators

| Class | Usage | Color | Example |
|-------|-------|-------|---------|
| `.text-status-active` | Active states | Emerald | "Broadcasting" |
| `.text-status-inactive` | Inactive states | Slate | "Standby", "Offline" |
| `.text-status-error` | Error states | Red | "Err: Offline" |
| `.text-status-warning` | Warning states | Amber | "Thinking..." |

**Example:**
```tsx
<span className="text-status-active">Broadcasting</span>
<span className="text-status-error">Connection Failed</span>
```

---

### Body Text (Content)

| Class | Usage | Example |
|-------|-------|---------|
| `.text-body-large` | Large body text | Main content paragraphs |
| `.text-body-medium` | Medium body text | Standard descriptions |
| `.text-body-small` | Small body text | Helper text, captions |
| `.text-body-tiny` | Tiny body text | Micro-copy, hints |

**Example:**
```tsx
<p className="text-body-medium">This is a standard paragraph.</p>
<p className="text-body-tiny">Click mic to mute</p>
```

---

### Transcription Text

| Class | Usage | Example |
|-------|-------|---------|
| `.text-transcript-speaker` | Base speaker style | All speakers |
| `.text-transcript-speaker-user` | User speaker | "MODERATOR" |
| `.text-transcript-speaker-ai` | AI speaker | "DR. ORION" |
| `.text-transcript-content` | Base content style | All messages |
| `.text-transcript-content-user` | User message content | Moderator messages |
| `.text-transcript-content-ai` | AI message content | Guest messages |

**Example:**
```tsx
<div className="text-transcript-speaker-user">MODERATOR</div>
<div className="text-transcript-content-user">{message}</div>
```

---

### Buttons & Interactive Elements

| Class | Usage | Example |
|-------|-------|---------|
| `.text-button-primary` | Primary buttons | "Start Discussion", "Shut Down" |
| `.text-button-secondary` | Secondary buttons | Language switcher, "Send" |
| `.text-button-large` | Large buttons | Hero CTAs |

**Example:**
```tsx
<button className="text-button-primary">Start Discussion</button>
<button className="text-button-secondary">EN</button>
```

---

### Badges & Tags

| Class | Usage | Example |
|-------|-------|---------|
| `.text-badge` | Small badges | "Beta" badge |
| `.text-tag` | Tags | Feature tags, labels |

**Example:**
```tsx
<span className="text-badge bg-amber-500/20 text-amber-400">Beta</span>
```

---

### Monospace (Technical Text)

| Class | Usage | Example |
|-------|-------|---------|
| `.text-mono-small` | Small monospace | Version numbers, IDs |
| `.text-mono-tiny` | Tiny monospace | Technical metadata |

**Example:**
```tsx
<p className="text-mono-small">v1.0.0-alpha</p>
```

---

### Special Effects

| Class | Effect | Usage |
|-------|--------|-------|
| `.text-glow-indigo` | Indigo glow | Highlighted text |
| `.text-glow-emerald` | Emerald glow | Success states |
| `.text-glow-red` | Red glow | Error states |

**Example:**
```tsx
<h1 className="text-display-hero text-glow-indigo">Silicon Smackdown</h1>
```

---

### Utility Classes

| Class | Effect | Usage |
|-------|--------|-------|
| `.text-ellipsis-2` | 2-line truncation | Long text overflow |
| `.text-ellipsis-3` | 3-line truncation | Multi-line overflow |

**Example:**
```tsx
<p className="text-body-medium text-ellipsis-2">{longDescription}</p>
```

---

## 🎨 Design Tokens

### Font Sizes
- **Hero:** 4xl → 5xl → 6xl (responsive)
- **Large:** 3xl → 4xl (responsive)
- **Medium:** 2xl → 3xl (responsive)
- **Heading Primary:** xl → 2xl (responsive)
- **Heading Secondary:** lg → xl (responsive)
- **Body Large:** base (16px)
- **Body Medium:** sm (14px)
- **Body Small:** xs (12px)
- **Body Tiny:** 10px
- **Micro:** 8px

### Font Weights
- **Black:** 900 (Display text, guest names)
- **Bold:** 700 (Headings, buttons)
- **Semibold:** 600 (Tertiary headings)
- **Medium:** 500 (Labels)

### Letter Spacing
- **Tighter:** -0.05em (Display text)
- **Tight:** -0.025em (Headings)
- **Wide:** 0.05em (Transcription)
- **Wider:** 0.1em (Badges)
- **Widest:** 0.15em (Buttons)
- **Custom:** 0.2em, 0.3em (Guest roles, labels)

### Line Heights
- **Relaxed:** 1.625 (Body text)
- **Normal:** 1.5 (Default)

### Text Colors
- **White:** Primary text
- **Slate-200:** Secondary text
- **Slate-300:** Tertiary text
- **Slate-400:** Muted text
- **Slate-500:** Very muted text
- **Indigo-400:** Accent (user/moderator)
- **Emerald-400:** Success/active (AI guests)
- **Red-400:** Error states
- **Amber-400:** Warning states

---

## 📝 Usage Guidelines

### 1. Always Use Typography Classes
❌ **Don't:**
```tsx
<h1 className="text-2xl font-bold text-white uppercase">Title</h1>
```

✅ **Do:**
```tsx
<h1 className="text-heading-primary uppercase">Title</h1>
```

### 2. Combine with Utility Classes
Typography classes can be combined with other Tailwind utilities:
```tsx
<p className="text-body-medium mb-4 text-center">Centered text with margin</p>
```

### 3. Override When Necessary
If you need to override a specific property:
```tsx
<span className="text-label-primary text-red-400">Error Label</span>
```

### 4. Responsive Design
Display and heading classes include responsive breakpoints:
- Mobile: Base size
- Tablet (md): Medium size
- Desktop (lg): Large size

---

## 🔄 Migration Checklist

When updating existing components:

- [ ] Replace inline font size classes with typography classes
- [ ] Replace inline font weight classes with typography classes
- [ ] Replace inline letter spacing with typography classes
- [ ] Replace inline text color with typography classes (where appropriate)
- [ ] Test responsive behavior
- [ ] Verify visual consistency

---

## 🛠️ Maintenance

### Adding New Typography Classes

1. Open `index.css`
2. Add new class in the appropriate section
3. Use `@apply` with Tailwind utilities
4. Document in this file
5. Update components

**Example:**
```css
.text-custom-style {
  @apply text-lg font-semibold text-purple-400 tracking-wide;
}
```

### Modifying Existing Classes

1. Update the class definition in `index.css`
2. Test across all components using that class
3. Update this documentation if behavior changes

---

## 📦 Component Mapping

### App.tsx
- Header title: `.text-heading-primary`
- Version: `.text-mono-small`
- Language buttons: `.text-button-secondary`
- Start/Stop button: `.text-button-primary`
- Mic label: `.text-button-secondary`
- Helper text: `.text-body-tiny`
- Section labels: `.text-label-primary`, `.text-label-secondary`
- Host input: `.text-body-small`

### GuestCard.tsx
- Guest name: `.text-guest-name`
- Guest role: `.text-guest-role`
- Personality: `.text-guest-personality`
- Status text: `.text-status-active`, `.text-status-inactive`, `.text-status-error`
- Thinking indicator: `.text-status-warning`

### TranscriptionFeed.tsx
- Empty state: `.text-body-small`
- Speaker names: `.text-transcript-speaker-user`, `.text-transcript-speaker-ai`
- Message content: Uses default styling with color classes
- Speaking indicator: `.text-body-tiny`

### GuestSelector.tsx
- Rivalry title: `.text-heading-secondary`
- Description: `.text-body-small`
- Select button: `.text-button-secondary`

---

## 🎯 Best Practices

1. **Consistency First:** Always use typography classes instead of inline styles
2. **Semantic Naming:** Choose classes based on purpose, not appearance
3. **Responsive by Default:** Display and heading classes adapt to screen size
4. **Combine Wisely:** Layer typography classes with spacing and color utilities
5. **Document Changes:** Update this file when adding new typography classes

---

**Last Updated:** January 21, 2026  
**Version:** 1.0.0
