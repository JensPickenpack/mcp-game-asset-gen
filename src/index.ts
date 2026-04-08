#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync } from 'fs';
import path from 'path';
import {
  ppqaiTextToSpeech,
  ppqaiTranscribeAudio,
  TTS_VOICES,
} from './providers/audioHelpers.js';
import {
  generateCharacterSheet,
  generateCharacterVariation,
  generateObjectSheet,
  generatePixelArtCharacter,
  generateTexture,
  ppqaiGenerateImage
} from './providers/imageProviders.js';
import {
  generate3DModelAsync,
  Model3DFormat,
  Model3DModel,
  Model3DVariant
} from './providers/model3dHelpers.js';
import {
  ALL_VIDEO_MODELS,
  ppqaiGenerateVideoAsync
} from './providers/videoHelpers.js';
import { getPPQAIKey, makeHTTPRequest } from './utils/imageUtils.js';

// Check environment variables for tool filtering
const allowedToolsEnv = process.env.ALLOWED_TOOLS;

// ==== Game Prompt Enhancement & Model Selection ====
// Set MASTER_STYLE_PROMPT in .env to enforce a unified art direction across all generated assets.
// Example: "All assets for a cyberpunk pixel-art roguelike: neon cyan #00FFFF, magenta #FF00FF, consistent lighting from top-left"
const masterStylePrompt = process.env.MASTER_STYLE_PROMPT ?? '';
const prototypeMode = (process.env.PROTOTYPE_MODE === 'true') || (process.env.PROTOTYPING === 'true');

// Runtime cache of available PPQ.ai models (populated at startup)
const availableModels: { images: string[]; videos: string[]; all: string[] } = { images: [], videos: [], all: [] };

async function fetchPPQModels() {
  try {
    const apiKey = getPPQAIKey();
    const headers = { 'Authorization': `Bearer ${apiKey}` };

    const parse = (resp: any) => {
      if (!resp) return [];
      if (Array.isArray(resp)) return resp.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      if (Array.isArray(resp.data)) return resp.data.map((m: any) => m.id || m.name).filter(Boolean);
      if (Array.isArray(resp.models)) return resp.models.map((m: any) => m.id || m.name).filter(Boolean);
      return [];
    };

    const imgResp = await makeHTTPRequest('https://api.ppq.ai/v1/models?type=image', 'GET', headers);
    const vidResp = await makeHTTPRequest('https://api.ppq.ai/v1/models?type=video', 'GET', headers);

    availableModels.images = parse(imgResp);
    availableModels.videos = parse(vidResp);
    availableModels.all = Array.from(new Set([...availableModels.images, ...availableModels.videos]));

    try {
      const cachePath = path.join(process.cwd(), 'tools', 'game-asset-mcp', 'ppq_models_cache.json');
      writeFileSync(cachePath, JSON.stringify(availableModels, null, 2));
    } catch (err) {
      console.warn('Failed to write PPQ.ai models cache:', err instanceof Error ? err.message : String(err));
    }

    console.error('PPQ.ai models fetched:', availableModels.all.length, 'models');
  } catch (error) {
    console.error('Failed to fetch PPQ.ai models:', error instanceof Error ? error.message : String(error));
  }
}

const TOOL_PROMPT_PREFIX: Record<string, string> = {
  general: 'game-ready asset, clean lines, flat colors, no text, no watermarks, optimized for Unity/Unreal, transparent background where useful, consistent lighting, high contrast for readability',
  pixel_art: '16x16 pixel art sprite, retro 8-bit game style, side view idle animation, limited color palette (64 colors), sharp pixels, transparent background where useful; provide one version with solid white background for reference',
  texture: 'seamless tileable 1024x1024 PBR texture, game environment material, diffuse + normal map compatible, highly detailed but low frequency for performance (optimized for runtime)',
  character_sheet: 'full character reference sheet, front / side / back / three-quarter views, consistent proportions and color palette, clean line art, transparent background where useful',
  video: 'smooth 8-frame loop animation (sprite), pixel art style, 16x16 sprite scaled to video, retro game camera, no motion blur, perfect loop, transparent background where useful',
  reference_3d: 'multi-view reference for 3D modeling, sharp edges, fine details, flat studio lighting, white background, consistent object across all views',
};

