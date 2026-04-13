const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");
const cropModeBtn = document.getElementById("cropModeBtn");
const downloadCropBtn = document.getElementById("downloadCropBtn");
const sourceSelect = document.getElementById("sourceSelect");
const outputModeSelect = document.getElementById("outputModeSelect");
const deviceSelect = document.getElementById("deviceSelect");
const downloadExportBtn = document.getElementById("downloadExportBtn");
const status = document.getElementById("status");
const preview = document.getElementById("preview");
const cropOverlay = document.getElementById("cropOverlay");

let stream = null;
let mediaRecorder = null;
let chunks = [];
let outputBlob = null;
let croppedBlob = null;
let objectUrl = "";
let cropSelection = null;
let isSelectingCrop = false;
let dragStart = null;

function setStatus(text) {
  status.textContent = text;
}

function cleanupUrl() {
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrl = "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getBestCanvasMimeType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "video/webm";
}

function updateExportControls() {
  const hasRecording = Boolean(outputBlob);
  sourceSelect.disabled = !hasRecording;
  outputModeSelect.disabled = !hasRecording;

  const cropOption = sourceSelect.querySelector('option[value="crop"]');
  if (cropOption) {
    cropOption.disabled = !(croppedBlob || cropSelection);
  }

  if ((!croppedBlob && !cropSelection) && sourceSelect.value === "crop") {
    sourceSelect.value = "full";
  }

  const mockupMode = outputModeSelect.value === "mockup";
  deviceSelect.disabled = !hasRecording || !mockupMode;
  downloadExportBtn.disabled = !hasRecording;
}

function resetCropSelection() {
  cropSelection = null;
  croppedBlob = null;
  cropOverlay.hidden = true;
  downloadCropBtn.disabled = true;
  updateExportControls();
}

function setCropOverlay(rect) {
  cropOverlay.hidden = false;
  cropOverlay.style.left = `${rect.x}px`;
  cropOverlay.style.top = `${rect.y}px`;
  cropOverlay.style.width = `${rect.width}px`;
  cropOverlay.style.height = `${rect.height}px`;
}

function getRelativePoint(event) {
  const bounds = preview.getBoundingClientRect();
  const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
  return { x, y };
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

async function createVideoFromBlob(blob) {
  const sourceUrl = URL.createObjectURL(blob);
  const sourceVideo = document.createElement("video");
  sourceVideo.src = sourceUrl;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.preload = "auto";

  await new Promise((resolve, reject) => {
    sourceVideo.onloadedmetadata = () => resolve();
    sourceVideo.onerror = () => reject(new Error("No se pudo cargar el video fuente."));
  });

  return { sourceVideo, sourceUrl };
}

async function recordCanvasFromVideo(sourceVideo, drawFrame, canvasWidth, canvasHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No se pudo crear el contexto de canvas.");
  }

  const canvasStream = canvas.captureStream(60);
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: getBestCanvasMimeType(),
    videoBitsPerSecond: 8_000_000
  });
  const renderedChunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      renderedChunks.push(event.data);
    }
  };

  const stopPromise = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(200);
  sourceVideo.currentTime = 0;
  await sourceVideo.play();

  await new Promise((resolve) => {
    const draw = () => {
      drawFrame(ctx, canvas.width, canvas.height);

      if (sourceVideo.ended) {
        resolve();
        return;
      }

      requestAnimationFrame(draw);
    };
    draw();
  });

  recorder.stop();
  await stopPromise;

  return new Blob(renderedChunks, { type: "video/webm" });
}

