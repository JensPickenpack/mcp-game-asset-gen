import { execFile } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getPPQAIKey } from '../utils/imageUtils.js';

const execFileAsync = promisify(execFile);

// Allowed TTS models only (exclude music, STT and realtime voice chat models)
export const TTS_MODELS = [
    'deepgram_aura_2',
    'eleven_flash_v2_5',
    'eleven_v3',
] as const;

export type TTSModel = typeof TTS_MODELS[number];

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
    model?: TTSModel;
    voice?: TTSVoice;
}

export interface TranscribeAudioOptions {
    filePath: string;
    model?: string;
    response_format?: string;
    language?: string;
    prompt?: string;
}

const parsePositiveIntEnv = (name: string, fallback: number): number => {
    const value = Number(process.env[name]);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
};

const parseBooleanEnv = (name: string, fallback: boolean): boolean => {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }

    const normalized = raw.toLowerCase().trim();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return fallback;
};

const CURL_CONNECT_TIMEOUT_SEC = parsePositiveIntEnv('PPQ_CURL_CONNECT_TIMEOUT_SEC', 30);
const CURL_MAX_TIME_SEC = parsePositiveIntEnv('PPQ_CURL_MAX_TIME_SEC', 300);
const CURL_RETRY_COUNT = parsePositiveIntEnv('PPQ_CURL_RETRY_COUNT', 2);
const CURL_RETRY_DELAY_SEC = parsePositiveIntEnv('PPQ_CURL_RETRY_DELAY_SEC', 2);
const CURL_USE_SSL_NO_REVOKE = parseBooleanEnv('PPQ_CURL_SSL_NO_REVOKE', process.platform === 'win32');

const redactSensitive = (value: string): string => {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9._-]+\b/g, 'sk-[REDACTED]');
};

const formatExecError = (prefix: string, error: unknown): Error => {
    if (!(error instanceof Error)) {
        return new Error(`${prefix}: unknown error`);
    }

    const execError = error as Error & {
        code?: string | number;
        stderr?: string;
        stdout?: string;
    };

    const parts: string[] = [];
    if (execError.code !== undefined) {
        parts.push(`code=${String(execError.code)}`);
    }

    const stderr = typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
    const stdout = typeof execError.stdout === 'string' ? execError.stdout.trim() : '';

    if (stderr) {
        parts.push(`stderr=${redactSensitive(stderr)}`);
    } else if (stdout) {
        parts.push(`stdout=${redactSensitive(stdout)}`);
    }

    if (parts.length === 0) {
        parts.push(redactSensitive(execError.message));
    }

    return new Error(`${prefix}: ${parts.join(' | ')}`);
};

// Text-to-Speech via PPQ.ai
// Note: TTS uses ppq.ai/api/v1/ (not api.ppq.ai/v1/)
export const ppqaiTextToSpeech = async (args: TextToSpeechOptions): Promise<string> => {
    const apiKey = getPPQAIKey();

    const model = args.model || 'deepgram_aura_2';
    const voice = args.voice || 'aura-2-apollo-en';

    if (!TTS_MODELS.includes(model)) {
        throw new Error(`Unsupported TTS model: ${model}. Allowed models: ${TTS_MODELS.join(', ')}`);
    }

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
        '--connect-timeout', String(CURL_CONNECT_TIMEOUT_SEC),
        '--max-time', String(CURL_MAX_TIME_SEC),
        '--retry', String(CURL_RETRY_COUNT),
        '--retry-delay', String(CURL_RETRY_DELAY_SEC),
        '--retry-all-errors',
        '-X', 'POST',
        'https://ppq.ai/api/v1/audio/speech',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify(body),
        '-o', args.outputPath,
    ];

    if (CURL_USE_SSL_NO_REVOKE) {
        curlArgs.unshift('--ssl-no-revoke');
    }

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
        throw formatExecError('TTS failed', error);
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
        '--connect-timeout', String(CURL_CONNECT_TIMEOUT_SEC),
        '--max-time', String(CURL_MAX_TIME_SEC),
        '--retry', String(CURL_RETRY_COUNT),
        '--retry-delay', String(CURL_RETRY_DELAY_SEC),
        '--retry-all-errors',
        '-X', 'POST',
        'https://ppq.ai/api/v1/audio/transcriptions',
        '-H', `Authorization: Bearer ${apiKey}`,
        '-F', `file=@${args.filePath}`,
        '-F', `model=${model}`,
    ];

    if (CURL_USE_SSL_NO_REVOKE) {
        curlArgs.unshift('--ssl-no-revoke');
    }

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
        throw formatExecError('STT failed', error);
    }
};
