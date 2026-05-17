/**
 * Debate Script Pre-Generation System
 * Generates full debate scripts using text-only LLM calls
 */

import { GoogleGenAI } from '@google/genai';
import { GuestProfile, RivalryPair } from '../types';

export interface DebateTurn {
  speaker: string;
  speakerId: string;
  text: string;
  turnNumber: number;
}

export interface GeneratedDebate {
  rivalryId: string;
  rivalryName: string;
  turns: DebateTurn[];
  generatedAt: number;
  totalTokens?: number;
}

/**
 * Generate a full debate script using a single LLM call
 */
export async function generateDebateScript(
  rivalry: RivalryPair,
  apiKey: string,
  numTurns: number = 10,
  language: string = 'en'
): Promise<GeneratedDebate> {
  const ai = new GoogleGenAI({ apiKey });

  // Build the orchestrator prompt
  const orchestratorPrompt = buildOrchestratorPrompt(rivalry, numTurns, language);

  console.log('\n========================================');
  console.log('[DebateGenerator] 🎬 Starting debate generation');
  console.log('[DebateGenerator] Rivalry:', rivalry.name);
  console.log('[DebateGenerator] Turns:', numTurns);
  console.log('[DebateGenerator] Language:', language);
  console.log('========================================\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: orchestratorPrompt,
      config: {
        temperature: 0.9, // High creativity for comedy
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            turns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  speaker: { type: 'string' },
                  text: { type: 'string' },
                  turnNumber: { type: 'number' }
                },
                required: ['speaker', 'text', 'turnNumber']
              }
            }
          },
          required: ['turns']
        }
      },
    });

    const text = response.text;
    
    console.log('\n========================================');
    console.log('[DebateGenerator] ✅ Generation complete');
    console.log('[DebateGenerator] Response length:', text.length, 'characters');
    console.log('[DebateGenerator] Raw response:');
    console.log('----------------------------------------');
    console.log(text);
    console.log('----------------------------------------\n');

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError: any) {
      console.error('\n========================================');
      console.error('[DebateGenerator] ❌ JSON PARSING ERROR');
      console.error('Error:', parseError.message);
      console.error('Position:', parseError.message.match(/position (\d+)/)?.[1]);
      console.error('\nRaw response that failed to parse:');
      console.error('----------------------------------------');
      console.error(text);
      console.error('----------------------------------------');
      
      // Try to show context around error position
      const posMatch = parseError.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const start = Math.max(0, pos - 100);
        const end = Math.min(text.length, pos + 100);
        console.error('\nContext around error position:');
        console.error('----------------------------------------');
        console.error(text.substring(start, end));
        console.error('----------------------------------------\n');
      }
      
      throw new Error(`JSON parsing failed: ${parseError.message}. Check terminal for full response.`);
    }
    
    if (!parsed.turns || !Array.isArray(parsed.turns)) {
      console.error('\n========================================');
      console.error('[DebateGenerator] ❌ INVALID RESPONSE FORMAT');
      console.error('Expected "turns" array, got:', typeof parsed.turns);
      console.error('Full parsed object:', JSON.stringify(parsed, null, 2));
      console.error('========================================\n');
      throw new Error('Invalid response format: missing turns array');
    }

    // Map to our format
    const turns: DebateTurn[] = parsed.turns.map((turn: any, index: number) => {
      const guest = rivalry.guests.find(g => g.name === turn.speaker);
      return {
        speaker: turn.speaker,
        speakerId: guest?.id || `guest-${index}`,
        text: turn.text,
        turnNumber: turn.turnNumber || index + 1,
      };
    });

    const debate: GeneratedDebate = {
      rivalryId: rivalry.id,
      rivalryName: rivalry.name,
      turns,
      generatedAt: Date.now(),
      totalTokens: response.usageMetadata?.totalTokenCount,
    };

    console.log('[DebateGenerator] Successfully generated', turns.length, 'turns');
    console.log('[DebateGenerator] Total tokens:', debate.totalTokens);

    return debate;
  } catch (error: any) {
    console.error('\n========================================');
    console.error('[DebateGenerator] ❌ GENERATION FAILED');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('========================================\n');
    throw error;
  }
}

/**
 * Build the orchestrator prompt for debate generation
 */
function buildOrchestratorPrompt(
  rivalry: RivalryPair,
  numTurns: number,
  language: string
): string {
  const [guest1, guest2] = rivalry.guests;

  const languageInstruction = language === 'el'
    ? '\n\nIMPORTANT: Generate the entire debate in Greek. All dialogue must be in natural, modern Greek.'
    : '\n\nIMPORTANT: Generate the entire debate in English.';

  return `You are a comedy writer for "Silicon Smackdown," a hilarious AI debate show. Your task is to write a complete ${numTurns}-turn debate script.

RIVALRY: ${rivalry.name}
DESCRIPTION: ${rivalry.description}

CHARACTER 1: ${guest1.name}
Role: ${guest1.role}
Personality: ${guest1.personality}
Instructions: ${guest1.systemInstruction}

CHARACTER 2: ${guest2.name}
Role: ${guest2.role}
Personality: ${guest2.personality}
Instructions: ${guest2.systemInstruction}

GLOBAL COMEDY RULES:
- Lean into roasting, playful rival energy, and sharp humor
- Prefer concise, punchy lines over long explanations
- Each turn should have at least ONE moment worthy of a [LAUGH] tag
- Build on previous turns with callbacks and escalation
- Mix absurdism with character-specific humor
- Keep each response 15-25 seconds when spoken (~100-150 words)

DEBATE STRUCTURE (${numTurns} turns total):
- Start with establishing the absurd dynamic
- Escalate the roasting and competition
- Include running gags and callbacks
- Build to a comedic climax
- End with a satisfying punchline

TURN DISTRIBUTION:
- ${guest1.name}: ${Math.ceil(numTurns / 2)} turns
- ${guest2.name}: ${Math.floor(numTurns / 2)} turns
- Alternate between speakers

CRITICAL REQUIREMENTS:
1. Each turn must be a complete, standalone response
2. Use [LAUGH] tag after your best punchlines
3. Stay in character at all times
4. Reference the other character's previous points
5. Build narrative momentum across turns${languageInstruction}

OUTPUT FORMAT (JSON):
{
  "turns": [
    {
      "speaker": "${guest1.name}",
      "text": "Full dialogue text here with [LAUGH] tags...",
      "turnNumber": 1
    },
    {
      "speaker": "${guest2.name}",
      "text": "Full dialogue text here with [LAUGH] tags...",
      "turnNumber": 2
    }
    // ... continue for ${numTurns} turns total
  ]
}

Generate the complete debate now:`;
}
