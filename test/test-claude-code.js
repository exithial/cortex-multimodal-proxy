const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:7777";
const ANTHROPIC_VERSION = "2023-06-01";
const FILES_DIR = path.join(__dirname, "files");

function loadBase64File(fileName) {
  const filePath = path.join(FILES_DIR, fileName);
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("base64");
}

function toDataUrl(fileName, mimeType) {
  const base64 = loadBase64File(fileName);
  return `data:${mimeType};base64,${base64}`;
}

async function testAnthropicModels() {
  console.log("Test 1: GET /v1/models (Anthropic client)");

  const res = await axios.get(`${BASE_URL}/v1/models`, {
    headers: { "anthropic-version": ANTHROPIC_VERSION },
  });

  const models = res.data.data.map((m) => m.id);
  console.log("  Modelos:", models);

  const expected = ["haiku", "sonnet", "opus"];
  const allPresent = expected.every((m) => models.includes(m));

  console.log(allPresent ? "  PASS" : "  FAIL");
  return allPresent;
}

async function testHaikuTextOnly() {
  console.log("\nTest 2: Haiku (mimo-v2.5 passthrough) - Solo texto");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "haiku",
      max_tokens: 100,
      messages: [{ role: "user", content: "Di 'hola mundo' y nada mas" }],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Content:", res.data.content[0]?.text?.substring(0, 50));
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass =
    res.data.type === "message" &&
    res.headers["x-multimodal-strategy"] === "direct";
  console.log(pass ? "  PASS" : "  FAIL");
  return pass;
}

async function testSonnetWithImage() {
  console.log("\nTest 3: Sonnet (deepseek-chat) - Con imagen");

  const dataUrlImage = toDataUrl("image.png", "image/png");

  try {
    const res = await axios.post(
      `${BASE_URL}/v1/messages`,
      {
        model: "sonnet",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                data: dataUrlImage.split(",")[1],
                },
              },
              {
                type: "text",
                text: "Que ves en esta imagen?",
              },
            ],
          },
        ],
      },
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      },
    );

    console.log("  Response type:", res.data.type);
    console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

    const pass =
      res.data.type === "message" &&
      ["vision", "vision-mimo", "mixed"].includes(
        res.headers["x-multimodal-strategy"],
      );
    console.log(pass ? "  PASS" : "  FAIL");
    return pass;
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error?.message || "";
    if (
      message.includes("Gemini Multimodal fall") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("Unable to process input image")
    ) {
      console.log("  SKIP (Gemini no disponible o imagen rechazada)");
      return "skipped";
    }
    throw error;
  }
}

async function testOpusTextOnly() {
  console.log("\nTest 4: Opus (deepseek-reasoner) - Solo texto");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "opus",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: "Responde solo con 'ok'",
        },
      ],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass = res.data.type === "message";
  console.log(pass ? "  PASS" : "  FAIL");
  return pass;
}

async function testAudio() {
  console.log("\nTest 8: Audio (Gemini) - MP3");

  const audioUrl = toDataUrl("audio.mp3", "audio/mpeg");

  try {
    const res = await axios.post(
      `${BASE_URL}/v1/messages`,
      {
        model: "sonnet",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe el audio" },
              { type: "audio_url", url: audioUrl, format: "mp3" },
            ],
          },
        ],
      },
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      },
    );

    console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);
    const pass = ["gemini", "mixed"].includes(
      res.headers["x-multimodal-strategy"],
    );
    console.log(pass ? "  PASS" : "  FAIL");
    return pass;
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error?.message || "";
    if (message.includes("Gemini") || message.includes("GEMINI_API_KEY")) {
      console.log("  SKIP (Gemini no disponible o audio rechazado)");
      return "skipped";
    }
    throw error;
  }
}

async function testVideo() {
  console.log("\nTest 9: Video (Gemini) - MP4");

  const videoUrl = toDataUrl("video.mp4", "video/mp4");

  try {
    const res = await axios.post(
      `${BASE_URL}/v1/messages`,
      {
        model: "sonnet",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe el video" },
              { type: "video_url", url: videoUrl, format: "mp4" },
            ],
          },
        ],
      },
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      },
    );

    console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);
    const pass = ["gemini", "mixed"].includes(
      res.headers["x-multimodal-strategy"],
    );
    console.log(pass ? "  PASS" : "  FAIL");
    return pass;
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error?.message || "";
    if (message.includes("Gemini") || message.includes("GEMINI_API_KEY")) {
      console.log("  SKIP (Gemini no disponible o video rechazado)");
      return "skipped";
    }
    throw error;
  }
}