async function createCroppedBlob() {
  if (!outputBlob || !cropSelection) {
    return null;
  }

  const { sourceVideo, sourceUrl } = await createVideoFromBlob(outputBlob);

  const displayWidth = preview.clientWidth;
  const displayHeight = preview.clientHeight;
  const scaleX = sourceVideo.videoWidth / displayWidth;
  const scaleY = sourceVideo.videoHeight / displayHeight;

  const sourceX = Math.floor(cropSelection.x * scaleX);
  const sourceY = Math.floor(cropSelection.y * scaleY);
  const sourceW = Math.max(2, Math.floor(cropSelection.width * scaleX));
  const sourceH = Math.max(2, Math.floor(cropSelection.height * scaleY));

  const blob = await recordCanvasFromVideo(
    sourceVideo,
    (ctx) => {
      ctx.drawImage(sourceVideo, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
    },
    sourceW,
    sourceH
  );

  sourceVideo.pause();
  URL.revokeObjectURL(sourceUrl);
  return blob;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getDeviceLayout(device, sourceWidth, sourceHeight) {
  const ratio = sourceWidth / sourceHeight;
  const portrait = sourceHeight >= sourceWidth;

  const presets = {
    auto: {
      screenHeight: portrait ? 1280 : 860,
      sideBezelFactor: 0.07,
      topInsetFactor: 0.09,
      bottomInsetFactor: 0.1,
      screenRadiusFactor: 0.065,
      shellRadiusFactor: 0.1,
      hasHomeButton: false,
      hasNotch: false,
      hasSideButtons: true,
      shellTone: "dark"
    },
    iphone: {
      screenHeight: portrait ? 1460 : 920,
      sideBezelFactor: 0.068,
      topInsetFactor: 0.1,
      bottomInsetFactor: 0.135,
      screenRadiusFactor: 0.07,
      shellRadiusFactor: 0.11,
      hasHomeButton: true,
      hasNotch: false,
      hasSideButtons: true,
      shellTone: "silver"
    },
    pixel: {
      screenHeight: portrait ? 1480 : 940,
      sideBezelFactor: 0.07,
      topInsetFactor: 0.1,
      bottomInsetFactor: 0.11,
      screenRadiusFactor: 0.075,
      shellRadiusFactor: 0.11,
      hasHomeButton: false,
      hasNotch: false,
      hasSideButtons: true,
      shellTone: "dark"
    },
    tablet: {
      screenHeight: portrait ? 1320 : 980,
      sideBezelFactor: 0.06,
      topInsetFactor: 0.07,
      bottomInsetFactor: 0.08,
      screenRadiusFactor: 0.045,
      shellRadiusFactor: 0.075,
      hasHomeButton: true,
      hasNotch: false,
      hasSideButtons: true,
      shellTone: "silver"
    }
  };

  const selected = presets[device] || presets.auto;
  const screenHeight = selected.screenHeight;
  const screenWidth = Math.round(screenHeight * ratio);

  const sideBezel = Math.max(28, Math.round(Math.min(screenWidth, screenHeight) * selected.sideBezelFactor));
  const topInset = Math.max(38, Math.round(screenHeight * selected.topInsetFactor));
  const bottomInset = Math.max(42, Math.round(screenHeight * selected.bottomInsetFactor));

  const canvasWidth = screenWidth + sideBezel * 2;
  const canvasHeight = screenHeight + topInset + bottomInset;
  const shellRadius = Math.round(Math.min(canvasWidth, canvasHeight) * selected.shellRadiusFactor);
  const screenRadius = Math.round(Math.min(screenWidth, screenHeight) * selected.screenRadiusFactor);

  return {
    canvasWidth,
    canvasHeight,
    shellRadius,
    screenRadius,
    screenRect: {
      x: sideBezel,
      y: topInset,
      width: screenWidth,
      height: screenHeight
    },
    hasNotch: selected.hasNotch,
    hasHomeButton: selected.hasHomeButton,
    hasSideButtons: selected.hasSideButtons,
    shellTone: selected.shellTone
  };
}

function drawDeviceBody(ctx, layout) {
  const { canvasWidth, canvasHeight, shellRadius, shellTone } = layout;

  ctx.save();
  roundedRectPath(ctx, 0, 0, canvasWidth, canvasHeight, shellRadius);
  ctx.shadowColor = "rgba(4, 12, 16, 0.38)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fill();
  ctx.restore();

  roundedRectPath(ctx, 0, 0, canvasWidth, canvasHeight, shellRadius);

  const shellGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  if (shellTone === "silver") {
    shellGradient.addColorStop(0, "#f4f6f8");
    shellGradient.addColorStop(0.24, "#b6bcc4");
    shellGradient.addColorStop(0.52, "#edf0f4");
    shellGradient.addColorStop(0.78, "#9aa3ae");
    shellGradient.addColorStop(1, "#e7eaef");
  } else {
    shellGradient.addColorStop(0, "#2b3138");
    shellGradient.addColorStop(0.32, "#13181e");
    shellGradient.addColorStop(0.62, "#2a3139");
    shellGradient.addColorStop(1, "#0e1217");
  }
  ctx.fillStyle = shellGradient;
  ctx.fill();

  roundedRectPath(ctx, 2, 2, canvasWidth - 4, canvasHeight - 4, Math.max(6, shellRadius - 2));
  const rimGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  rimGradient.addColorStop(0, "rgba(255,255,255,0.85)");
  rimGradient.addColorStop(0.4, "rgba(190,198,209,0.55)");
  rimGradient.addColorStop(1, "rgba(245,249,255,0.75)");
  ctx.strokeStyle = rimGradient;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawSideButtons(ctx, layout) {
  if (!layout.hasSideButtons) {
    return;
  }

  const buttonWidth = Math.max(5, Math.round(layout.canvasWidth * 0.008));
  const sideGap = Math.max(2, Math.round(layout.canvasWidth * 0.003));

  const drawButton = (x, y, w, h) => {
    roundedRectPath(ctx, x, y, w, h, w / 2);
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, "#c9d0d9");
    grad.addColorStop(1, "#798390");
    ctx.fillStyle = grad;
    ctx.fill();
  };

  const leftX = sideGap;
  drawButton(leftX, layout.screenRect.y + layout.screenRect.height * 0.18, buttonWidth, layout.screenRect.height * 0.12);
  drawButton(leftX, layout.screenRect.y + layout.screenRect.height * 0.34, buttonWidth, layout.screenRect.height * 0.08);

  const rightX = layout.canvasWidth - buttonWidth - sideGap;
  drawButton(rightX, layout.screenRect.y + layout.screenRect.height * 0.28, buttonWidth, layout.screenRect.height * 0.18);
}

function drawTopDetails(ctx, layout) {
  const speakerWidth = Math.round(layout.screenRect.width * 0.2);
  const speakerHeight = Math.max(8, Math.round(layout.screenRect.height * 0.012));
  const speakerX = layout.screenRect.x + (layout.screenRect.width - speakerWidth) / 2;
  const speakerY = Math.max(18, layout.screenRect.y - Math.round(layout.screenRect.height * 0.06));

  roundedRectPath(ctx, speakerX, speakerY, speakerWidth, speakerHeight, speakerHeight / 2);
  ctx.fillStyle = "rgba(42, 46, 52, 0.92)";
  ctx.fill();

  const camR = Math.max(4, Math.round(speakerHeight * 0.55));
  const camX = speakerX + speakerWidth + camR * 2;
  const camY = speakerY + speakerHeight / 2;
  ctx.beginPath();
  ctx.arc(camX, camY, camR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(18, 22, 28, 0.96)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(camX - 1, camY - 1, Math.max(1.5, camR * 0.33), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(109, 169, 255, 0.42)";
  ctx.fill();
}

function drawHomeButton(ctx, layout) {
  if (!layout.hasHomeButton) {
    return;
  }

  const radius = Math.max(14, Math.round(layout.canvasWidth * 0.032));
  const x = layout.canvasWidth / 2;
  const y = layout.screenRect.y + layout.screenRect.height + (layout.canvasHeight - (layout.screenRect.y + layout.screenRect.height)) / 2;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const outerGrad = ctx.createRadialGradient(x - 3, y - 3, 4, x, y, radius);
  outerGrad.addColorStop(0, "#f0f3f7");
  outerGrad.addColorStop(0.55, "#8f99a6");
  outerGrad.addColorStop(1, "#d7dde5");
  ctx.fillStyle = outerGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, Math.max(8, radius * 0.62), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(40, 45, 53, 0.92)";
  ctx.fill();
}

function fitContain(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (targetWidth - width) / 2;
  const y = (targetHeight - height) / 2;
  return { x, y, width, height };
}

async function createMockupBlob(sourceBlob, device) {
  const { sourceVideo, sourceUrl } = await createVideoFromBlob(sourceBlob);
  const layout = getDeviceLayout(device, sourceVideo.videoWidth, sourceVideo.videoHeight);

  const blob = await recordCanvasFromVideo(
    sourceVideo,
    (ctx, canvasWidth, canvasHeight) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      drawDeviceBody(ctx, layout);
      drawSideButtons(ctx, layout);
      drawTopDetails(ctx, layout);

      roundedRectPath(
        ctx,
        layout.screenRect.x,
        layout.screenRect.y,
        layout.screenRect.width,
        layout.screenRect.height,
        layout.screenRadius
      );
      ctx.fillStyle = "#000";
      ctx.fill();

      ctx.save();
      roundedRectPath(
        ctx,
        layout.screenRect.x,
        layout.screenRect.y,
        layout.screenRect.width,
        layout.screenRect.height,
        layout.screenRadius
      );
      ctx.clip();

      const fit = fitContain(
        sourceVideo.videoWidth,
        sourceVideo.videoHeight,
        layout.screenRect.width,
        layout.screenRect.height
      );

      ctx.drawImage(
        sourceVideo,
        layout.screenRect.x + fit.x,
        layout.screenRect.y + fit.y,
        fit.width,
        fit.height
      );
      ctx.restore();

      if (layout.hasNotch) {
        const notchWidth = Math.round(layout.screenRect.width * 0.33);
        const notchHeight = Math.round(layout.screenRect.height * 0.035);
        const notchX = layout.screenRect.x + (layout.screenRect.width - notchWidth) / 2;
        const notchY = layout.screenRect.y + 10;
        roundedRectPath(ctx, notchX, notchY, notchWidth, notchHeight, notchHeight / 2);
        ctx.fillStyle = "#0a0b0e";
        ctx.fill();
      }

      drawHomeButton(ctx, layout);
    },
    layout.canvasWidth,
    layout.canvasHeight
  );

  sourceVideo.pause();
  URL.revokeObjectURL(sourceUrl);
  return blob;
}

async function ensureCroppedBlob() {
  if (croppedBlob) {
    return croppedBlob;
  }

  if (!cropSelection) {
    return null;
  }

  setStatus("Generando recorte base del prototipo...");
  croppedBlob = await createCroppedBlob();
  if (croppedBlob) {
    updateExportControls();
  }
  return croppedBlob;
}

async function getSelectedSourceBlob() {
  if (sourceSelect.value === "crop") {
    const selected = await ensureCroppedBlob();
    if (!selected) {
      throw new Error("Aun no hay un recorte valido. Selecciona el area del prototipo primero.");
    }
    return selected;
  }

  if (!outputBlob) {
    throw new Error("Aun no hay una grabacion para exportar.");
  }

  return outputBlob;
}

async function exportCroppedWebm() {
  const blob = await ensureCroppedBlob();
  if (!blob) {
    throw new Error("No se pudo generar recorte.");
  }

  downloadBlob(blob, `prototype-crop-${Date.now()}.webm`);
  setStatus("Recorte exportado. Revisa el archivo descargado.");
}

startBtn.addEventListener("click", async () => {
  try {
    setStatus("Selecciona la ventana de Figma en el dialogo del navegador...");
    outputBlob = null;
    croppedBlob = null;
    downloadBtn.disabled = true;
    cropModeBtn.disabled = true;
    sourceSelect.value = "full";
    outputModeSelect.value = "raw";
    resetCropSelection();
    updateExportControls();

    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 } },
      audio: true
    });

    chunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      outputBlob = new Blob(chunks, { type: "video/webm" });
      cleanupUrl();
      objectUrl = URL.createObjectURL(outputBlob);
      preview.src = objectUrl;
      downloadBtn.disabled = false;
      cropModeBtn.disabled = false;
      setStatus("Grabacion lista. Puedes descargar el archivo.");
      updateExportControls();

      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    };

    mediaRecorder.start(250);
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("Grabando... vuelve a esta pestaña y presiona detener al terminar.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la grabacion";
    setStatus(`Error: ${message}`);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Procesando video...");
});

