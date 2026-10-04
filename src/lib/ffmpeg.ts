import ffmpeg from "fluent-ffmpeg";

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

export default ffmpeg;

export function probe(file: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) =>
    ffmpeg.ffprobe(file, (err, data) => (err ? reject(err) : resolve(data))),
  );
}
