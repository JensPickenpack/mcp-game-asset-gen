import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'fs';
import path from 'path';
import { expect } from 'vitest';

export const shouldRunIntegrationTests = process.env.NO_MOCK_PROVIDERS === 'true';
export const shouldCleanupTestFiles = process.env.CLEANUP_TEST_FILES === 'true';
export const forceRefreshArtifacts = process.env.FORCE_REAL_API_TESTS === 'true';

const parsePositiveIntEnv = (name: string, fallback: number): number => {
    const value = Number(process.env[name]);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
};

export const defaultTestTimeoutMs = parsePositiveIntEnv('REAL_TEST_TIMEOUT_MS', 300000);
export const extendedTestTimeoutMs = parsePositiveIntEnv('REAL_EXTENDED_TEST_TIMEOUT_MS', 420000);
export const videoTestTimeoutMs = parsePositiveIntEnv('REAL_VIDEO_TEST_TIMEOUT_MS', 1200000);
export const videoPollTimeoutMs = parsePositiveIntEnv('REAL_VIDEO_POLL_TIMEOUT_MS', 1200000);

type QualityTier = 'prototyping' | 'standard' | 'high-quality';

const parseQualityTier = (): QualityTier => {
    const value = process.env.PPQ_QUALITY_TIER?.toLowerCase().trim() as QualityTier | undefined;
    if (['prototyping', 'standard', 'high-quality'].includes(value || '')) {
        return value!;
    }
    // Default: standard tier
    return 'standard';
};

export const qualityTier = parseQualityTier();

// Temporarily disabled due to upstream API errors: nano-banana-pro, flux-2-pro, flux-2-flex, flux-2-pro-i2i
// These models returned "kie.ai did not return a task ID" errors during testing.
// TODO: Re-enable when provider fixes are deployed.
const imageTextModels = ['gpt-image-1.5'] as const;
const disabledImageModels = new Set(['nano-banana-pro', 'flux-2-pro', 'flux-2-flex', 'flux-2-pro-i2i']);

const parseImageModelList = (): string[] => {
    const envValue = process.env.PPQ_SMOKE_IMAGE_MODELS;
    if (envValue && envValue.trim().length > 0) {
        return envValue
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .filter((model) => !disabledImageModels.has(model));
    }

    if (process.env.PPQ_SMOKE_IMAGE_MODEL && !disabledImageModels.has(process.env.PPQ_SMOKE_IMAGE_MODEL)) {
        return [process.env.PPQ_SMOKE_IMAGE_MODEL];
    }

    return [...imageTextModels];
};

export const smokeImageModels = parseImageModelList();
const explicitSmokeImageQuality = process.env.PPQ_SMOKE_IMAGE_QUALITY;

export const getDesiredImageQuality = (model: string): string | undefined => {
    if (explicitSmokeImageQuality) {
        return explicitSmokeImageQuality;
    }

    // gpt-image-1.5: prototyping/standard → medium, high-quality → high
    if (model === 'gpt-image-1.5') {
        if (qualityTier === 'prototyping' || qualityTier === 'standard') {
            return 'medium';
        }
        return 'high'; // high-quality
    }

    return undefined;
};

export const smokeTransformModel = process.env.PPQ_SMOKE_TRANSFORM_MODEL || 'disabled';
export const artifactRoot = path.resolve(process.cwd(), 'test_assets', 'real_ppq');

