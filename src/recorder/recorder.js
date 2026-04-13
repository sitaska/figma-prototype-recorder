export class PrototypeRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.chunks = [];
    this.lastBlob = null;
    this.onStopCallback = null;
  }

  static getBestSupportedMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "video/webm";
  }

  async start() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      throw new Error("Ya existe una grabacion en curso.");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("Este entorno no soporta getDisplayMedia.");
    }

    this.chunks = [];
    this.lastBlob = null;

    this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 }
      },
      audio: true
    });

    const mimeType = PrototypeRecorder.getBestSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType,
      videoBitsPerSecond: 6_000_000
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.lastBlob = new Blob(this.chunks, { type: mimeType });
      if (typeof this.onStopCallback === "function") {
        this.onStopCallback(this.lastBlob);
      }
      this.cleanupStream();
    };

    this.mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event.error || event);
    };

    this.mediaRecorder.start(250);
  }

  stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
      return;
    }

    this.mediaRecorder.stop();
  }

  setOnStop(callback) {
    this.onStopCallback = callback;
  }

  cleanupStream() {
    if (!this.mediaStream) {
      return;
    }

    for (const track of this.mediaStream.getTracks()) {
      track.stop();
    }

    this.mediaStream = null;
  }

  getLastBlob() {
    return this.lastBlob;
  }
}
