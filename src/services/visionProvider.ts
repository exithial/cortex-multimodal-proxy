export type VisionContentType = "image" | "video" | "audio";

export interface VisionProvider {
  readonly name: string;
  isAvailable(): boolean;
  supportsContentType(type: VisionContentType): boolean;
  describeImage(imageUrl: string, userContext: string): Promise<string>;
  describeVideo(videoUrl: string, userContext: string): Promise<string>;
}