function buildGamePrompt(toolType: keyof typeof TOOL_PROMPT_PREFIX, userPrompt: string, model?: string): string {
  const parts: string[] = [];
  if (model) parts.push(`Model: ${model}`);
  if (masterStylePrompt) parts.push(masterStylePrompt);
  parts.push(TOOL_PROMPT_PREFIX[toolType] ?? TOOL_PROMPT_PREFIX.general);
  if (userPrompt) parts.push(userPrompt);
  return parts.join(' | ');
}

function selectModelForTool(toolKey: 'image' | 'pixel_art' | 'texture' | 'character_sheet' | 'video' | 'object_sheet') {
  const imgs = availableModels.images || [];
  const vids = availableModels.videos || [];

  const prefer = (candidates: string[]) => {
    for (const c of candidates) {
      if (imgs.includes(c) || vids.includes(c) || availableModels.all.includes(c)) return c;
    }
    return undefined;
  };

  if (toolKey === 'video') {
    if (prototypeMode) return prefer(['xai/grok-imagine-video', 'kling-2.5-turbo', 'veo3']);
    return prefer(['fal-ai/veo3.1', 'veo3', 'kling-2.5-turbo']) || 'kling-2.5-turbo';
  }

  if (toolKey === 'character_sheet' || toolKey === 'object_sheet') {
    if (prototypeMode) return prefer(['fal-ai/bytedance/seedream/v4.5/text-to-image', 'flux-kontext-max', 'flux-kontext-pro']) || 'flux-kontext-max';
    return prefer(['flux-kontext-max', 'fal-ai/bytedance/seedream/v4.5/text-to-image', 'gpt-image-1']) || 'flux-kontext-max';
  }

  // pixel art / general images / textures
  if (toolKey === 'pixel_art' || toolKey === 'image' || toolKey === 'texture') {
    if (prototypeMode) return prefer(['xai/grok-imagine', 'flux-2-pro', 'gpt-image-1', 'nano-banana-pro']) || 'flux-2-pro';
    return prefer(['flux-2-pro', 'flux-kontext-max', 'gpt-image-1', 'nano-banana-pro']) || 'flux-kontext-max';
  }

  return 'nano-banana-pro';
}

