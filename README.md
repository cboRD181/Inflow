# Inflow: Frictionless LLM (Chrome MV3)

Fires up an on-page chat panel when you start typing natural-language while no input is focused. It seeds the chat with your typed text and includes domain, page title, and visible viewport text as implicit context.

![demo](https://github.com/user-attachments/assets/bca3428e-5784-4630-9e66-6b2a0c6a836e)


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