outputModeSelect.addEventListener("change", () => {
  updateExportControls();
});

sourceSelect.addEventListener("change", () => {
  updateExportControls();
});

cropModeBtn.addEventListener("click", () => {
  if (!outputBlob) {
    return;
  }
  isSelectingCrop = true;
  setStatus("Modo recorte activo. Arrastra sobre el video para seleccionar el area del prototipo.");
});

preview.addEventListener("pointerdown", (event) => {
  if (!isSelectingCrop) {
    return;
  }
  const point = getRelativePoint(event);
  dragStart = point;
  setCropOverlay({ x: point.x, y: point.y, width: 1, height: 1 });
});

preview.addEventListener("pointermove", (event) => {
  if (!isSelectingCrop || !dragStart) {
    return;
  }
  const point = getRelativePoint(event);
  const rect = normalizeRect(dragStart, point);
  setCropOverlay(rect);
});

preview.addEventListener("pointerup", (event) => {
  if (!isSelectingCrop || !dragStart) {
    return;
  }

  const point = getRelativePoint(event);
  const rect = normalizeRect(dragStart, point);
  dragStart = null;
  isSelectingCrop = false;

  if (rect.width < 20 || rect.height < 20) {
    resetCropSelection();
    setStatus("Recorte muy pequeno. Vuelve a seleccionar un area mayor.");
    return;
  }

  cropSelection = rect;
  croppedBlob = null;
  downloadCropBtn.disabled = false;
  setCropOverlay(rect);
  updateExportControls();
  setStatus("Area seleccionada. Pulsa 'Descargar recorte WebM'.");
});

