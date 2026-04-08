import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getPPQAIKey, makeHTTPRequest } from '../utils/imageUtils.js';

const execFileAsync = promisify(execFile);

// Video generation models
export const VIDEO_MODELS_T2V = [
    'veo3', 'veo3.1', 'veo3-fast',
    'kling-2.1-pro', 'kling-2.1-master', 'kling-2.5-turbo',
    'runway-gen4', 'runway-aleph',
    'xai/grok-imagine-video',
] as const;

export const VIDEO_MODELS_I2V = [
    'veo3-i2v',
    'kling-2.1-master-i2v', 'kling-2.5-turbo-i2v',
    'xai/grok-imagine-video-i2v',
] as const;

export const ALL_VIDEO_MODELS = [...VIDEO_MODELS_T2V, ...VIDEO_MODELS_I2V] as const;

export type VideoModelT2V = typeof VIDEO_MODELS_T2V[number];
export type VideoModelI2V = typeof VIDEO_MODELS_I2V[number];
export type VideoModel = typeof ALL_VIDEO_MODELS[number];

export interface VideoGenerationOptions {
    prompt: string;
    outputPath: string;
    model?: VideoModel;
    aspect_ratio?: string;
    duration?: number;
    quality?: string;
    image_url?: string;
    inputImagePath?: string;
}

export interface VideoGenerationStatus {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    startTime: string;
    endTime?: string;
    result?: {
        savedPath: string;
        model: string;
        cost?: number;
        content_type?: string;
    };
    error?: string;
    logs: string[];
}

const updateVideoStatusFile = (statusPath: string, update: Partial<VideoGenerationStatus>) => {
    try {
        let current: VideoGenerationStatus;

        if (existsSync(statusPath)) {
            const data = readFileSync(statusPath, 'utf8');
            current = JSON.parse(data);
        } else {
            current = {
                id: path.basename(statusPath, '.json'),
                status: 'pending',
                progress: 0,
                message: 'Initializing...',
                startTime: new Date().toISOString(),
                logs: [],
            };
        }

        Object.assign(current, update);
        writeFileSync(statusPath, JSON.stringify(current, null, 2));
    } catch (error) {
        console.warn(`Failed to update video status file:`, error);
    }
};

const addVideoLog = (statusPath: string, message: string) => {
    try {
        if (existsSync(statusPath)) {
            const data = readFileSync(statusPath, 'utf8');
            const current: VideoGenerationStatus = JSON.parse(data);
            current.logs.push(`[${new Date().toISOString()}] ${message}`);
            writeFileSync(statusPath, JSON.stringify(current, null, 2));
        }
    } catch (error) {
        console.warn(`Failed to add video log:`, error);
    }
};

// Submit video generation job to PPQ.ai
export const ppqaiGenerateVideoAsync = async (
    options: VideoGenerationOptions,
    statusPath?: string
): Promise<{ statusPath: string }> => {
    const apiKey = getPPQAIKey();

    const actualStatusPath = statusPath ||
        options.outputPath.replace(/\.[^.]+$/, '_status.json');

    // Initialize status file
    updateVideoStatusFile(actualStatusPath, {
        status: 'pending',
        progress: 0,
        message: 'Submitting video generation request...',
    });

    // Handle image input
    let imageUrl = options.image_url;
    if (!imageUrl && options.inputImagePath) {
        const { encodeImageToBase64 } = await import('../utils/imageUtils.js');
        const imageBase64 = encodeImageToBase64(options.inputImagePath);
        imageUrl = `data:image/png;base64,${imageBase64}`;
    }

    // Auto-select model based on whether image is provided
    let model: VideoModel = options.model || (imageUrl ? 'kling-2.5-turbo-i2v' : 'kling-2.5-turbo');

    const body: any = {
        model,
        prompt: options.prompt,
    };

    if (options.aspect_ratio) body.aspect_ratio = options.aspect_ratio;
    if (options.duration) body.duration = options.duration;
    if (options.quality) body.quality = options.quality;
    if (imageUrl) body.image_url = imageUrl;

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    // Start background processing
    (async () => {
        try {
            // Submit the job
            updateVideoStatusFile(actualStatusPath, {
                status: 'processing',
                progress: 10,
                message: `Submitting video generation with model: ${model}...`,
            });
            addVideoLog(actualStatusPath, `Submitting job with model: ${model}`);

            const submitResponse = await makeHTTPRequest(
                'https://api.ppq.ai/v1/videos',
                'POST',
                headers,
                body
            );

            if (submitResponse.error) {
                throw new Error(`PPQ.ai API error: ${submitResponse.error.message || JSON.stringify(submitResponse.error)}`);
            }

            const jobId = submitResponse.id;
            if (!jobId) {
                throw new Error('No job ID returned from PPQ.ai video API');
            }

            addVideoLog(actualStatusPath, `Job submitted, ID: ${jobId}`);
            updateVideoStatusFile(actualStatusPath, {
                progress: 20,
                message: `Video generation in progress (job: ${jobId})...`,
            });

            // Poll for completion
            let attempts = 0;
            const maxAttempts = 120; // 10 minutes max (5s intervals)
            const pollInterval = 5000;

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;

                const pollResponse = await makeHTTPRequest(
                    `https://api.ppq.ai/v1/videos/${jobId}`,
                    'GET',
                    { 'Authorization': `Bearer ${apiKey}` }
                );

                if (pollResponse.error) {
                    addVideoLog(actualStatusPath, `Poll error: ${JSON.stringify(pollResponse.error)}`);
                    continue;
                }

                const progress = Math.min(20 + Math.floor((attempts / maxAttempts) * 70), 90);
                updateVideoStatusFile(actualStatusPath, {
                    progress,
                    message: `Video generation in progress (${pollResponse.status || 'processing'})...`,
                });

                if (pollResponse.status === 'completed') {
                    addVideoLog(actualStatusPath, 'Video generation completed');

                    // Download the video
                    const videoUrl = pollResponse.data?.url;
                    if (!videoUrl) {
                        throw new Error('No video URL in completed response');
                    }

                    updateVideoStatusFile(actualStatusPath, {
                        progress: 95,
                        message: 'Downloading video...',
                    });

                    // Ensure output directory exists
                    const outputDir = path.dirname(options.outputPath);
                    mkdirSync(outputDir, { recursive: true });

                    // Download video using curl
                    await execFileAsync('curl', ['-s', '-L', '-o', options.outputPath, videoUrl]);

                    addVideoLog(actualStatusPath, `Video saved to: ${options.outputPath}`);

                    updateVideoStatusFile(actualStatusPath, {
                        status: 'completed',
                        progress: 100,
                        message: 'Video generation completed successfully!',
                        endTime: new Date().toISOString(),
                        result: {
                            savedPath: options.outputPath,
                            model: model,
                            cost: pollResponse.cost,
                            content_type: pollResponse.data?.content_type || 'video/mp4',
                        },
                    });
                    return;

                } else if (pollResponse.status === 'failed') {
                    throw new Error(`Video generation failed: ${pollResponse.error || 'Unknown error'}`);
                }
            }

            throw new Error('Video generation timed out after 10 minutes');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            updateVideoStatusFile(actualStatusPath, {
                status: 'failed',
                progress: 0,
                message: `Video generation failed: ${errorMessage}`,
                endTime: new Date().toISOString(),
                error: errorMessage,
            });
            addVideoLog(actualStatusPath, `ERROR: ${errorMessage}`);
        }
    })();

    return { statusPath: actualStatusPath };
};
