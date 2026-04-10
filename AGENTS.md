# AGENTS.md

This file contains instructions for future agents working on this MCP server project.

## Design Philosophy: Fall into the Pit of Success

This MCP server is designed as a development tool that should make users "fall into the pit of success." This means:

- **Sensible Defaults**: All tools should work well with minimal configuration
- **Automatic Optimization**: The server should automatically choose the best parameters for quality
- **Consistency by Default**: Reference images for 3D generation must maintain object consistency across views
- **Error Prevention**: Design APIs that prevent common mistakes (like generating different objects for different views)
- **Quality First**: Prioritize output quality over exposing every parameter option

When adding new features, always ask: "Will this help users succeed without needing to understand the underlying complexity?"

## Development Workflow

### Testing

- Run unit tests with `npm test` (uses `vitest run` for non-watch mode, mocked providers)
- Run integration tests with `npm run test:integration` (calls real APIs, requires API keys, keeps generated images)
- Run integration tests with cleanup: `npm run test:integration:cleanup` (calls real APIs and deletes test images)
- Run all tests with `npm run test:all`
- Tests are located in `tests/` with `*.test.ts` extension
- Integration tests are in `tests/integration.test.ts`
- Generated test images are saved to `test_assets/` (gitignored)
- All new functionality should include comprehensive tests
- Mock external dependencies (API calls, file system operations) in unit tests
- Integration tests use real providers when `NO_MOCK_PROVIDERS` environment variable is set
- Set `CLEANUP_TEST_FILES=true` to delete generated test images after integration tests

### Type Checking

- Always run `npm run typecheck` before committing
- TypeScript configuration is in `tsconfig.json`
- Strict mode is enabled

### Building

- Build with `npm run build` (compiles to `dist/`)
- Development mode: `npm run dev` (builds and starts)
- Production: `npm run start` (runs from `dist/`)

### Linting

- Run `npm run lint` to check code style
- ESLint configuration for TypeScript

## Project Structure

```text
src/
├── index.ts              # Main MCP server entry point
├── utils/
│   ├── imageUtils.ts     # Utility functions for image processing
│   └── model3dUtils.ts   # 3D model generation utilities
├── providers/
│   ├── imageProviders.ts # Image generation provider implementations
│   ├── imageHelpers.ts   # Helper functions for image generation
│   └── model3dHelpers.ts # Helper functions for 3D model generation

tests/
└── *.test.ts             # Test files
```

## Adding New Tools

1. Implement provider functions in `src/providers/`
2. Add tool schema to `ListToolsRequestSchema` in `src/index.ts`
3. Add tool handler in `CallToolRequestSchema` in `src/index.ts`
4. Import the new functions at the top of `src/index.ts`
5. Write comprehensive tests in `tests/*.test.ts`
6. Run `npm run typecheck` and `npm test` before committing

## Environment Variables

Required environment variables:

- `PPQ_API_KEY` - PPQ.ai API key for image, video and audio generation
- `FAL_AI_API_KEY` - FAL.ai API key for 3D model generation

Optional environment variables:

- `ALLOWED_TOOLS` - Comma-separated list of tools to make available (default: all tools)
- `CLEANUP_TEST_FILES` - Set to 'true' to delete test images after integration tests (default: false)

## MCP Server Architecture

- Uses `@modelcontextprotocol/sdk`
- Supports tools and prompts
- Error handling returns structured responses
- All tools return JSON strings with metadata
- Tool filtering via `ALLOWED_TOOLS` environment variable for reduced context usage

## Tool Selection Matrix

Use this table to choose the right tool quickly and to provide the smallest useful parameter set.