const toolFilter = new Set(
    (process.env.PPQ_REAL_TOOL_FILTER || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);

const allToolNames = [
    'ppqai_generate_image',
    'ppqai-transform_image',
    'generate_character_sheet',
    'generate_pixel_art_character',
    'generate_texture',
    'generate_object_sheet',
    'ppqai_text_to_speech',
    'ppqai_transcribe_audio',
    'ppqai_generate_video',
] as const;

export type ToolName = (typeof allToolNames)[number];

export type ArtifactManifest = {
    tool: ToolName;
    scenario: string;
    generatedAt: string;
    reused: boolean;
    query: string;
    sourceModel?: string;
    outputPaths: string[];
    metadataPath: string;
    parsedResult: Record<string, unknown>;
    notes?: string[];
    statusPath?: string;
};

export type ScenarioFiles = {
    dir: string;
    outputPath: string;
    metadataPath: string;
};

export const shouldRunTool = (tool: ToolName): boolean => {
    return toolFilter.size === 0 || toolFilter.has(tool);
};

export const ensureDir = (dirPath: string) => {
    mkdirSync(dirPath, { recursive: true });
};

export const toSafeSlug = (value: string): string => {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

export const baseImageScenarioName = `base-image-${toSafeSlug(smokeImageModels[0] || 'gpt-image-1.5')}`;

export const getScenarioFiles = (tool: ToolName, scenario: string, fileName: string): ScenarioFiles => {
    const dir = path.join(artifactRoot, tool, scenario);
    return {
        dir,
        outputPath: path.join(dir, fileName),
        metadataPath: path.join(dir, 'result.json'),
    };
};

const getFileSize = (filePath: string): number => {
    return statSync(filePath).size;
};

export const isReusableArtifact = (manifest: ArtifactManifest | null): manifest is ArtifactManifest => {
    if (!manifest) {
        return false;
    }

    if (!existsSync(manifest.metadataPath)) {
        return false;
    }

    return manifest.outputPaths.every((filePath) => existsSync(filePath) && getFileSize(filePath) > 0);
};

export const readManifest = (metadataPath: string): ArtifactManifest | null => {
    if (!existsSync(metadataPath)) {
        return null;
    }

    return JSON.parse(readFileSync(metadataPath, 'utf8')) as ArtifactManifest;
};

export const writeManifest = (manifest: ArtifactManifest) => {
    writeFileSync(manifest.metadataPath, JSON.stringify(manifest, null, 2));
};

export const validateOutputFiles = (outputPaths: string[]) => {
    expect(outputPaths.length).toBeGreaterThan(0);

    for (const outputPath of outputPaths) {
        expect(existsSync(outputPath)).toBe(true);
        expect(getFileSize(outputPath)).toBeGreaterThan(0);
    }
};

export const maybeCleanupArtifactDir = (dirPath: string) => {
    if (shouldCleanupTestFiles && existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
    }
};

export const persistArtifact = (
    tool: ToolName,
    scenario: string,
    metadataPath: string,
    query: string,
    parsedResult: Record<string, unknown>,
    outputPaths: string[],
    extras: Partial<ArtifactManifest> = {}
): ArtifactManifest => {
    const manifest: ArtifactManifest = {
        tool,
        scenario,
        generatedAt: new Date().toISOString(),
        reused: false,
        query,
        sourceModel: typeof parsedResult.model === 'string' ? parsedResult.model : extras.sourceModel,
        outputPaths,
        metadataPath,
        parsedResult,
        notes: extras.notes,
        statusPath: extras.statusPath,
    };

    writeManifest(manifest);
    return manifest;
};

export const withCachedArtifact = async (
    tool: ToolName,
    scenario: string,
    files: ScenarioFiles,
    generate: () => Promise<ArtifactManifest>
): Promise<ArtifactManifest> => {
    ensureDir(files.dir);

    if (!forceRefreshArtifacts) {
        const existing = readManifest(files.metadataPath);
        if (isReusableArtifact(existing)) {
            const reusedManifest: ArtifactManifest = {
                ...existing,
                reused: true,
            };
            writeManifest(reusedManifest);
            return reusedManifest;
        }
    }

    const manifest = await generate();
    validateOutputFiles(manifest.outputPaths);
    return manifest;
};

const readVideoStatus = (statusPath: string): Record<string, unknown> => {
    return JSON.parse(readFileSync(statusPath, 'utf8')) as Record<string, unknown>;
};

export const waitForVideoCompletion = async (statusPath: string, timeoutMs: number): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (!existsSync(statusPath)) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
        }

        const status = readVideoStatus(statusPath);
        if (status.status === 'completed') {
            return status;
        }
        if (status.status === 'failed') {
            throw new Error(String(status.error || status.message || 'Video generation failed'));
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error(`Video generation did not complete within ${timeoutMs}ms`);
};

let suiteStartLogged = false;

export const logIntegrationSuiteStart = () => {
    if (suiteStartLogged) {
        return;
    }
    suiteStartLogged = true;

    if (!shouldRunIntegrationTests) {
        console.log('Skipping PPQ.ai integration tests. Set NO_MOCK_PROVIDERS=true to run them.');
        return;
    }

    ensureDir(artifactRoot);
    console.log(`PPQ.ai real test artifacts: ${artifactRoot}`);
    if (toolFilter.size > 0) {
        console.log(`Running filtered tools: ${Array.from(toolFilter).join(', ')}`);
    }
};