// Define all available tools
const allTools = [
  {
    name: 'ppqai_generate_image',
    description: 'Generate images using PPQ.ai unified API. Supports many models: gpt-image-1 (high quality), nano-banana-pro (cheap Gemini 3 Pro), flux-2-pro/flex (fast), flux-kontext-pro/max (image-to-image). Pay-per-use pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated image should be saved',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'gpt-image-1.5', 'nano-banana-pro', 'flux-2-pro', 'flux-2-flex', 'flux-2-pro-i2i', 'flux-kontext-pro', 'flux-kontext-max'],
          description: 'Image model to use (default: nano-banana-pro). gpt-image-1: best quality. nano-banana-pro: cheapest. flux-kontext-pro/max: best for image-to-image.',
        },
        quality: {
          type: 'string',
          description: 'Quality tier (model-specific): gpt-image-1: low/medium/high, nano-banana-pro: standard/4k, flux-2-pro/flex: 1k/2k',
        },
        n: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Number of images to generate (1-10)',
        },
        size: {
          type: 'string',
          description: 'Image size/aspect ratio (e.g., "1:1", "16:9", "9:16", "1024x1024")',
        },
        image_url: {
          type: 'string',
          description: 'Source image URL for image-to-image generation',
        },
        inputImagePath: {
          type: 'string',
          description: 'Local path to source image for image-to-image (alternative to image_url)',
        },
      },
      required: ['prompt', 'outputPath'],
    },
  },
  {
    name: 'ppqai_generate_video',
    description: 'Generate videos using PPQ.ai API. Supports text-to-video and image-to-video. Async operation — returns a status file for progress tracking. T2V models: veo3, kling-2.1-pro/master, kling-2.5-turbo, runway-gen4/aleph. I2V models: veo3-i2v, kling-2.1-master-i2v, kling-2.5-turbo-i2v.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the video to generate',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated video should be saved (.mp4)',
        },
        model: {
          type: 'string',
          enum: [...ALL_VIDEO_MODELS],
          description: 'Video model (default: kling-2.5-turbo for T2V, kling-2.5-turbo-i2v for I2V). veo3: highest quality. kling-2.5-turbo: fast and cheap.',
        },
        aspect_ratio: {
          type: 'string',
          description: 'Video aspect ratio (e.g., "16:9", "9:16", "1:1")',
        },
        duration: {
          type: 'number',
          description: 'Video duration in seconds',
        },
        quality: {
          type: 'string',
          description: 'Quality tier (model-specific)',
        },
        image_url: {
          type: 'string',
          description: 'Source image URL for image-to-video generation',
        },
        inputImagePath: {
          type: 'string',
          description: 'Local path to source image for image-to-video (alternative to image_url)',
        },
        statusFile: {
          type: 'string',
          description: 'Path for the status JSON file (default: auto-generated)',
        },
      },
      required: ['prompt', 'outputPath'],
    },
  },
  {
    name: 'ppqai_text_to_speech',
    description: 'Convert text to speech using PPQ.ai TTS API with Deepgram Aura 2 voices. Returns an audio file.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Text to convert to speech',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the audio file should be saved',
        },
        voice: {
          type: 'string',
          enum: [...TTS_VOICES],
          description: 'Voice to use (default: aura-2-apollo-en). Options: arcas, thalia, andromeda, helena, apollo, aries',
        },
      },
      required: ['input', 'outputPath'],
    },
  },
  {
    name: 'ppqai_transcribe_audio',
    description: 'Transcribe audio files to text using PPQ.ai STT API (Deepgram Nova 3). Supports mp3, mp4, wav, webm, m4a (max 25MB).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the audio file to transcribe',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., "en", "de", "es"). Auto-detected if not specified.',
        },
        prompt: {
          type: 'string',
          description: 'Optional context prompt to guide transcription',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'generate_character_sheet',
    description: 'Generate character reference sheets from text descriptions via PPQ.ai. Includes multiple views, expressions, and poses.',
    inputSchema: {
      type: 'object',
      properties: {
        characterDescription: {
          type: 'string',
          description: 'Detailed description of the character',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the character sheet should be saved',
        },
        referenceImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of reference image paths for consistency',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'nano-banana-pro', 'flux-2-pro', 'flux-kontext-pro', 'flux-kontext-max'],
          description: 'PPQ.ai model to use (default: flux-kontext-pro)',
        },
        style: {
          type: 'string',
          description: 'Art style for the character sheet (e.g., anime, realistic, cartoon)',
        },
        includeExpressions: {
          type: 'boolean',
          description: 'Include multiple facial expressions',
        },
        includePoses: {
          type: 'boolean',
          description: 'Include multiple poses/angles',
        },
      },
      required: ['characterDescription', 'outputPath'],
    },
  },
  {
    name: 'generate_character_variation',
    description: 'Generate character variations by combining reference images (e.g., character + outfit) via PPQ.ai',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the variation to create',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the variation should be saved',
        },
        referenceImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of reference image paths to combine',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'nano-banana-pro', 'flux-kontext-pro', 'flux-kontext-max'],
          description: 'PPQ.ai model to use (default: flux-kontext-pro)',
        },
      },
      required: ['prompt', 'outputPath', 'referenceImagePaths'],
    },
  },
  {
    name: 'generate_pixel_art_character',
    description: 'Generate pixel art characters with specific dimensions for retro games via PPQ.ai, with optional transparent backgrounds.',
    inputSchema: {
      type: 'object',
      properties: {
        characterDescription: {
          type: 'string',
          description: 'Description of the pixel art character',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the pixel art should be saved',
        },
        pixelDimensions: {
          type: 'string',
          enum: ['8x8', '16x16', '32x32', '48x48', '64x64', '96x96'],
          description: 'Target pixel dimensions',
        },
        spriteSheet: {
          type: 'boolean',
          description: 'Generate sprite sheet with animations',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'nano-banana-pro', 'flux-2-pro'],
          description: 'PPQ.ai model to use (default: nano-banana-pro)',
        },
        colors: {
          type: 'number',
          minimum: 4,
          maximum: 256,
          description: 'Color palette size (4-256 colors)',
        },
        transparentBackground: {
          type: 'boolean',
          description: 'Generate with transparent background for game sprites',
        },
        backgroundColor: {
          type: 'string',
          enum: ['white', 'black', 'auto'],
          description: 'Background color to make transparent (default: white)',
        },
      },
      required: ['characterDescription', 'outputPath', 'pixelDimensions'],
    },
  },
  {
    name: 'generate_texture',
    description: 'Generate seamless textures for 3D environments via PPQ.ai with optional transparent backgrounds for sprites/decals.',
    inputSchema: {
      type: 'object',
      properties: {
        textureDescription: {
          type: 'string',
          description: 'Description of the texture (e.g., grass field, brick wall)',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the texture should be saved',
        },
        textureSize: {
          type: 'string',
          enum: ['512x512', '1024x1024', '2048x2048'],
          description: 'Texture resolution (default: 1024x1024)',
        },
        seamless: {
          type: 'boolean',
          description: 'Generate seamless/tileable texture',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'nano-banana-pro', 'flux-2-pro'],
          description: 'PPQ.ai model to use (default: nano-banana-pro)',
        },
        materialType: {
          type: 'string',
          enum: ['diffuse', 'normal', 'roughness', 'displacement'],
          description: 'Type of texture map',
        },
        transparentBackground: {
          type: 'boolean',
          description: 'Generate with transparent background for sprites/decals',
        },
        backgroundColor: {
          type: 'string',
          enum: ['white', 'black', 'auto'],
          description: 'Background color to make transparent (default: white)',
        },
        transparencyTolerance: {
          type: 'number',
          minimum: 0,
          maximum: 255,
          description: 'Color variation tolerance for transparency (0-255, default: 30)',
        },
      },
      required: ['textureDescription', 'outputPath'],
    },
  },
  {
    name: 'generate_object_sheet',
    description: 'Generate multi-viewpoint reference sheets for 3D modeling via PPQ.ai (front, side, back, top views)',
    inputSchema: {
      type: 'object',
      properties: {
        objectDescription: {
          type: 'string',
          description: 'Description of the 3D object',
        },
        outputBasePath: {
          type: 'string',
          description: 'Base path for output files (will append _front.png, _side.png, etc.)',
        },
        viewpoints: {
          type: 'array',
          items: { type: 'string', enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'perspective'] },
          description: 'Viewpoints to generate',
        },
        model: {
          type: 'string',
          enum: ['gpt-image-1', 'nano-banana-pro', 'flux-2-pro'],
          description: 'PPQ.ai model to use (default: nano-banana-pro)',
        },
        style: {
          type: 'string',
          description: 'Art style (e.g., technical drawing, concept art)',
        },
      },
      required: ['objectDescription', 'outputBasePath'],
    },
  },
  // REMOVED: image_to_3d synchronous tool - causes MCP timeouts
  // All 3D generation operations take longer than 60-second MCP timeout
  // Use image_to_3d_async instead for reliable background processing
  {
    name: 'image_to_3d_async',
    description: 'Generate 3D models from images using advanced AI models (Trellis, Hunyuan3D 2.0, Hunyuan World) with automatic reference image generation and background processing. Returns a status file path immediately for progress tracking to avoid MCP timeouts. This is the recommended method for all 3D generation tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the 3D model to generate (used for automatic reference image generation)',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated 3D model should be saved (.glb or .gltf)',
        },
        inputImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of paths to input images or base64 URIs (data:image/png;base64,...). If not provided, reference images will be generated automatically.',
        },
        model: {
          type: 'string',
          enum: Object.values(Model3DModel),
          description: '3D generation model: hunyuan3d (best quality, supports textures), trellis (good for objects), hunyuan-world (for scenes/worlds). Default: hunyuan3d',
        },
        variant: {
          type: 'string',
          enum: Object.values(Model3DVariant),
          description: 'Model variant: single (1 image), multi (multiple images), or turbo versions for faster generation. Default: auto-selected based on model and input count',
        },
        format: {
          type: 'string',
          enum: Object.values(Model3DFormat),
          description: 'Output format (default: glb for web/game compatibility)',
        },
        textured_mesh: {
          type: 'boolean',
          description: 'Generate textured mesh (Hunyuan3D only, 3x cost). Default: true for better quality',
        },
        autoGenerateReferences: {
          type: 'boolean',
          description: 'Automatically generate reference images from prompt if no input images provided (default: true)',
        },
        referenceModel: {
          type: 'string',
          enum: ['ppqai'],
          description: 'Model provider for automatic reference image generation (only ppqai supported)',
        },
        referenceViews: {
          type: 'array',
          items: { type: 'string', enum: ['front', 'back', 'top', 'left', 'right'] },
          description: 'Views to generate for reference images (default: ["front", "back", "top"])',
        },
        cleanupReferences: {
          type: 'boolean',
          description: 'Clean up automatically generated reference images after 3D generation (default: true)',
        },
        statusFile: {
          type: 'string',
          description: 'Path where the status JSON file will be created (default: auto-generated in output directory)',
        },
      },
      required: ['outputPath'],
    },
  },
];