| Situation | Tool | Provide these parameters | Recommended extras | Notes |
| --- | --- | --- | --- | --- |
| Create a single 2D asset from text | `ppqai_generate_image` | `prompt`, `outputPath` | `model`, `size`, `quality` | Use `gpt-image-1.5` (temporarily only enabled text-to-image model). |
| Edit or restyle an existing image | `ppqai-transform_image` | `prompt`, `outputPath`, one of `inputImagePath` or `image_url` | `model`, `size`, `quality` | Temporarily disabled (no stable i2i model currently enabled). |
| Generate multiple candidate images | `ppqai_generate_image` | `prompt`, `outputPath`, `n` | `model`, `size` | Keep `n` low unless the user explicitly wants broad exploration. |
| Create a short video from text only | `ppqai_generate_video` | `prompt`, `outputPath` | `model`, `aspect_ratio`, `duration`, `statusFile` | Use for text-to-video. This tool is async and returns a status file. |
| Animate an existing image | `ppqai_generate_video` | `prompt`, `outputPath`, one of `inputImagePath` or `image_url` | `model`, `duration`, `aspect_ratio`, `statusFile` | Use an i2v model when image input is available. |
| Convert narration or dialogue to audio | `ppqai_text_to_speech` | `input`, `outputPath` | `voice` | Good for voice lines, temp VO, and test audio assets. |
| Turn an audio file into text | `ppqai_transcribe_audio` | `filePath` | `language`, `prompt` | Add `prompt` when domain terms or names are likely to be misheard. |
| Make a character turnaround or reference sheet | `generate_character_sheet` | `characterDescription`, `outputPath` | `referenceImagePaths`, `model`, `style`, `includeExpressions`, `includePoses` | Currently uses `gpt-image-1.5` while other image models are temporarily disabled. |
| Create a game sprite or pixel-art portrait | `generate_pixel_art_character` | `characterDescription`, `outputPath`, `pixelDimensions` | `spriteSheet`, `colors`, `transparentBackground`, `backgroundColor`, `model` | Use `transparentBackground=true` for gameplay assets. |
| Create a tileable environment texture | `generate_texture` | `textureDescription`, `outputPath` | `textureSize`, `seamless`, `materialType`, `model` | Set `seamless=true` for tiling surfaces. |
| Create a decal or isolated texture with alpha | `generate_texture` | `textureDescription`, `outputPath`, `transparentBackground=true` | `backgroundColor`, `transparencyTolerance`, `materialType` | Best for sprites, overlays, and decals rather than full tiling textures. |
| Create orthographic references for 3D modeling | `generate_object_sheet` | `objectDescription`, `outputBasePath` | `viewpoints`, `model`, `style` | Reduce viewpoints when cost matters; include `perspective` for readability. |
| Generate a 3D object from images | `image_to_3d_async` | `outputPath`, `inputImagePaths` | `model`, `variant`, `format`, `textured_mesh`, `statusFile` | Preferred when the user already has good reference images. |
| Generate a 3D object from text only | `image_to_3d_async` | `outputPath`, `prompt` | `model`, `referenceViews`, `autoGenerateReferences`, `cleanupReferences`, `statusFile` | The tool will create reference images automatically before 3D generation. |
| Generate a large scene/world style 3D output | `image_to_3d_async` | `outputPath`, one of `prompt` or `inputImagePaths` | `model=hunyuan-world`, `statusFile` | Use `hunyuan-world` for environments rather than isolated props. |

### Parameter Heuristics

| Goal | Recommendation |
| --- | --- |
| Lowest cost draft | Prefer `gpt-image-1.5` for images (other low-cost image models currently disabled) and `kling-2.5-turbo` for video. |
| Highest image quality | Prefer `gpt-image-1.5` for pure text-to-image. |
| Strong image-to-image consistency | Temporarily unavailable until i2i models are re-enabled. |
| Fast, reusable 3D output | Prefer `image_to_3d_async` with `format=glb`. |
| Better textured 3D asset quality | Set `textured_mesh=true` with `hunyuan3d` if the extra cost is acceptable. |
| Minimal successful request | Send only required parameters first, then add model/quality/style controls if the user asks for refinement. |

## 3D Model Generation

### Supported Models

- **Trellis** (FAL.ai): Single and multi-image variants
- **Hunyuan3D 2.0** (FAL.ai): Single, multi, single-turbo, and multi-turbo variants

### Features

- **Automatic Reference Generation**: When only a text prompt is provided, automatically generates reference images using PPQ.ai (`gpt-image-1.5`).
- **Base64 URI Support**: Default input format for images
- **Smart Variant Selection**: Automatically chooses single vs multi based on input image count
- **GLB/GLTF Output**: Web and game engine compatible 3D formats

### Implementation Details

- Core functions in `src/utils/model3dUtils.ts`
- Helper functions with automatic reference generation in `src/providers/model3dHelpers.ts`
- Tool schemas and handlers in `src/index.ts`
- Comprehensive tests in `tests/model3dHelpers.test.ts`

### Reference Image Consistency (Critical for 3D Quality)

**Problem**: Generating different objects for different views creates unusable 3D models.

**Solution**: The `generateReferenceImages()` function ensures consistency by:

1. **First View**: Generated from text prompt (usually front view)
2. **Subsequent Views**: Use previous image(s) as input with modified prompts
3. **View Ordering**: Always generates front view first for consistency
4. **Prompt Engineering**: Uses "Create a [view] view of the same object, maintaining exact consistency"

**Implementation Requirements**:

- Never generate multiple views independently from text prompts
- Always use image-to-image generation for subsequent views
- Maintain sharp, high-quality prompts with specific camera models
- Include "sharp edges, fine details" and "Sony A7R IV" for quality
- This ensures users "fall into the pit of success" with consistent 3D generation

## Testing Guidelines

- Mock external dependencies (API calls, file system operations) in unit tests
- Test both success and error scenarios
- Test environment variable validation
- Use `vi.mock()` for module mocking
- Test tool schema validation indirectly through function calls
- Test `ALLOWED_TOOLS` filtering functionality in unit tests

## Commit Process

1. Make changes
2. Run `npm run typecheck`
3. Run `npm test`
4. Run `npm run lint`
5. Commit with descriptive message
6. Build should pass automatically
