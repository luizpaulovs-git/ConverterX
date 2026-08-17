const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = 3001;

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "converted");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "ConverterX backend está funcionando!",
  });
});

/*
==================================================
VÍDEO LOCAL → MP3
==================================================
*/

app.post(
  "/api/video-to-mp3",
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Nenhum arquivo foi enviado.",
      });
    }

    const inputPath = req.file.path;

    const originalName = path.parse(
      req.file.originalname
    ).name;

    const outputName =
      `${originalName}-audio.mp3`;

    const outputPath = path.join(
      outputDir,
      outputName
    );

    console.log(
      "Convertendo arquivo:",
      req.file.originalname
    );

    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ]);

    let errorOutput = "";

    ffmpeg.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on("close", (code) => {
      fs.unlink(inputPath, () => {});

      if (code !== 0) {
        console.error(
          "Erro FFmpeg:",
          errorOutput
        );

        return res.status(500).json({
          error:
            "Não foi possível converter o arquivo.",
        });
      }

      res.download(
        outputPath,
        outputName,
        (error) => {
          fs.unlink(
            outputPath,
            () => {}
          );

          if (
            error &&
            !res.headersSent
          ) {
            res.status(500).json({
              error:
                "Erro ao enviar o arquivo convertido.",
            });
          }
        }
      );
    });
  }
);

/*
==================================================
YOUTUBE → MP3

Use somente para conteúdo que você possui
ou tem autorização para baixar.
==================================================
*/

app.post(
  "/api/youtube-to-mp3",
  async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error:
          "Nenhum link do YouTube foi enviado.",
      });
    }

    const youtubeUrl = url.trim();

    /*
     * Verificação básica para evitar que
     * qualquer endereço seja passado ao yt-dlp.
     */

    let parsedUrl;

    try {
      parsedUrl = new URL(youtubeUrl);
    } catch {
      return res.status(400).json({
        error: "O link informado não é válido.",
      });
    }

    const allowedHosts = [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
      "www.youtu.be",
    ];

    if (
      !allowedHosts.includes(
        parsedUrl.hostname.toLowerCase()
      )
    ) {
      return res.status(400).json({
        error:
          "Informe um link válido do YouTube.",
      });
    }

    const outputTemplate = path.join(
      outputDir,
      "youtube-%(id)s.%(ext)s"
    );

    console.log(
      "Processando YouTube:",
      youtubeUrl
    );

    const ytDlp = spawn("yt-dlp", [
      "--no-playlist",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "192K",
      "-o",
      outputTemplate,
      youtubeUrl,
    ]);

    let errorOutput = "";

    ytDlp.stderr.on("data", (data) => {
      const text = data.toString();

      errorOutput += text;

      console.log(
        "[yt-dlp]",
        text.trim()
      );
    });

    ytDlp.on("error", (error) => {
      console.error(
        "Erro ao iniciar yt-dlp:",
        error
      );

      return res.status(500).json({
        error:
          "O yt-dlp não está instalado ou não foi encontrado no PATH do Windows.",
      });
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        console.error(
          "yt-dlp terminou com erro:",
          errorOutput
        );

        return res.status(500).json({
          error:
            "Não foi possível processar o vídeo do YouTube.",
        });
      }

      fs.readdir(
        outputDir,
        (readError, files) => {
          if (readError) {
            return res.status(500).json({
              error:
                "Não foi possível localizar o MP3.",
            });
          }

          const mp3Files =
            files.filter((file) =>
              file.startsWith("youtube-") &&
              file.endsWith(".mp3")
            );

          if (mp3Files.length === 0) {
            return res.status(500).json({
              error:
                "O MP3 não foi encontrado após a conversão.",
            });
          }

          const fileName =
            mp3Files[mp3Files.length - 1];

          const filePath =
            path.join(
              outputDir,
              fileName
            );

          console.log(
            "MP3 pronto:",
            fileName
          );

          res.download(
            filePath,
            fileName,
            (downloadError) => {
              fs.unlink(
                filePath,
                () => {}
              );

              if (
                downloadError &&
                !res.headersSent
              ) {
                res.status(500).json({
                  error:
                    "Erro ao enviar o MP3.",
                });
              }
            }
          );
        }
      );
    });
  }
);

/*
==================================================
INICIAR SERVIDOR
==================================================
*/

app.listen(PORT, () => {
  console.log(
    `ConverterX backend rodando em http://localhost:${PORT}`
  );
});