downloadCropBtn.addEventListener("click", async () => {
  try {
    downloadCropBtn.disabled = true;
    cropModeBtn.disabled = true;
    setStatus("Generando recorte... este proceso puede tardar lo que dura el video.");
    await exportCroppedWebm();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo exportar el recorte";
    setStatus(`Error al recortar: ${message}`);
  } finally {
    cropModeBtn.disabled = false;
    downloadCropBtn.disabled = !cropSelection;
    updateExportControls();
  }
});

downloadBtn.addEventListener("click", () => {
  if (!outputBlob) return;
  downloadBlob(outputBlob, `prototype-recording-${Date.now()}.webm`);
});

downloadExportBtn.addEventListener("click", async () => {
  try {
    downloadExportBtn.disabled = true;
    setStatus("Preparando exportacion...");

    const sourceBlob = await getSelectedSourceBlob();

    if (outputModeSelect.value === "raw") {
      downloadBlob(sourceBlob, `prototype-export-${Date.now()}.webm`);
      setStatus("Exportacion lista: video sin mockup.");
      return;
    }

    setStatus("Renderizando mockup de dispositivo... esto puede tardar segun la duracion.");
    const mockupBlob = await createMockupBlob(sourceBlob, deviceSelect.value);
    downloadBlob(mockupBlob, `prototype-device-mockup-${Date.now()}.webm`);
    setStatus("Exportacion lista: video con mockup de dispositivo.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo exportar";
    setStatus(`Error de exportacion: ${message}`);
  } finally {
    updateExportControls();
  }
});

window.addEventListener("beforeunload", () => {
  cleanupUrl();
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
});

updateExportControls();
