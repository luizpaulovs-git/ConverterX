import { useEffect, useRef, useState } from "react";
import "./App.css";
import jsPDF from "jspdf";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

type ImageFormat = "PNG" | "JPG" | "WEBP" | "PDF";

type FileType = "image" | "video";

interface ImageInfo {
  width: number;
  height: number;
}

interface ConvertedFile {
  blob: Blob;
  url: string;
  size: number;
  name: string;
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef(new FFmpeg());

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [format, setFormat] = useState<ImageFormat>("PNG");
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [converted, setConverted] = useState<ConvertedFile | null>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = ffmpegRef.current;

        if (!ffmpeg.loaded) {
          await ffmpeg.load();
        }

        setFfmpegLoaded(true);
      } catch (error) {
        console.error("Erro ao carregar FFmpeg:", error);
        alert("Não foi possível carregar o conversor de vídeo.");
      }
    };

    loadFFmpeg();
  }, []);

  function selectFile(selectedFile: File | undefined) {
    if (!selectedFile) return;

    const isImage = selectedFile.type.startsWith("image/");
    const isVideo = selectedFile.type.startsWith("video/");

    if (!isImage && !isVideo) {
      alert("Formato de arquivo não suportado.");
      return;
    }

    if (converted) {
      URL.revokeObjectURL(converted.url);
    }

    setFile(selectedFile);
    setConverted(null);
    setImageInfo(null);

    if (isVideo) {
      setFileType("video");
      return;
    }

    setFileType("image");

    loadImage(selectedFile)
      .then((image) => {
        setImageInfo({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      })
      .catch(() => {
        setImageInfo(null);
        alert("Não foi possível carregar essa imagem.");
      });
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    selectFile(event.target.files?.[0]);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    selectFile(event.dataTransfer.files?.[0]);
  }

  function removeFile() {
    if (converted) {
      URL.revokeObjectURL(converted.url);
    }

    setFile(null);
    setFileType(null);
    setImageInfo(null);
    setConverted(null);

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function convertFile() {
    if (!file || !fileType) return;

    try {
      setConverting(true);

      if (converted) {
        URL.revokeObjectURL(converted.url);
        setConverted(null);
      }

      /*
       * =========================
       * VÍDEO → MP3
       * =========================
       */
      if (fileType === "video") {
        if (!ffmpegLoaded) {
          throw new Error("FFmpeg ainda não foi carregado.");
        }

        const ffmpeg = ffmpegRef.current;

        const inputName = "input-video";
        const outputName = "output.mp3";

        const inputData = await fetchFile(file);

        await ffmpeg.writeFile(inputName, inputData);

        await ffmpeg.exec([
          "-i",
          inputName,
          "-vn",
          "-acodec",
          "libmp3lame",
          "-q:a",
          "2",
          outputName,
        ]);

        const outputData = await ffmpeg.readFile(outputName);

        const audioBlob = new Blob(
          [new Uint8Array(outputData)],
          {
            type: "audio/mpeg",
          }
        );

        const url = URL.createObjectURL(audioBlob);

        const originalName = removeExtension(file.name);

        setConverted({
          blob: audioBlob,
          url,
          size: audioBlob.size,
          name: `${originalName}-audio.mp3`,
        });

        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

        return;
      }

      /*
       * =========================
       * IMAGEM
       * =========================
       */

      const image = await loadImage(file);

      let blob: Blob;

      if (format === "PDF") {
        blob = createPdfFromImage(image);
      } else {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Não foi possível criar o canvas.");
        }

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        if (format === "JPG") {
          context.fillStyle = "#ffffff";
          context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        context.drawImage(image, 0, 0);

        const mimeType =
          format === "PNG"
            ? "image/png"
            : format === "JPG"
              ? "image/jpeg"
              : "image/webp";

        const quality =
          format === "PNG" ? undefined : 0.92;

        blob = await canvasToBlob(
          canvas,
          mimeType,
          quality
        );
      }

      const url = URL.createObjectURL(blob);

      const convertedFile: ConvertedFile = {
        blob,
        url,
        size: blob.size,
        name: createFileName(file.name, format),
      };

      setConverted(convertedFile);
    } catch (error) {
      console.error(error);

      if (fileType === "video") {
        alert(
          "Ocorreu um erro ao converter o vídeo para MP3."
        );
      } else {
        alert(
          "Ocorreu um erro ao converter a imagem."
        );
      }
    } finally {
      setConverting(false);
    }
  }

  function downloadConverted() {
    if (!converted) return;

    const link = document.createElement("a");

    link.href = converted.url;
    link.download = converted.name;

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetConversion() {
    if (converted) {
      URL.revokeObjectURL(converted.url);
    }

    setConverted(null);
  }

  if (!ffmpegLoaded) {
    return (
      <main className="app">
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Carregando conversor...
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">C</span>
          <span>ConverterX</span>
        </div>

        <span className="status">
          Conversor online
        </span>
      </header>

      <section className="hero">
        <div className="badge">
          SIMPLES • RÁPIDO • GRATUITO
        </div>

        <h1>
          Converta seus arquivos
          <br />
          <span>de forma simples.</span>
        </h1>

        <p>
          Converta imagens e vídeos diretamente no navegador.
        </p>
      </section>

      <section className="converter">
        {!file ? (
          <div
            className={`drop-zone ${
              dragging ? "dragging" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInput.current?.click()}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={handleFileChange}
            />

            <div className="upload-icon">↑</div>

            <h2>
              Arraste seu arquivo aqui
            </h2>

            <p>
              ou clique para selecionar um arquivo
            </p>

            <span className="formats">
              PNG • JPG • WEBP • MP4 • WEBM • MOV
            </span>
          </div>
        ) : (
          <div className="workspace">
            <div className="preview-card">
              <div className="preview-header">
                <span>Visualização</span>

                <button
                  className="change-button"
                  onClick={() =>
                    fileInput.current?.click()
                  }
                >
                  Trocar arquivo
                </button>
              </div>

              <div className="preview">
                {fileType === "image" ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt="Pré-visualização"
                  />
                ) : (
                  <video
                    src={URL.createObjectURL(file)}
                    controls
                    style={{
                      maxWidth: "100%",
                      maxHeight: "400px",
                    }}
                  />
                )}
              </div>
            </div>

            <div className="file-card">
              <div className="file-main">
                <div className="file-icon">
                  {fileType === "video"
                    ? "▶"
                    : "✓"}
                </div>

                <div className="file-info">
                  <strong>{file.name}</strong>

                  <span>
                    {formatFileSize(file.size)}

                    {imageInfo &&
                      ` • ${imageInfo.width} × ${imageInfo.height}px`}
                  </span>
                </div>

                <button
                  className="remove-button"
                  onClick={removeFile}
                >
                  ×
                </button>
              </div>

              {fileType === "image" ? (
                <div className="conversion-flow">
                  <div className="format-box">
                    <span>ORIGINAL</span>

                    <strong>
                      {getFileExtension(file.name)}
                    </strong>
                  </div>

                  <div className="arrow">
                    →
                  </div>

                  <div className="format-box">
                    <span>CONVERTER PARA</span>

                    <select
                      value={format}
                      onChange={(event) =>
                        setFormat(
                          event.target
                            .value as ImageFormat
                        )
                      }
                    >
                      <option value="PNG">
                        PNG
                      </option>

                      <option value="JPG">
                        JPG
                      </option>

                      <option value="WEBP">
                        WEBP
                      </option>

                      <option value="PDF">
                        PDF
                      </option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="conversion-flow">
                  <div className="format-box">
                    <span>ORIGINAL</span>

                    <strong>
                      {getFileExtension(file.name)}
                    </strong>
                  </div>

                  <div className="arrow">
                    →
                  </div>

                  <div className="format-box">
                    <span>CONVERTER PARA</span>

                    <strong>MP3</strong>
                  </div>
                </div>
              )}

              {!converted ? (
                <button
                  className="convert-button"
                  disabled={converting}
                  onClick={convertFile}
                >
                  {converting
                    ? "Convertendo..."
                    : fileType === "video"
                      ? "Extrair áudio"
                      : "Converter imagem"}

                  {!converting && (
                    <span>→</span>
                  )}
                </button>
              ) : (
                <div className="result">
                  <div className="result-info">
                    <div className="success-icon">
                      ✓
                    </div>

                    <div>
                      <strong>
                        Conversão concluída!
                      </strong>

                      <span>
                        {formatFileSize(
                          file.size
                        )}{" "}
                        →{" "}
                        {formatFileSize(
                          converted.size
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="result-actions">
                    <button
                      className="secondary-button"
                      onClick={resetConversion}
                    >
                      Converter novamente
                    </button>

                    <button
                      className="download-button"
                      onClick={downloadConverted}
                    >
                      Baixar arquivo
                      <span>↓</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {file && (
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
            hidden
            onChange={handleFileChange}
          />
        )}
      </section>

      <footer>
        <span>ConverterX</span>

        <span>
          Um projeto desenvolvido por Luiz Paulo
        </span>
      </footer>
    </main>
  );
}

function createPdfFromImage(
  image: HTMLImageElement
): Blob {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const orientation =
    width > height
      ? "landscape"
      : "portrait";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth =
    pdf.internal.pageSize.getWidth();

  const pageHeight =
    pdf.internal.pageSize.getHeight();

  const margin = 10;

  const availableWidth =
    pageWidth - margin * 2;

  const availableHeight =
    pageHeight - margin * 2;

  const imageRatio =
    width / height;

  let renderWidth =
    availableWidth;

  let renderHeight =
    renderWidth / imageRatio;

  if (renderHeight > availableHeight) {
    renderHeight =
      availableHeight;

    renderWidth =
      renderHeight * imageRatio;
  }

  const x =
    (pageWidth - renderWidth) / 2;

  const y =
    (pageHeight - renderHeight) / 2;

  const canvas =
    document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "Não foi possível preparar a imagem para o PDF."
    );
  }

  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    width,
    height
  );

  context.drawImage(
    image,
    0,
    0
  );

  const imageData =
    canvas.toDataURL(
      "image/jpeg",
      0.92
    );

  pdf.addImage(
    imageData,
    "JPEG",
    x,
    y,
    renderWidth,
    renderHeight,
    undefined,
    "FAST"
  );

  return pdf.output("blob");
}

function loadImage(
  file: File
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      const url =
        URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);

        reject(
          new Error(
            "Não foi possível carregar a imagem."
          )
        );
      };

      image.src = url;
    }
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error(
                "Não foi possível gerar o arquivo."
              )
            );
          }
        },
        type,
        quality
      );
    }
  );
}

function createFileName(
  originalName: string,
  format: ImageFormat
): string {
  const lastDot =
    originalName.lastIndexOf(".");

  const name =
    lastDot > 0
      ? originalName.substring(
          0,
          lastDot
        )
      : originalName;

  return `${name}-convertido.${format.toLowerCase()}`;
}

function removeExtension(
  fileName: string
): string {
  const lastDot =
    fileName.lastIndexOf(".");

  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.substring(
    0,
    lastDot
  );
}

function getFileExtension(
  fileName: string
): string {
  const lastDot =
    fileName.lastIndexOf(".");

  if (lastDot === -1) {
    return "ARQUIVO";
  }

  return fileName
    .substring(lastDot + 1)
    .toUpperCase();
}

function formatFileSize(
  bytes: number
): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB",
  ];

  const index =
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    );

  return `${(
    bytes /
    Math.pow(1024, index)
  ).toFixed(1)} ${units[index]}`;
}

export default App;