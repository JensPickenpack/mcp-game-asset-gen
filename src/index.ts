#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'path';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  openaiGenerateImage,
  geminiGenerateImage,
  falaiGenerateImage,
  falaiEditImage,
  generateWithProvider,
  generateCharacterSheet,
  generateCharacterVariation,
  generatePixelArtCharacter,
  generateTexture,
  generateObjectSheet,
} from './providers/imageProviders.js';
import {
  generate3DModelSmart,
  generate3DModelAsync,
  type Model3DGenerationOptionsExtended,
  Model3DModel,
  Model3DVariant,
  Model3DFormat,
  AVAILABLE_VARIANTS,
} from './providers/model3dHelpers.js';

// Check environment variables for tool filtering
const allowedToolsEnv = process.env.ALLOWED_TOOLS;

// Define all available tools
const allTools = [
  {
    name: 'openai_generate_image',
    description: "Generate images using OpenAI's image generation API. For transparency conversion, generate with solid white background (or black for dark objects/snowy scenes). The transparency converter uses color tolerance, so backgrounds close to pure white/black (within tolerance range) will be made transparent.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate. Include "plain white background" or "plain black background" for transparency conversion support. Near-white backgrounds (like #efefef to #ffffff) work with default tolerance.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated image should be saved',
        },
        inputImagePath: {
          type: 'string',
          description: 'Path to input image for editing/variation (optional)',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
          description: 'Image dimensions',
        },
        quality: {
          type: 'string',
          enum: ['standard', 'hd'],
          description: 'Image quality level',
        },
        style: {
          type: 'string',
          enum: ['vivid', 'natural'],
          description: 'Image style preference',
        },
        n: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description: 'Number of images to generate (1-10)',
        },
      },
      required: ['prompt', 'outputPath'],
    },
  },
  {
    name: 'gemini_generate_image',
    description: "Generate images using Google's Gemini native image generation (supports 2.5 Flash and 3 Pro models), supports multiple input images for variations. For transparency conversion, generate with solid white background (or black for dark objects/snowy scenes). The transparency converter uses color tolerance, so backgrounds close to pure white/black will be made transparent.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the image to generate. Include "plain white background" or "plain black background" for transparency conversion support. Near-white backgrounds work with default tolerance.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated image should be saved',
        },
        inputImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of paths to input images for variation/combination',
        },
        model: {
          type: 'string',
          enum: ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
          description: 'Gemini model to use (default: gemini-3-pro-image-preview)',
        },
      },
      required: ['prompt', 'outputPath'],
    },
  },
  {
    name: 'falai_generate_image',
    description: 'Generate high-quality images using FAL.ai\'s Qwen image generation model. For transparency conversion, generate with solid white background (or black for dark objects/snowy scenes). The transparency converter uses color tolerance, so backgrounds close to pure white/black will be made transparent.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed prompt for image generation. Include "plain white background" or "plain black background" for transparency conversion support. Near-white backgrounds work with default tolerance.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the generated image should be saved',
        },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
          description: 'Image size preset',
        },
        num_inference_steps: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Number of inference steps (1-50)',
        },
        guidance_scale: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          description: 'How closely to follow the prompt (1-20)',
        },
      },
      required: ['prompt', 'outputPath'],
    },
  },
  {
    name: 'falai_edit_image',
    description: 'Edit images using FAL.ai\'s Qwen image editing model',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed prompt describing the desired edits',
        },
        inputImagePath: {
          type: 'string',
          description: 'Path to input image to be edited',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the edited image should be saved',
        },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
          description: 'Image size preset',
        },
        num_inference_steps: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Number of inference steps (1-50)',
        },
        guidance_scale: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          description: 'How closely to follow the prompt (1-20)',
        },
      },
      required: ['prompt', 'inputImagePath', 'outputPath'],
    },
  },
  {
    name: 'generate_character_sheet',
    description: 'Generate character sheets from text descriptions or reference images using any available model. Character sheets are generated with plain white backgrounds for transparency conversion support.',
    inputSchema: {
      type: 'object',
      properties: {
        characterDescription: {
          type: 'string',
          description: 'Detailed description of the character. Character sheets will be generated with plain white background for transparency conversion.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the character sheet should be saved',
        },
        referenceImagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of reference image paths (character, outfit, etc.)',
        },
        model: {
          type: 'string',
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use for generation (default: gemini)',
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
    description: 'Generate character variations by combining reference images (e.g., character + outfit)',
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
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use for generation (default: gemini)',
        },
      },
      required: ['prompt', 'outputPath', 'referenceImagePaths'],
    },
  },
  {
    name: 'generate_pixel_art_character',
    description: 'Generate pixel art characters with specific dimensions for retro games, with optional transparent backgrounds. For transparency conversion, characters are generated with solid backgrounds (white by default, black for dark characters). The transparency converter uses color tolerance, so backgrounds close to pure white/black will be made transparent.',
    inputSchema: {
      type: 'object',
      properties: {
        characterDescription: {
          type: 'string',
          description: 'Description of the pixel art character. For transparent backgrounds, specify if black background is preferred for dark characters. Near-white backgrounds work with default tolerance.',
        },
        outputPath: {
          type: 'string',
          description: 'Path where the pixel art should be saved',
        },
        pixelDimensions: {
          type: 'string',
          enum: ['8x8', '16x16', '32x32', '48x48', '64x64', '96x96'],
          description: 'Target pixel dimensions (SNES: 8x8-32x32, RPG Maker: 48x48)',
        },
        spriteSheet: {
          type: 'boolean',
          description: 'Generate sprite sheet with animations',
        },
        model: {
          type: 'string',
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use (default: falai)',
        },
        colors: {
          type: 'number',
          minimum: 4,
          maximum: 256,
          description: 'Color palette size (4-256 colors)',
        },
        transparentBackground: {
          type: 'boolean',
          description: 'Generate pixel art with transparent background for game sprites',
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
    description: 'Generate seamless textures for 3D environments and materials with optional transparent backgrounds for sprites/decals. For transparent backgrounds, textures are generated with solid backgrounds (white by default, black for dark objects). The transparency converter uses color tolerance, so backgrounds close to pure white/black will be made transparent.',
    inputSchema: {
      type: 'object',
      properties: {
        textureDescription: {
          type: 'string',
          description: 'Description of the texture (e.g., grass field, brick wall, wood planks, sprite object). For transparent backgrounds, specify if black background is preferred for dark objects. Near-white backgrounds work with default tolerance.',
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
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use (default: falai)',
        },
        materialType: {
          type: 'string',
          enum: ['diffuse', 'normal', 'roughness', 'displacement'],
          description: 'Type of texture map',
        },
        transparentBackground: {
          type: 'boolean',
          description: 'Generate texture with transparent background for sprites/decals',
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
          description: 'Color variation tolerance for transparency (0-255, default: 30). Higher values make more color variations transparent. For example, tolerance 30 makes colors from #e1e1e1 to #ffffff transparent when targeting white.',
        },
      },
      required: ['textureDescription', 'outputPath'],
    },
  },
  {
    name: 'generate_object_sheet',
    description: 'Generate multi-viewpoint reference sheets for 3D modeling (front, side, back, top views)',
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
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use (default: gemini)',
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
          enum: ['openai', 'gemini', 'falai'],
          description: 'Model to use for automatic reference image generation (default: gemini)',
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
      case 'openai_generate_image': {
        const result = await openaiGenerateImage(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'gemini_generate_image': {
        const result = await geminiGenerateImage(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'falai_generate_image': {
        const result = await falaiGenerateImage(args as any);
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'falai_edit_image': {
        const result = await falaiEditImage(args as any);
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
        const result = await generateCharacterSheet(args as any);
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
        const result = await generateCharacterVariation(args as any);
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
        const result = await generatePixelArtCharacter(args as any);
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
        const result = await generateTexture(args as any);
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
        const result = await generateObjectSheet(args as any);
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
            prompt: (args as any).prompt || '',
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