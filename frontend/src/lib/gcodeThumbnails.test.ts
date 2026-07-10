import { describe, expect, it } from "vitest";
import {
  buildMoonrakerThumbnailUrl,
  getGcodeBasename,
  pickGcodeThumbnail,
} from "./gcodeThumbnails";
import type { GcodeFileMetadata, GcodeThumbnail } from "../usePrinterState";

describe("getGcodeBasename", () => {
  it("strips leading directories, keeping only the filename", () => {
    expect(getGcodeBasename("folder/subfolder/model.gcode")).toBe(
      "model.gcode",
    );
  });

  it("returns a bare filename unchanged", () => {
    expect(getGcodeBasename("model.gcode")).toBe("model.gcode");
  });

  it("returns an empty string for a trailing slash (directory, not a file)", () => {
    expect(getGcodeBasename("folder/subfolder/")).toBe("");
  });

  it("returns an empty string for null/undefined/empty input", () => {
    expect(getGcodeBasename(null)).toBe("");
    expect(getGcodeBasename(undefined)).toBe("");
    expect(getGcodeBasename("")).toBe("");
  });

  it("handles a single leading slash (absolute-looking path)", () => {
    expect(getGcodeBasename("/model.gcode")).toBe("model.gcode");
  });
});

describe("pickGcodeThumbnail", () => {
  const thumb = (width: number, relative_path = `t${width}.png`): GcodeThumbnail => ({
    width,
    height: width,
    relative_path,
  });

  it("returns null when metadata is missing or has no thumbnails", () => {
    expect(pickGcodeThumbnail(null)).toBeNull();
    expect(pickGcodeThumbnail({ filename: "x.gcode", thumbnails: [] })).toBeNull();
  });

  it("filters out thumbnails without a relative_path", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [{ width: 32, height: 32, relative_path: null }, thumb(64)],
    };
    expect(pickGcodeThumbnail(metadata, "big")?.width).toBe(64);
  });

  it("'big' variant returns the largest thumbnail by width", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [thumb(32), thumb(300), thumb(96)],
    };
    expect(pickGcodeThumbnail(metadata, "big")?.width).toBe(300);
  });

  it("'small' variant returns the first thumbnail at least 96px wide", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [thumb(32), thumb(96), thumb(300)],
    };
    expect(pickGcodeThumbnail(metadata, "small")?.width).toBe(96);
  });

  it("'small' variant falls back to the smallest thumbnail if none reach 96px", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [thumb(64), thumb(32)],
    };
    expect(pickGcodeThumbnail(metadata, "small")?.width).toBe(32);
  });
});

describe("buildMoonrakerThumbnailUrl", () => {
  it("returns null without a filename or metadata", () => {
    expect(
      buildMoonrakerThumbnailUrl({ filename: null, metadata: { filename: "x" } }),
    ).toBeNull();
    expect(
      buildMoonrakerThumbnailUrl({ filename: "x.gcode", metadata: null }),
    ).toBeNull();
  });

  it("returns null when the metadata has no usable thumbnail", () => {
    const metadata: GcodeFileMetadata = { filename: "x.gcode", thumbnails: [] };
    expect(
      buildMoonrakerThumbnailUrl({ filename: "sub/x.gcode", metadata }),
    ).toBeNull();
  });

  it("builds a portal-proxied URL under the file's directory, root=gcodes", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [{ width: 300, height: 300, relative_path: ".thumbs/x-300x300.png" }],
    };
    const url = buildMoonrakerThumbnailUrl({
      filename: "models/sub dir/x.gcode",
      metadata,
    });
    expect(url).toBe(
      "/api/files/thumbnail/models/sub%20dir/.thumbs/x-300x300.png?root=gcodes",
    );
  });

  it("appends a &modified= cache-busting param when metadata.modified is a finite number", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      modified: 1700000000.9,
      thumbnails: [{ width: 300, height: 300, relative_path: "thumb.png" }],
    };
    const url = buildMoonrakerThumbnailUrl({ filename: "x.gcode", metadata });
    expect(url).toBe(
      "/api/files/thumbnail/thumb.png?root=gcodes&modified=1700000000",
    );
  });

  it("strips leading slashes from the thumbnail's relative_path before joining", () => {
    const metadata: GcodeFileMetadata = {
      filename: "x.gcode",
      thumbnails: [{ width: 300, height: 300, relative_path: "//thumb.png" }],
    };
    const url = buildMoonrakerThumbnailUrl({ filename: "x.gcode", metadata });
    expect(url).toBe("/api/files/thumbnail/thumb.png?root=gcodes");
  });
});
