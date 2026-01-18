<div align="center">
<img width="1200" height="475" alt="Silicon Smackdown Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Silicon Smackdown: AI Talk Show
### A Real-Time Gemini Live API Showcase
</div>

**Silicon Smackdown** is a high-fidelity, interactive AI talk show where **YOU** are the host. Moderate real-time, voice-enabled battles between legendary personalities powered by Google's Multimodal Gemini Live API.

## 🎙️ Features

- **Real-Time Voice Conversation**: Low-latency, full-duplex voice interaction using Gemini Live.
- **Dynamic Rivalry System**: Choose from curated pairs of guests with distinct personalities, voices, and system instructions.
- **Audio Visualization**: Real-time waveform visualization for both the host and AI guests.
- **Live Transcription**: Scrollable transcript of the conversation for accessibility and review.
- **Broadcast Quality UI**: Modern, dark-mode aesthetic with smooth animations and responsive design.
- **Landing Password Gate**: Optional password protection for private demos.

## 🎭 Featured Rivalries

*   **The Creator & The Rebel**: God vs. Satan (Cosmic Debate)
*   **The Exterminator & The Farmer**: Skynet vs. The Matrix (AI Apocalypse)
*   **The Hero & The Waiting Wife**: Odysseus vs. Penelope (Marital Confrontation)
*   **The Philosopher & The Band**: Socrates (Greek) vs. Socrates (Rock Band)
*   **The Simple & The Spark**: Forrest Gump vs. Nikola Tesla
*   **The Physicist & The Void**: Stephen Hawking vs. A Black Hole
*   **The President & The Plant**: George W. Bush vs. A Literal Bush
*   ...and many more!

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Google Gemini API Key

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ppilafas/silicon_smackdown.git
    cd silicon_smackdown
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file in the root directory and add your API key:
    ```env
    VITE_API_KEY=your_gemini_api_key_here
    # Optional landing password gate
    VITE_LANDING_PASSWORD=your_password_here
    ```

4.  **Run Locally:**
    ```bash
    npm run dev
    ```

5.  **Open in Browser:**
    Navigate to `http://localhost:5173` to start the show!

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TypeScript
- **AI/ML**: Google GenAI SDK (Gemini Live API)
- **Audio**: Web Audio API, AudioWorklet
- **Styling**: Tailwind CSS
- **Utilities**: i18next (i18n)

## 📄 License

MIT License. Built for the Google Gemini Developer Competition.
