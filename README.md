# MCP Asset Generation Server

A Model Context Protocol server for generating images, videos, audio, and 3D models for game development. Images, video, and audio run through PPQ.ai; 3D model generation uses FAL.ai.

## Features

- Image generation with PPQ.ai models such as gpt-image-1.5.
- Video generation via PPQ.ai text-to-video and image-to-video models.
- Audio generation via PPQ.ai text-to-speech and speech-to-text.
- 3D model generation via FAL.ai Trellis and Hunyuan3D.
- Game-asset helpers for character sheets, variations, textures, pixel art, and object sheets.

## Installation

```bash
npm install
npm run build
```

## Development

```bash
npm run dev
npm test
npm run typecheck
npm run lint
```

## Real PPQ.ai Integration Tests

```bash
npm run test:integration
```

This suite lives in `tests/integration.test.ts`, calls the real PPQ.ai-backed tools without mocks, and stores reusable artifacts under `test_assets/real_ppq/`.

- Each scenario writes a `result.json` manifest with the prompt/query, selected source model, parsed tool result, and produced files.
- Existing successful artifacts are reused on later runs to avoid repeated paid API calls.
- Set `FORCE_REAL_API_TESTS=true` or run `npm run test:integration:refresh` to regenerate everything intentionally.
- Set `PPQ_REAL_TOOL_FILTER=ppqai_generate_image,ppqai_text_to_speech` to run only specific tools.
- Generated artifacts remain ignored by git because `test_assets/` is gitignored.

## Configuration

```bash
# Required for image/video/audio generation
export PPQ_API_KEY="your-ppq-ai-key"

# Required only for 3D model generation
export FAL_AI_API_KEY="your-fal-ai-key"
```

### Tool Filtering

```bash
export ALLOWED_TOOLS="ppqai_generate_image,ppqai-transform_image,generate_texture,ppqai_generate_video"
```

## Available Tools

### Image Generation

- `ppqai_generate_image`: Generate images via PPQ.ai from text prompts.
- `ppqai-transform_image`: Temporarily disabled (no stable i2i model currently enabled).

### Video Generation

- `ppqai_generate_video`: Async video generation via PPQ.ai.

### Audio Generation

- `ppqai_text_to_speech`: Text-to-speech via PPQ.ai.
- `ppqai_transcribe_audio`: Speech-to-text via PPQ.ai.

### Game Asset Tools

- `generate_character_sheet`
- `generate_pixel_art_character`
- `generate_texture`
- `generate_object_sheet`

### 3D Model Generation

- `image_to_3d_async`: Generate 3D models in the background with FAL.ai.

## Project Structure

```text
src/
├── index.ts
├── utils/
│   ├── imageUtils.ts
│   └── model3dUtils.ts
└── providers/
    ├── imageProviders.ts
    ├── imageHelpers.ts
    ├── videoHelpers.ts
    ├── audioHelpers.ts
    └── model3dHelpers.ts

tests/
├── integration.test.ts
└── *.test.ts
```

## License

MIT
