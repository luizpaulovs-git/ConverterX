import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export const ffmpeg = new FFmpeg();

export { fetchFile };