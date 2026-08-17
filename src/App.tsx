import { useRef, useState } from "react";
import "./App.css";
import jsPDF from "jspdf";

type ImageFormat = "PNG" | "JPG" | "WEBP" | "PDF";
type FileType = "image" | "video";
type ConverterMode = "file" | "youtube";

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

  const [converterMode, setConverterMode] =
    useState<ConverterMode>("file");

  const [youtubeUrl, setYoutubeUrl] = useState("");

  const [file, setFile] = useState<File | null>(null);

  const [fileType, setFileType] =
    useState<FileType | null>(null);

  const [format, setFormat] =
    useState<ImageFormat>("PNG");

  const [dragging, setDragging] = useState(false);

  const [converting, setConverting] = useState(false);

  const [imageInfo, setImageInfo] =
    useState<ImageInfo | null>(null);

  const [converted, setConverted] =
    useState<ConvertedFile | null>(null);

  function selectFile(selectedFile?: File) {
    if (!selectedFile) return;

    const isImage =
      selectedFile.type.startsWith("image/");

    const isVideo =
      selectedFile.type.startsWith("video/");

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

        alert(
          "Não foi possível carregar essa imagem."
        );
      });
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    selectFile(event.target.files?.[0]);
  }

  function handleDrop(
    event: React.DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragging(false);

    selectFile(
      event.dataTransfer.files?.[0]
    );
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

  function changeMode(mode: ConverterMode) {
    setConverterMode(mode);

    if (mode === "youtube") {
      removeFile();
    }

    setYoutubeUrl("");
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
       * =================================
       * VÍDEO → MP3
       * =================================
       */

      if (fileType === "video") {
        const formData = new FormData();

        formData.append("file", file);

        const response = await fetch(
          "http://localhost:3001/api/video-to-mp3",
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          const data =
            await response
              .json()
              .catch(() => null);

          throw new Error(
            data?.error ||
              "Erro ao converter o vídeo."
          );
        }

        const blob =
          await response.blob();

        const url =
          URL.createObjectURL(blob);

        const originalName =
          removeExtension(file.name);

        setConverted({
          blob,
          url,
          size: blob.size,
          name: `${originalName}-audio.mp3`,
        });

        return;
      }

      /*
       * =================================
       * IMAGEM
       * =================================
       */

      const image =
        await loadImage(file);

      let blob: Blob;

      if (format === "PDF") {
        blob =
          createPdfFromImage(image);
      } else {
        const canvas =
          document.createElement(
            "canvas"
          );

        const context =
          canvas.getContext("2d");

        if (!context) {
          throw new Error(
            "Não foi possível criar o canvas."
          );
        }

        canvas.width =
          image.naturalWidth;

        canvas.height =
          image.naturalHeight;

        if (format === "JPG") {
          context.fillStyle =
            "#ffffff";

          context.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        context.drawImage(
          image,
          0,
          0
        );

        const mimeType =
          format === "PNG"
            ? "image/png"
            : format === "JPG"
              ? "image/jpeg"
              : "image/webp";

        const quality =
          format === "PNG"
            ? undefined
            : 0.92;

        blob =
          await canvasToBlob(
            canvas,
            mimeType,
            quality
          );
      }

      const url =
        URL.createObjectURL(blob);

      setConverted({
        blob,
        url,
        size: blob.size,
        name: createFileName(
          file.name,
          format
        ),
      });
    } catch (error) {
      console.error(error);

      if (fileType === "video") {
        alert(
          error instanceof Error
            ? error.message
            : "Erro ao converter o vídeo."
        );
      } else {
        alert(
          "Erro ao converter a imagem."
        );
      }
    } finally {
      setConverting(false);
    }
  }

  function downloadConverted() {
    if (!converted) return;

    const link =
      document.createElement("a");

    link.href =
      converted.url;

    link.download =
      converted.name;

    document.body.appendChild(link);

    link.click();

    link.remove();
  }

  function resetConversion() {
    if (converted) {
      URL.revokeObjectURL(
        converted.url
      );
    }

    setConverted(null);
  }

  async function handleYoutubeConvert() {
    if (!youtubeUrl.trim()) {
      alert(
        "Cole um link do YouTube."
      );

      return;
    }

    try {
      setConverting(true);

      const response =
        await fetch(
          "http://localhost:3001/api/youtube-to-mp3",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              url: youtubeUrl.trim(),
            }),
          }
        );

      if (!response.ok) {
        let message =
          "Não foi possível converter o vídeo.";

        try {
          const data =
            await response.json();

          if (data?.error) {
            message =
              data.error;
          }
        } catch {
          // Ignora erro ao ler JSON
        }

        throw new Error(message);
      }

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(blob);

      const contentDisposition =
        response.headers.get(
          "Content-Disposition"
        );

      let fileName =
        "youtube-audio.mp3";

      if (contentDisposition) {
        const match =
          contentDisposition.match(
            /filename="?([^"]+)"?/
          );

        if (match?.[1]) {
          fileName =
            match[1];
        }
      }

      setConverted({
        blob,
        url,
        size: blob.size,
        name: fileName,
      });
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao converter o vídeo."
      );
    } finally {
      setConverting(false);
    }
  }

  return (
    <main className="app">

      <header className="header">

        <div className="logo">

          <span className="logo-icon">
            C
          </span>

          <span>
            ConverterX
          </span>

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

          <span>
            de forma simples.
          </span>
        </h1>

        <p>
          Converta imagens, vídeos
          e links do YouTube.
        </p>

      </section>

      <section className="converter">

        <div className="converter-tabs">

          <button
            type="button"
            className={
              converterMode === "file"
                ? "active"
                : ""
            }
            onClick={() =>
              changeMode("file")
            }
          >
            🖼️ Arquivos
          </button>

          <button
            type="button"
            className={
              converterMode === "youtube"
                ? "active"
                : ""
            }
            onClick={() =>
              changeMode("youtube")
            }
          >
            🔗 YouTube → MP3
          </button>

        </div>

        {converterMode === "file" && (
          <>

            {!file ? (

              <div
                className={`drop-zone ${
                  dragging
                    ? "dragging"
                    : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() =>
                  setDragging(false)
                }
                onDrop={handleDrop}
                onClick={() =>
                  fileInput.current?.click()
                }
              >

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                  hidden
                  onChange={
                    handleFileChange
                  }
                />

                <div className="upload-icon">
                  ↑
                </div>

                <h2>
                  Arraste seu arquivo aqui
                </h2>

                <p>
                  ou clique para selecionar
                  um arquivo
                </p>

                <span className="formats">
                  PNG • JPG • WEBP • MP4 • WEBM • MOV
                </span>

              </div>

            ) : (

              <div className="workspace">

                <div className="preview-card">

                  <div className="preview-header">

                    <span>
                      Visualização
                    </span>

                    <button
                      type="button"
                      className="change-button"
                      onClick={() =>
                        fileInput.current?.click()
                      }
                    >
                      Trocar arquivo
                    </button>

                  </div>

                  <div className="preview">

                    {fileType ===
                    "image" ? (

                      <img
                        src={URL.createObjectURL(
                          file
                        )}
                        alt="Pré-visualização"
                      />

                    ) : (

                      <video
                        src={URL.createObjectURL(
                          file
                        )}
                        controls
                        style={{
                          maxWidth:
                            "100%",
                          maxHeight:
                            "400px",
                        }}
                      />

                    )}

                  </div>

                </div>

                <div className="file-card">

                  <div className="file-main">

                    <div className="file-icon">

                      {fileType ===
                      "video"
                        ? "▶"
                        : "✓"}

                    </div>

                    <div className="file-info">

                      <strong>
                        {file.name}
                      </strong>

                      <span>

                        {formatFileSize(
                          file.size
                        )}

                        {imageInfo &&
                          ` • ${imageInfo.width} × ${imageInfo.height}px`}

                      </span>

                    </div>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={
                        removeFile
                      }
                    >
                      ×
                    </button>

                  </div>

                  {fileType ===
                  "image" ? (

                    <div className="conversion-flow">

                      <div className="format-box">

                        <span>
                          ORIGINAL
                        </span>

                        <strong>
                          {getFileExtension(
                            file.name
                          )}
                        </strong>

                      </div>

                      <div className="arrow">
                        →
                      </div>

                      <div className="format-box">

                        <span>
                          CONVERTER PARA
                        </span>

                        <select
                          value={
                            format
                          }
                          onChange={(
                            event
                          ) =>
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

                        <span>
                          ORIGINAL
                        </span>

                        <strong>
                          {getFileExtension(
                            file.name
                          )}
                        </strong>

                      </div>

                      <div className="arrow">
                        →
                      </div>

                      <div className="format-box">

                        <span>
                          CONVERTER PARA
                        </span>

                        <strong>
                          MP3
                        </strong>

                      </div>

                    </div>

                  )}

                  {!converted ? (

                    <button
                      type="button"
                      className="convert-button"
                      disabled={
                        converting
                      }
                      onClick={
                        convertFile
                      }
                    >

                      {converting
                        ? "Convertendo..."
                        : fileType ===
                            "video"
                          ? "Extrair áudio"
                          : "Converter imagem"}

                      {!converting && (
                        <span>
                          →
                        </span>
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
                            )}

                            {" → "}

                            {formatFileSize(
                              converted.size
                            )}

                          </span>

                        </div>

                      </div>

                      <div className="result-actions">

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={
                            resetConversion
                          }
                        >
                          Converter novamente
                        </button>

                        <button
                          type="button"
                          className="download-button"
                          onClick={
                            downloadConverted
                          }
                        >
                          Baixar arquivo

                          <span>
                            ↓
                          </span>

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
                onChange={
                  handleFileChange
                }
              />

            )}

          </>
        )}

        {converterMode ===
          "youtube" && (

          <div className="youtube-converter">

            <div className="youtube-icon">
              ▶
            </div>

            <h2>
              YouTube → MP3
            </h2>

            <p>
              Cole o link de um vídeo
              do YouTube para extrair
              o áudio.
            </p>

            <input
              type="text"
              value={youtubeUrl}
              onChange={(event) =>
                setYoutubeUrl(
                  event.target.value
                )
              }
              placeholder="Cole aqui o link do YouTube..."
            />

            <button
              type="button"
              className="convert-button"
              disabled={
                !youtubeUrl.trim() ||
                converting
              }
              onClick={
                handleYoutubeConvert
              }
            >

              {converting
                ? "Convertendo..."
                : "Converter para MP3"}

              {!converting && (
                <span>
                  →
                </span>
              )}

            </button>

          </div>

        )}

      </section>

      <footer>

        <span>
          ConverterX
        </span>

        <span>
          Um projeto desenvolvido por
          Luiz Paulo
        </span>

      </footer>

    </main>
  );
}

function createPdfFromImage(
  image: HTMLImageElement
): Blob {

  const width =
    image.naturalWidth;

  const height =
    image.naturalHeight;

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
    pageWidth -
    margin * 2;

  const availableHeight =
    pageHeight -
    margin * 2;

  const imageRatio =
    width / height;

  let renderWidth =
    availableWidth;

  let renderHeight =
    renderWidth /
    imageRatio;

  if (
    renderHeight >
    availableHeight
  ) {

    renderHeight =
      availableHeight;

    renderWidth =
      renderHeight *
      imageRatio;
  }

  const x =
    (pageWidth -
      renderWidth) /
    2;

  const y =
    (pageHeight -
      renderHeight) /
    2;

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "Não foi possível preparar a imagem para o PDF."
    );
  }

  context.fillStyle =
    "#ffffff";

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
        URL.createObjectURL(
          file
        );

      image.onload = () => {

        URL.revokeObjectURL(
          url
        );

        resolve(image);
      };

      image.onerror = () => {

        URL.revokeObjectURL(
          url
        );

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
    originalName.lastIndexOf(
      "."
    );

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
    fileName.lastIndexOf(
      "."
    );

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
    fileName.lastIndexOf(
      "."
    );

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
    Math.pow(
      1024,
      index
    )
  ).toFixed(1)} ${units[index]}`;
}

export default App;