async function testPdfSmall() {
  console.log("\nTest 10: PDF (small-test.pdf)");

  const pdfUrl = toDataUrl("small-test.pdf", "application/pdf");

  try {
    const res = await axios.post(
      `${BASE_URL}/v1/messages`,
      {
        model: "sonnet",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Resume el PDF" },
              { type: "document_url", url: pdfUrl, format: "pdf" },
            ],
          },
        ],
      },
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      },
    );

    console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);
    const pass = ["gemini", "local", "mixed"].includes(
      res.headers["x-multimodal-strategy"],
    );
    console.log(pass ? "  PASS" : "  FAIL");
    return pass;
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error?.message || "";
    if (message.includes("Gemini") || message.includes("GEMINI_API_KEY")) {
      console.log("  SKIP (Gemini no disponible o PDF rechazado)");
      return "skipped";
    }
    throw error;
  }
}

async function testPdfLarge() {
  console.log("\nTest 11: PDF (large-test.pdf)");

  const pdfUrl = toDataUrl("large-test.pdf", "application/pdf");

  try {
    const res = await axios.post(
      `${BASE_URL}/v1/messages`,
      {
        model: "sonnet",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Resume el PDF" },
              { type: "document_url", url: pdfUrl, format: "pdf" },
            ],
          },
        ],
      },
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      },
    );

    console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);
    const pass = ["gemini", "local", "mixed"].includes(
      res.headers["x-multimodal-strategy"],
    );
    console.log(pass ? "  PASS" : "  FAIL");
    return pass;
  } catch (error) {
    const message =
      error?.response?.data?.error?.message || error?.message || "";
    if (message.includes("Gemini") || message.includes("GEMINI_API_KEY")) {
      console.log("  SKIP (Gemini no disponible o PDF rechazado)");
      return "skipped";
    }
    throw error;
  }
}

async function testStreaming() {
  console.log("\nTest 5: Streaming SSE - Haiku");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "haiku",
      max_tokens: 50,
      stream: true,
      messages: [{ role: "user", content: "Di hola" }],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      responseType: "stream",
    },
  );

  let fullText = "";
  let buffer = "";

  await new Promise((resolve, reject) => {
    res.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const lines = part.split("\n");
        let eventType = "";
        let dataLine = "";
        for (const line of lines) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataLine = line.slice(5).trim();
        }
        if (eventType === "content_block_delta" && dataLine) {
          try {
            const parsed = JSON.parse(dataLine);
            const text = parsed?.delta?.text;
            if (text) fullText += text;
          } catch {
          }
        }
      }
    });
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });

  const pass = fullText.length > 0;
  console.log(pass ? "  PASS" : "  FAIL", `| text: ${fullText.trim()}`);
  return pass;
}

async function testHeartbeats() {
  console.log("\nTest 6: Heartbeats");
  const res = await axios.post(`${BASE_URL}/`);
  const pass = res.status === 200;
  console.log(pass ? "  PASS" : "  FAIL");
  return pass;
}

async function testTelemetry() {
  console.log("\nTest 7: Telemetria");
  const res = await axios.post(`${BASE_URL}/api/event_logging/batch`, {
    events: [],
  });
  const pass = res.status === 200;
  console.log(pass ? "  PASS" : "  FAIL");
  return pass;
}

async function runTests() {
  console.log("Iniciando tests de Claude Code\n");

  const results = [];
  results.push(await testAnthropicModels());
  results.push(await testHaikuTextOnly());
  results.push(await testSonnetWithImage());
  results.push(await testOpusTextOnly());
  results.push(await testStreaming());
  results.push(await testHeartbeats());
  results.push(await testTelemetry());
  results.push(await testAudio());
  results.push(await testVideo());
  results.push(await testPdfSmall());
  results.push(await testPdfLarge());

  const passed = results.filter((r) => r === true).length;
  const skipped = results.filter((r) => r === "skipped").length;
  const total = results.length - skipped;
  console.log(`\nResultados: ${passed}/${total} tests pasados (${skipped} skipped)`);

  process.exit(passed === total ? 0 : 1);
}

runTests();
