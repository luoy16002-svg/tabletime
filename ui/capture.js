// Optional, local demonstration recorder. Captures this app's rendered DOM only.
// Open ?capture=1, interact normally, then download the recording. No microphone.
import { toCanvas, getFontEmbedCSS } from "html-to-image";

const panel = document.createElement("div");
panel.style.cssText =
  "position:fixed;bottom:8px;left:8px;z-index:50;background:white;border:1px solid #888;padding:8px;display:flex;gap:8px;font:12px system-ui;box-shadow:0 2px 10px #0002";
panel.innerHTML =
  '<input aria-label="Recording caption" style="width:360px" placeholder="English caption"><button id="record-start">Start recording</button><button id="record-stop" disabled>Stop & download</button><button id="record-still">Save screenshot</button><button id="record-full">Save full page</button><span role="status">Ready</span>';
document.body.append(panel);
const caption = panel.querySelector("input"),
  status = panel.querySelector("[role=status]");
const start = panel.querySelector("#record-start"),
  stop = panel.querySelector("#record-stop");
let recorder,
  canvas,
  context,
  active = false,
  fonts,
  started,
  frames = 0;

function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function renderFrame(withCaption = true) {
  fonts ??= await getFontEmbedCSS(document.getElementById("root"));
  const shot = await toCanvas(document.getElementById("root"), {
    fontEmbedCSS: fonts,
    pixelRatio: 1,
    backgroundColor: "#fbf9f3",
  });
  context.fillStyle = "#fbf9f3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    shot,
    0,
    window.scrollY,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (withCaption && caption.value) {
    context.fillStyle = "#25351ff2";
    context.fillRect(0, canvas.height - 82, canvas.width, 82);
    context.fillStyle = "#fffef9";
    context.font = '500 23px "DM Sans", sans-serif';
    const words = caption.value.split(" ");
    let line = "",
      lines = [];
    for (const word of words) {
      if (context.measureText(line + word).width > canvas.width - 96) {
        lines.push(line.trim());
        line = "";
      }
      line += word + " ";
    }
    lines.push(line.trim());
    lines
      .slice(0, 2)
      .forEach((text, i) =>
        context.fillText(
          text,
          42,
          canvas.height - (lines.length > 1 ? 50 : 34) + i * 29,
        ),
      );
  }
  frames++;
}
function setup() {
  canvas = document.createElement("canvas");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  context = canvas.getContext("2d");
}
async function loop() {
  if (!active) return;
  try {
    await renderFrame();
    status.textContent = `${Math.floor((performance.now() - started) / 1000)}s · ${frames} frames`;
  } catch (e) {
    status.textContent = e.message;
    active = false;
    if (recorder?.state === "recording") recorder.stop();
  }
  if (active) setTimeout(loop, 100);
}
start.onclick = async () => {
  start.disabled = true;
  status.textContent = "Preparing fonts…";
  try {
    await document.fonts.ready;
    setup();
    await renderFrame();
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find(MediaRecorder.isTypeSupported);
    recorder = new MediaRecorder(canvas.captureStream(8), {
      mimeType,
      videoBitsPerSecond: 4000000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      download(
        new Blob(chunks, { type: mimeType }),
        `tabletime-demo-${Date.now()}.webm`,
      );
      recorder.stream.getTracks().forEach((t) => t.stop());
      start.disabled = false;
      stop.disabled = true;
      status.textContent = "Downloaded";
    };
    recorder.start(1000);
    started = performance.now();
    active = true;
    stop.disabled = false;
    loop();
  } catch (e) {
    status.textContent = e.message;
    start.disabled = false;
  }
};
stop.onclick = () => {
  active = false;
  if (recorder?.state === "recording") recorder.stop();
};
panel.querySelector("#record-still").onclick = async () => {
  try {
    if (!active) setup();
    await renderFrame(false);
    canvas.toBlob((b) => download(b, `tabletime-screen-${Date.now()}.png`));
    status.textContent = "Screenshot downloaded";
  } catch (e) {
    status.textContent = e.message;
  }
};
panel.querySelector("#record-full").onclick = async () => {
  try {
    await document.fonts.ready;
    const root = document.getElementById("root");
    const shot = await toCanvas(root, {
      fontEmbedCSS: await getFontEmbedCSS(root),
      pixelRatio: 1,
      backgroundColor: "#f7f5ef",
    });
    shot.toBlob((blob) => download(blob, `tabletime-full-${Date.now()}.png`));
    status.textContent = "Full page downloaded";
  } catch (e) {
    status.textContent = e.message;
  }
};
