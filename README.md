# Inflow: A Chrome Extension for invoking an LLM with your context without breaking flow

Begin typing your question to open a chat with your current viewport as context, no hotkeys or buttons needed

<video src="demo.mp4" muted autoplay controls loop></video>


## Install (Developer Mode)

1. Get an API key from a supported provider (like `https://openrouter.ai`).
2. Chrome → Extensions → Enable Developer mode → Load unpacked → select this folder.
3. Click the extension icon → set your API provider and key.

## Usage

- Start typing a sentence on any page while no input is focused. An overlay appears.
- The initial typed text pre-fills the question. Press Enter to send.
- Close the panel with `Esc` or by clicking outside of it.

## Features

- **Context-aware**: Automatically includes the current page's content in its queries.
- **Adaptive UI**: The chat panel adapts its colors to match the current website's theme.
- **Streaming Responses**: Get fast, real-time answers from the LLM.
- **Provider Support**: Works with OpenRouter, OpenAI, Google Gemini, Anthropic, or any custom OpenAI-compatible API endpoint.
- **Privacy-focused**: Your API key is stored locally on your device and never transmitted to anyone other than the LLM provider you've configured. Keystroke detection is local only.

## Notes

- Permissions are broad (`<all_urls>`) to allow the injection of the chat panel on any site.
- The streaming parser expects an OpenAI-compatible SSE format.
