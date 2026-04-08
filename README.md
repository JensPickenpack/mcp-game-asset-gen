# MCP Asset Generation Server

A Model Context Protocol (MCP) server for generating images, videos, audio, and 3D models for game development. All generation runs through **PPQ.ai** (pay-per-use, no subscription) for images/video/audio and **FAL.ai** for 3D models.

## Features

- **Image Generation**: PPQ.ai with many models (gpt-image-1, nano-banana-pro, flux-2-pro/flex, flux-kontext-pro/max)
- **Video Generation**: PPQ.ai async text-to-video and image-to-video (veo3, kling-2.x, runway-gen4)
- **Audio Generation**: PPQ.ai text-to-speech (Deepgram Aura 2) and speech-to-text (Deepgram Nova 3)
- **3D Model Generation**: FAL.ai Trellis and Hunyuan3D 2.0
- **Game Asset Tools**: Character sheets, sprite sheets, textures, object reference sheets

## Installation

```bash
npm install
npm run build
```

## Development

```bash
npm run dev      # Hot reload
npm test         # Run tests
npm run typecheck
npm run lint
```

## Configuration

```bash
# Required for image/video/audio generation
export PPQ_API_KEY="your-ppq-ai-key"

# Required only for 3D model generation
export FAL_AI_API_KEY="your-fal-ai-key"
```

### Tool Filtering (Optional)

```bash
export ALLOWED_TOOLS="ppqai_generate_image,generate_texture,ppqai_generate_video"
```

## Available Tools

### Image Generation

- **`ppqai_generate_image`**: Generate images via PPQ.ai
  - Models: `gpt-image-1` (best quality), `nano-banana-pro` (cheapest, Gemini 3 Pro), `flux-2-pro`/`flux-2-flex`, `flux-kontext-pro`/`flux-kontext-max` (image-to-image), `flux-2-pro-i2i`
  - Params: `prompt`, `outputPath`, `model`, `quality`, `n`, `size`, `image_url`, `inputImagePath`

### Video Generation

- **`ppqai_generate_video`**: Async video generation via PPQ.ai
  - T2V models: `veo3`, `veo3-fast`, `kling-2.1-pro`, `kling-2.1-master`, `kling-2.5-turbo`, `runway-gen4`, `runway-aleph`
  - I2V models: `veo3-i2v`, `kling-2.1-master-i2v`, `kling-2.5-turbo-i2v`
  - Params: `prompt`, `outputPath`, `model`, `aspect_ratio`, `duration`, `quality`, `image_url`, `inputImagePath`, `statusFile`

### Audio Generation

- **`ppqai_text_to_speech`**: Text-to-speech via PPQ.ai (Deepgram Aura 2)
  - Voices: `aura-2-arcas-en`, `aura-2-thalia-en`, `aura-2-andromeda-en`, `aura-2-helena-en`, `aura-2-apollo-en`, `aura-2-aries-en`
  - Params: `input`, `outputPath`, `voice`

- **`ppqai_transcribe_audio`**: Speech-to-text via PPQ.ai (Deepgram Nova 3)
  - Supports: mp3, mp4, wav, webm, m4a (max 25MB)
  - Params: `filePath`, `language`, `prompt`

### Game Asset Tools

- **`generate_character_sheet`**: Multi-view character reference sheets
- **`generate_character_variation`**: Character variations from reference images
- **`generate_pixel_art_character`**: Pixel art with optional transparent background
- **`generate_texture`**: Seamless textures with optional transparency
- **`generate_object_sheet`**: Multi-viewpoint 3D reference sheets

All game asset tools accept a `model` parameter for choosing the PPQ.ai model.

### 3D Model Generation

- **`image_to_3d_async`**: Generate 3D models in background (FAL.ai)
  - Models: `hunyuan3d` (best), `trellis`, `hunyuan-world`
  - Auto-generates reference images via PPQ.ai if none provided
  - Returns a status JSON file for progress monitoring

## Project Structure

```
src/
├── index.ts                    # MCP server, tool definitions, handlers
├── utils/
│   ├── imageUtils.ts           # Shared image utilities, API key helpers
│   └── model3dUtils.ts         # FAL.ai 3D generation utilities
└── providers/
    ├── imageProviders.ts       # PPQ.ai image generation + game asset functions
    ├── imageHelpers.ts         # Image generation orchestration
    ├── videoHelpers.ts         # PPQ.ai video generation (async)
    ├── audioHelpers.ts         # PPQ.ai TTS and STT
    └── model3dHelpers.ts       # 3D model generation orchestration
```

## License

MIT
