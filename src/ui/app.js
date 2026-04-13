import { PrototypeRecorder } from "../recorder/recorder.js";
import { transcodeWebmToMp4 } from "../ffmpeg/ffmpeg.js";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");
const externalBtn = document.getElementById("externalBtn");
const formatSelect = document.getElementById("formatSelect");
const outputPanel = document.getElementById("outputPanel");
const preview = document.getElementById("preview");
const statusDot = document.getElementById("statusDot");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");

const recorder = new PrototypeRecorder();
let objectUrl = "";
let outputBlob = null;
let outputFormat = "webm";

function hasDisplayCaptureSupport() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

function showDesktopFallback() {
  externalBtn.hidden = false;
  setStatus(
    "Captura no disponible en Desktop",
    "Abre el grabador web para registrar la ventana de Figma y exportar video.",
    false
  );
}

function setStatus(title, text, isRecording = false) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusDot.classList.toggle("recording", isRecording);
}

function revokePreviewUrl() {
  if (!objectUrl) {
    return;
  }

  URL.revokeObjectURL(objectUrl);
  objectUrl = "";
}

async function onRecordingReady(blob) {
  outputFormat = formatSelect.value;
  outputBlob = blob;

  if (outputFormat === "mp4") {
    setStatus("Convirtiendo", "Transformando WebM a MP4 con FFmpeg...", false);

    try {
      outputBlob = await transcodeWebmToMp4(blob);
      setStatus("Grabacion lista", "Video MP4 generado. Puedes descargarlo.");
    } catch (error) {
      outputFormat = "webm";
      outputBlob = blob;
      const message = error instanceof Error ? error.message : "Error desconocido";
      setStatus("MP4 no disponible", `Se mantiene WebM. Detalle: ${message}`);
    }
  }

  revokePreviewUrl();
  objectUrl = URL.createObjectURL(outputBlob);

  preview.src = objectUrl;
  outputPanel.hidden = false;
  downloadBtn.disabled = false;

  if (outputFormat === "webm") {
    setStatus("Grabacion lista", "Puedes previsualizar y descargar tu video.");
  }

  parent.postMessage(
    {
      pluginMessage: {
        type: "notify",
        payload: "Grabacion finalizada"
      }
    },
    "*"
  );
}

recorder.setOnStop(onRecordingReady);

if (!hasDisplayCaptureSupport()) {
  showDesktopFallback();
}

startBtn.addEventListener("click", async () => {
  if (!hasDisplayCaptureSupport()) {
    showDesktopFallback();
    return;
  }

  try {
    setStatus("Solicitando permisos", "Selecciona pantalla, ventana o pestana para empezar.", false);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    downloadBtn.disabled = true;
    formatSelect.disabled = true;

    await recorder.start();
    setStatus("Grabando", "Interactua con tu prototipo. Presiona detener al terminar.", true);
  } catch (error) {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    formatSelect.disabled = false;

    const message = error instanceof Error ? error.message : "No se pudo iniciar la grabacion";
    setStatus("Error al iniciar", message, false);
  }
});

externalBtn.addEventListener("click", () => {
  parent.postMessage(
    {
      pluginMessage: {
        type: "open-external-recorder"
      }
    },
    "*"
  );
});

stopBtn.addEventListener("click", () => {
  recorder.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  formatSelect.disabled = false;
  setStatus("Procesando", "Generando archivo de video...", false);
});

downloadBtn.addEventListener("click", () => {
  if (!outputBlob) {
    return;
  }

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `prototype-recording-${Date.now()}.${outputFormat}`;
  link.click();
});

window.addEventListener("beforeunload", () => {
  revokePreviewUrl();
  recorder.cleanupStream();
});
