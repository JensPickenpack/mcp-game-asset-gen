import { execFile } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getPPQAIKey } from '../utils/imageUtils.js';

const execFileAsync = promisify(execFile);

// TTS voices available
export const TTS_VOICES = [
    'aura-2-arcas-en',
    'aura-2-thalia-en',
    'aura-2-andromeda-en',
    'aura-2-helena-en',
    'aura-2-apollo-en',
    'aura-2-aries-en',
] as const;

export type TTSVoice = typeof TTS_VOICES[number];

// STT supported formats
export const STT_FORMATS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'] as const;

export interface TextToSpeechOptions {
    input: string;
    outputPath: string;
    model?: string;
    voice?: TTSVoice;
}

export interface TranscribeAudioOptions {
    filePath: string;
    model?: string;
    response_format?: string;
    language?: string;
    prompt?: string;
}

// Text-to-Speech via PPQ.ai
// Note: TTS uses ppq.ai/api/v1/ (not api.ppq.ai/v1/)
export const ppqaiTextToSpeech = async (args: TextToSpeechOptions): Promise<string> => {
    const apiKey = getPPQAIKey();

    const model = args.model || 'deepgram_aura_2';
    const voice = args.voice || 'aura-2-apollo-en';

    const body = {
        input: args.input,
        model,
        voice,
    };

    // Ensure output directory exists
    const outputDir = path.dirname(args.outputPath);
    mkdirSync(outputDir, { recursive: true });

    // Use curl to make the request and save the audio stream directly
    const curlArgs = [
        '-s',
        '-X', 'POST',
        'https://ppq.ai/api/v1/audio/speech',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify(body),
        '-o', args.outputPath,
    ];

    try {
        await execFileAsync('curl', curlArgs, { maxBuffer: 1024 * 1024 * 50 });

        return JSON.stringify({
            provider: 'PPQ.ai',
            operation: 'text_to_speech',
            model,
            voice,
            savedPath: args.outputPath,
            input_length: args.input.length,
        });
    } catch (error) {
        throw new Error(`TTS failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Speech-to-Text (Transcription) via PPQ.ai
// Note: STT uses ppq.ai/api/v1/ (not api.ppq.ai/v1/)
export const ppqaiTranscribeAudio = async (args: TranscribeAudioOptions): Promise<string> => {
    const apiKey = getPPQAIKey();

    const model = args.model || 'nova-3';

    // Use curl with multipart form data for file upload
    const curlArgs = [
        '-s',
        '-X', 'POST',
        'https://ppq.ai/api/v1/audio/transcriptions',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-F', `file=@${args.filePath}`,
        '-F', `model=${model}`,
    ];

    if (args.response_format) {
        curlArgs.push('-F', `response_format=${args.response_format}`);
    }
    if (args.language) {
        curlArgs.push('-F', `language=${args.language}`);
    }
    if (args.prompt) {
        curlArgs.push('-F', `prompt=${args.prompt}`);
    }

    try {
        const { stdout } = await execFileAsync('curl', curlArgs, { maxBuffer: 1024 * 1024 * 10 });

        let result;
        try {
            result = JSON.parse(stdout);
        } catch {
            // If response is plain text (e.g., when response_format=text), wrap it
            result = { text: stdout };
        }

        if (result.error) {
            throw new Error(`PPQ.ai STT error: ${result.error.message || JSON.stringify(result.error)}`);
        }

        return JSON.stringify({
            provider: 'PPQ.ai',
            operation: 'speech_to_text',
            model,
            text: result.text,
            language: result.language || args.language,
            duration: result.duration,
            input_file: args.filePath,
        });
    } catch (error) {
        throw new Error(`STT failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};
