<div align="center">
<img width="1200" height="475" alt="Silicon Smackdown Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Silicon Smackdown: AI Talk Show
### 🎭 Real-Time Voice AI Debate Platform Powered by Gemini Live API

[![Live Demo](https://img.shields.io/badge/🔴_Live-Demo-brightgreen)](https://your-demo-url.com)
[![Google Gemini](https://img.shields.io/badge/Powered_by-Google_Gemini-4285F4)](https://ai.google.dev/gemini-api)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

## 🌟 Overview

**Silicon Smackdown** is an innovative AI-powered talk show platform where legendary personalities engage in real-time voice debates. As the moderator, you control the conversation flow while AI guests powered by Google's Gemini Live API engage in witty banter, philosophical debates, and epic roast battles.

### � What Makes It Special

- **🎤 Full-Duplex Voice AI**: Real-time, low-latency voice conversations using Gemini 2.5 Flash with native audio
- **🤖 Dynamic AI Personalities**: 20+ pre-configured character pairs with unique voices, personalities, and debate styles
- **🎨 Contextual Avatars**: Character-specific DiceBear avatars that match each personality
- **🎬 Broadcast-Quality UX**: Polished, modern UI with smooth animations and real-time audio visualization
- **🌍 Multilingual Support**: English and Greek language support with i18next
- **⚡ Smart Conversation Flow**: Automated turn-taking with intelligent prompting and roast battle mechanics

## ✨ Key Features

### 🎙️ **Voice & Audio**
- **Real-time audio streaming** with Web Audio API and AudioWorklet
- **Live waveform visualization** for both host and AI guests
- **Audience laughter effects** triggered by AI humor detection
- **Microphone mute control** for moderator intervention
- **Audio quality indicators** showing connection status

### 🎭 **AI Conversation System**
- **Typed state machine** managing conversation flow with useReducer
- **Automatic turn-taking** between AI guests
- **Streaming transcription** with real-time updates
- **Context-aware prompting** maintaining conversation coherence
- **Roast battle mechanics** with opening statements and rebuttals

### 🎨 **User Experience**
- **Rivalry selection screen** with 10+ curated matchups
- **Pause/Resume functionality** with seamless conversation continuation
- **Live transcription feed** showing full conversation history
- **Host input system** for moderator interjections
- **Password-protected landing page** for private demos

### 🏗️ **Architecture**
- **Custom React hooks** for state management (useConversationState, useTranscription, useAudioPipeline, useGeminiSessions)
- **Modular component design** with TypeScript for type safety
- **Efficient audio pipeline** with fallback mechanisms
- **Session management** with auto-reconnection logic

## 🎭 Featured Rivalries

Choose from 10+ curated matchups, each with unique personalities and debate dynamics:

| Rivalry | Characters | Theme |
|---------|-----------|-------|
| **Logic vs. Hype** | Dr. Orion 🤖 vs. Luna Nova 🚀 | Philosophy vs. Futurism |
| **Detective & Mastermind** | Sherlock 🔍 vs. Moriarty 🎩 | Genius vs. Criminal Mind |
| **The Genius & The Spider** | Tony Stark 🦾 vs. Peter Parker 🕷️ | Mentor vs. Protégé |
| **Jedi Master & Apprentice** | Master Yoda ⚔️ vs. Luke Skywalker 🌟 | Wisdom vs. Youth |
| **The Relativist & The Quantum** | Einstein 🧠 vs. Niels Bohr ⚛️ | Physics Debate |
| **The Teacher & The Student** | Walter White 🧪 vs. Jesse Pinkman 💊 | Breaking Bad Dynamics |
| **King & Queen** | Jon Snow ❄️ vs. Daenerys Targaryen 🐉 | Power Struggle |
| **The Mighty Pirate & Ghost** | Guybrush 🏴‍☠️ vs. Captain LeChuck 👻 | Retro Gaming Legends |

*Each rivalry features custom system instructions, unique voices, and personality-driven conversation styles.*

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher
- **Google Gemini API Key** ([Get one here](https://ai.google.dev/gemini-api/docs/api-key))
- **Modern browser** with microphone access

### Installation

```bash
# Clone the repository
git clone https://github.com/ppilafas/silicon_smackdown.git
cd silicon_smackdown

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

### Configuration

Edit `.env.local` and add your credentials:

```env
# Required: Your Gemini API key
VITE_API_KEY=your_gemini_api_key_here

# Optional: Password protection for landing page
VITE_LANDING_PASSWORD=your_password_here
```

### Run Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000` and grant microphone permissions when prompted.

### Build for Production

```bash
npm run build
npm run preview
```

## 🎮 How to Use

1. **Select a Rivalry** - Choose from 10+ pre-configured character matchups
2. **Start Discussion** - Click to initialize AI guest connections
3. **Start Show** - Click the green "START SHOW" button to begin the roast battle
4. **Moderate** - Use your microphone to interject or click to mute and let AI guests talk freely
5. **Pause/Resume** - Control the conversation flow with the pause button
6. **Enjoy** - Watch the AI personalities engage in witty debates and roasts!

## 🛠️ Tech Stack

### Core Technologies
- **React 19** - Latest React with concurrent features
- **TypeScript 5.0** - Type-safe development
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first styling

### AI & Audio
- **Google GenAI SDK** - Gemini 2.5 Flash Live API integration
- **Web Audio API** - Real-time audio processing
- **AudioWorklet** - High-performance audio capture
- **i18next** - Internationalization (EN/EL)

### State Management
- **Custom React Hooks** - Modular state management
  - `useConversationState` - Typed reducer for conversation flow
  - `useTranscription` - Streaming transcription management
  - `useAudioPipeline` - Audio capture and playback
  - `useGeminiSessions` - Multi-session AI management

### UI/UX
- **DiceBear Avatars** - Contextual character avatars
- **Lucide Icons** - Modern icon library
- **Custom Animations** - Smooth transitions and effects

## 🏗️ Project Structure

```
silicon-smackdown/
├── src/
│   ├── components/          # React components
│   │   ├── GuestCard.tsx   # AI guest display
│   │   ├── SplashScreen.tsx # Landing page
│   │   ├── Visualizer.tsx  # Audio waveform
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   │   ├── useConversationState.ts
│   │   ├── useTranscription.ts
│   │   ├── useAudioPipeline.ts
│   │   └── useGeminiSessions.ts
│   ├── utils/              # Utility functions
│   │   └── avatars.ts      # Avatar configuration
│   ├── constants.ts        # Character definitions
│   ├── types.ts           # TypeScript types
│   └── App.tsx            # Main application
├── public/                # Static assets
└── package.json
```

## 🎯 Key Implementation Details

### Conversation Flow
- **State Machine**: Typed reducer manages guest turns, speaking states, and prompts
- **Auto Turn-Taking**: Guests automatically respond to each other
- **Context Preservation**: Conversation history maintained across turns
- **Smart Prompting**: Dynamic prompts based on conversation state

### Audio Pipeline
- **Dual-Channel**: Separate audio streams for each AI guest
- **Real-time Processing**: AudioWorklet for low-latency capture
- **Visualization**: Live waveform analysis using AnalyserNode
- **Fallback System**: ScriptProcessor fallback for older browsers

### Session Management
- **Multi-Session**: Simultaneous connections to multiple AI guests
- **Auto-Reconnect**: Automatic reconnection on connection loss
- **Error Handling**: Graceful degradation with user feedback

## 🎨 Customization

### Adding New Rivalries

Edit `src/constants.ts` to add new character pairs:

```typescript
{
  id: 'your-rivalry-id',
  name: 'Your Rivalry Name',
  description: 'Description of the matchup',
  guests: [
    {
      id: 'guest-1',
      name: 'Character Name',
      role: 'Character Role',
      voice: GuestVoice.Puck, // or other voice
      avatarColor: 'bg-indigo-500',
      personality: 'Character personality description',
      systemInstruction: `Your detailed system prompt...`
    },
    // Second guest...
  ]
}
```

### Customizing Avatars

Edit `src/utils/avatars.ts` to configure character avatars:

```typescript
'Character Name': {
  style: 'personas', // or 'bottts-neutral', 'pixel-art'
  seed: 'unique-seed-string',
  gender: 'male' // or 'female'
}
```

## 🐛 Troubleshooting

**Microphone not working?**
- Grant microphone permissions in browser settings
- Check that no other app is using the microphone
- Try refreshing the page

**AI guests not responding?**
- Verify your Gemini API key is correct
- Check browser console for connection errors
- Ensure stable internet connection

**Audio quality issues?**
- Use headphones to prevent echo
- Check microphone input levels
- Ensure quiet environment for best results

## 📊 Performance

- **Initial Load**: ~2s (with code splitting)
- **AI Response Time**: 1-3s (depends on Gemini API)
- **Audio Latency**: <100ms (with AudioWorklet)
- **Memory Usage**: ~50-100MB (active session)

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - Built for the Google Gemini Developer Competition

## 🙏 Acknowledgments

- **Google Gemini Team** - For the incredible Live API
- **DiceBear** - For the avatar generation API
- **React Team** - For React 19 and concurrent features

---

<div align="center">

**[Live Demo](https://your-demo-url.com)** • **[Report Bug](https://github.com/ppilafas/silicon_smackdown/issues)** • **[Request Feature](https://github.com/ppilafas/silicon_smackdown/issues)**

Made with ❤️ for the AI community

</div>
