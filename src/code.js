figma.showUI(__html__, { width: 380, height: 560 });

const EXTERNAL_RECORDER_URL = "https://figma-prototype-recorder.vercel.app/";

figma.ui.onmessage = (msg) => {
  if (!msg || typeof msg !== "object") {
    return;
  }

  if (msg.type === "open-external-recorder") {
    const targetUrl =
      msg.payload && typeof msg.payload.url === "string" ? msg.payload.url : EXTERNAL_RECORDER_URL;
    figma.openExternal(targetUrl);
    figma.notify("Abriendo grabador web en tu navegador");
    return;
  }

  if (msg.type === "close-plugin") {
    figma.closePlugin();
    return;
  }

  if (msg.type === "notify" && typeof msg.payload === "string") {
    figma.notify(msg.payload);
  }
};
