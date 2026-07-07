# Contribution Guide

Thank you for your interest in contributing to **Cortex Multimodal Proxy**! This project implements the "Cortex Sensorial v3" architecture and your help is essential to improve the multimodal perception of LLMs.

## 🌟 How you can help

### 1. Report Bugs

If you find something that doesn't work:

1. Check if an Issue is already open.
2. Open a new Issue detailing the content that failed (URL/Base64), the logs from `./scripts/manage.sh logs`, and the expected behavior.

### 2. Submit Pull Requests

1. **Fork** the repository.
2. Create a branch (`feature/improvement` or `fix/error`).
3. Submit the Pull Request detailing the changes.

## 🛠️ Project Structure

To contribute effectively, it is important to understand where each part of the logic lives:

- `src/index.ts`: Application entry point, Express routing and main routing (OpenAI API compatibility).
- `src/middleware/`:
  - `multimodalDetector.ts`: The heart of the "Cortex". Decides whether a request goes to DeepSeek or Gemini.
  - `multimodalProcessor.ts`: Manages the transformation of files/URLs into processable content.
- `src/services/`:
  - `geminiService.ts`: Integration with the Google API (Perception System).
  - `deepseekService.ts`: Integration with the DeepSeek API (Reasoning System).
  - `cacheService.ts`: Contextual cache logic based on SHA-256 hashes.
- `src/utils/`:
  - `pdfProcessor.ts`: Smart routing logic and local PDF processing.
  - `downloader.ts`: Secure URL download with Content-Type validation.
  - `imageProcessor.ts`: Tools for pre-send image manipulation.
- `scripts/`: Enhanced automation scripts.
  - `setup.sh`: Full installation and service configuration.
  - `manage.sh`: Unified management command (start, stop, status, logs).
  - `run-local.sh`: Quick execution without installation.

## 💻 Development Workflow

1. **Installation:**

   ```bash
   npm install
   ```

2. **Watch Mode (Development):**

   ```bash
   npm run dev
   ```

   This uses `tsx watch` to automatically reload the proxy after each change.

3. **Testing:**
   Run tests before submitting a PR:

   ```bash
   # Unit tests (fast, no API cost)
   npm run test:unit

   # Integration tests (require APIs)
   node test/test-master.js
   ```

4. **Local Management:**
   You can use `./scripts/manage.sh status` to check the API status after your changes.

5. **Build:**
   ```bash
   npm run build
   ```

## 📜 Standards and Quality

- **Clean Architecture:** Keep low-level utilities in `utils/` and integration logic in `services/`.
- **Zod:** We use Zod for configuration schema and response validation.
- **Winston:** Use the centralized logger in `src/utils/logger.ts` to maintain log consistency.

## ⚖️ License

By contributing, you agree that your changes will be under the [MIT License](./LICENSE).