const server = new Server(
  {
    name: 'mcp-game-asset-gen',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  let tools;

  if (allowedToolsEnv) {
    const allowedToolNames = allowedToolsEnv.split(",").map((t) => t.trim());
    tools = allTools.filter((tool) => allowedToolNames.includes(tool.name));
  } else {
    tools = allTools;
  }

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'ppqai_generate_image': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('image');
        if (enhancedArgs.prompt) enhancedArgs.prompt = buildGamePrompt('image', enhancedArgs.prompt, enhancedArgs.model);
        // Default quality for gpt-image-1 depends on prototypeMode:
        // - prototypeMode true => prefer lower-quality (faster, cheaper) => 'low'
        // - prototypeMode false => prefer high-quality => 'high'
        if (!enhancedArgs.quality && enhancedArgs.model && typeof enhancedArgs.model === 'string') {
          const m = enhancedArgs.model.toLowerCase();
          if (m.startsWith('gpt-image-1')) {
            enhancedArgs.quality = prototypeMode ? 'low' : 'high';
          }
        }
        const result = await ppqaiGenerateImage(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'ppqai_generate_video': {
        if (!args) throw new Error('Arguments are required for ppqai_generate_video');
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('video');
        if (enhancedArgs.prompt) enhancedArgs.prompt = buildGamePrompt('video', enhancedArgs.prompt, enhancedArgs.model);
        const statusFile = enhancedArgs.statusFile || enhancedArgs.outputPath.replace(/\.[^.]+$/, '_status.json');
        const result = await ppqaiGenerateVideoAsync(enhancedArgs, statusFile);
        return {
          content: [
            {
              type: 'text',
              text: `Video generation started. Status file: ${result.statusPath}\n\nMonitor progress by reading the status JSON file. Status can be: pending, processing, completed, failed.\nWhen completed, the video will be saved to the outputPath.`,
            },
          ],
        };
      }

      case 'ppqai_text_to_speech': {
        if (!args) throw new Error('Arguments are required for ppqai_text_to_speech');
        const result = await ppqaiTextToSpeech(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'ppqai_transcribe_audio': {
        if (!args) throw new Error('Arguments are required for ppqai_transcribe_audio');
        const result = await ppqaiTranscribeAudio(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'generate_character_sheet': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('character_sheet');
        if (enhancedArgs.characterDescription) enhancedArgs.characterDescription = buildGamePrompt('character_sheet', enhancedArgs.characterDescription, enhancedArgs.model);
        const result = await generateCharacterSheet(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'generate_character_variation': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('character_sheet');
        if (enhancedArgs.prompt) enhancedArgs.prompt = buildGamePrompt('character_sheet', enhancedArgs.prompt, enhancedArgs.model);
        const result = await generateCharacterVariation(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'generate_pixel_art_character': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('pixel_art');
        if (enhancedArgs.characterDescription) enhancedArgs.characterDescription = buildGamePrompt('pixel_art', enhancedArgs.characterDescription, enhancedArgs.model);
        const result = await generatePixelArtCharacter(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'generate_texture': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('texture');
        if (enhancedArgs.textureDescription) enhancedArgs.textureDescription = buildGamePrompt('texture', enhancedArgs.textureDescription, enhancedArgs.model);
        const result = await generateTexture(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'generate_object_sheet': {
        const enhancedArgs = { ...(args as any) };
        if (!enhancedArgs.model) enhancedArgs.model = selectModelForTool('object_sheet');
        if (enhancedArgs.objectDescription) enhancedArgs.objectDescription = buildGamePrompt('reference_3d', enhancedArgs.objectDescription, enhancedArgs.model);
        const result = await generateObjectSheet(enhancedArgs);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      // REMOVED: image_to_3d synchronous handler - causes MCP timeouts
      // All 3D generation operations exceed 60-second MCP timeout limit
      // Use image_to_3d_async instead for reliable background processing

      case 'image_to_3d_async': {
        if (!args) {
          throw new Error('Arguments are required for image_to_3d_async');
        }
        if (!args.outputPath) {
          throw new Error('outputPath is required for image_to_3d_async');
        }

        // Generate status file path
        const statusFile = (args as any).statusFile ||
          (args as any).outputPath.replace(/\.[^.]+$/, '_status.json');

        // Use hunyuan3d as default model for best quality
        const selectedModel = (args as any).model || 'hunyuan3d';

        const result = await generate3DModelAsync(
          {
            prompt: buildGamePrompt('reference_3d', (args as any).prompt || '', selectedModel),
            outputPath: (args as any).outputPath,
            model: selectedModel,
            inputImagePaths: (args as any).inputImagePaths || [],
            variant: (args as any).variant,
            format: (args as any).format,
            textured_mesh: (args as any).textured_mesh,
            autoGenerateReferences: (args as any).autoGenerateReferences,
            referenceModel: (args as any).referenceModel,
            referenceViews: (args as any).referenceViews,
            cleanupReferences: (args as any).cleanupReferences,
          },
          statusFile
        );

        return {
          content: [
            {
              type: 'text',
              text: `3D model generation started in background. Status file: ${result.statusPath}

STATUS FILE FORMAT:
The status file is a JSON file that updates in real-time with:
{
  "id": "task_id",
  "status": "pending" | "processing" | "completed" | "failed",
  "progress": 0-100,
  "message": "Current status description",
  "startTime": "2025-01-08T13:20:00.000Z",
  "endTime": "2025-01-08T13:25:30.000Z",
  "result": { /* Model3DGenerationResult when completed */ },
  "error": "Error message (if failed)",
  "logs": [
    "[2025-01-08T13:20:00.000Z] Starting 3D generation...",
    "[2025-01-08T13:20:05.000Z] Generated 3 reference images",
    "..."
  ]
}

MONITORING USAGE:
1. Read the status file periodically: JSON.parse(readFileSync('${result.statusPath}'))
2. Check status field for completion state
3. When status === "completed": use result.savedPaths for generated model files
4. When status === "failed": check error field for failure details
5. Use logs array for detailed progress information

PROGRESS STAGES:
- 5%: Validating options and preparing inputs
- 10%: Checking input images
- 20%: Generating reference images (if needed)
- 30%: Preparing 3D generation request
- 40%: Calling API (Trellis/Hunyuan3D)
- 50%: Processing with model
- 90%: Finalizing result
- 100%: Completed`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'asset_generation',
        description: 'Generate various types of assets for game development',
        arguments: [
          {
            name: 'asset_type',
            description: 'Type of asset to generate (image, video, audio, 3d)',
            required: true,
          },
          {
            name: 'style',
            description: 'Art style or theme for the asset',
            required: false,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'asset_generation') {
    const { asset_type, style } = args as {
      asset_type: string;
      style?: string;
    };

    const styleText = style ? ` in ${style} style` : '';
    return {
      description: `Generate a ${asset_type} asset${styleText} for game development`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a ${asset_type} asset${styleText} suitable for game development. Please provide detailed specifications and requirements.`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Asset Generation Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

export { allTools };

