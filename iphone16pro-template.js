// Realistic iPhone 16 Pro EXIF metadata template
// Values based on actual iPhone 16 Pro camera specifications

function generateRandomCoord(base, variance) {
  return base + (Math.random() - 0.5) * variance;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(arr) {
  return arr[arr.length * Math.random() | 0];
}

function generateSerialish() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[chars.length * Math.random() | 0];
  return s;
}

function padTwo(n) {
  return String(n).padStart(2, "0");
}

function generateTimestamp() {
  // Generate a plausible recent date within the last 30 days
  const now = new Date();
  const offset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);
  const d = new Date(now.getTime() - offset);
  const date = `${d.getFullYear()}:${padTwo(d.getMonth() + 1)}:${padTwo(d.getDate())}`;
  const time = `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
  return { date, time, full: `${date} ${time}`, iso: d.toISOString(), subsec: String(Math.floor(Math.random() * 1000)).padStart(3, "0") };
}

function buildIPhone16ProMetadata(overrides = {}) {
  const ts = generateTimestamp();

  // iPhone 16 Pro has 3 lenses: 48MP main (24mm), 48MP ultrawide (13mm), 12MP 5x tele (120mm)
  const lensProfiles = [
    {
      focalLength: "6.765",
      focalLength35mm: "24",
      aperture: "1.78",
      lensModel: "iPhone 16 Pro back triple camera 6.765mm f/1.78",
      lensId: "iPhone 16 Pro back triple camera 6.765mm f/1.78",
    },
    {
      focalLength: "2.22",
      focalLength35mm: "13",
      aperture: "2.2",
      lensModel: "iPhone 16 Pro back triple camera 2.22mm f/2.2",
      lensId: "iPhone 16 Pro back triple camera 2.22mm f/2.2",
    },
    {
      focalLength: "23.81",
      focalLength35mm: "120",
      aperture: "2.8",
      lensModel: "iPhone 16 Pro back triple camera 23.81mm f/2.8",
      lensId: "iPhone 16 Pro back triple camera 23.81mm f/2.8",
    },
  ];

  const lens = overrides.lensIndex != null ? lensProfiles[overrides.lensIndex] : randomChoice(lensProfiles);
  const iso = Math.floor(randomBetween(50, 2000));
  const shutterSpeed = randomChoice(["1/30", "1/60", "1/120", "1/250", "1/500", "1/1000", "1/2000", "1/4000"]);
  const brightness = randomBetween(2, 12).toFixed(4);

  const meta = {
    // -- TIFF / IFD0 --
    Make: "Apple",
    Model: "iPhone 16 Pro",
    Software: "18.3.2",
    Orientation: 1,

    // -- EXIF IFD --
    ExposureTime: shutterSpeed,
    FNumber: parseFloat(lens.aperture),
    ExposureProgram: 2, // Normal program
    ISO: iso,
    ExifVersion: "0232",
    DateTimeOriginal: ts.full,
    CreateDate: ts.full,
    ModifyDate: ts.full,
    OffsetTime: overrides.timezone || "+01:00",
    OffsetTimeOriginal: overrides.timezone || "+01:00",
    OffsetTimeDigitized: overrides.timezone || "+01:00",
    SubSecTimeOriginal: ts.subsec,
    SubSecTimeDigitized: ts.subsec,
    ShutterSpeedValue: shutterSpeed,
    ApertureValue: parseFloat(lens.aperture),
    BrightnessValue: parseFloat(brightness),
    ExposureBiasValue: 0,
    MeteringMode: 5, // Pattern
    Flash: 16, // No flash, no flash function
    FocalLength: parseFloat(lens.focalLength),
    FocalLengthIn35mmFormat: parseInt(lens.focalLength35mm),
    ColorSpace: 65535, // Uncalibrated (Display P3)
    ExifImageWidth: overrides.width || 4032,
    ExifImageHeight: overrides.height || 3024,
    SensingMethod: 2, // One-chip color area
    SceneType: 1, // Directly photographed
    ExposureMode: 0, // Auto
    WhiteBalance: 0, // Auto
    DigitalZoomRatio: 1,
    SceneCaptureType: 0, // Standard
    LensInfo: `${lens.focalLength}mm f/${lens.aperture}`,
    LensMake: "Apple",
    LensModel: lens.lensModel,
    CompositeImage: 2,

    // -- GPS --
    GPSLatitudeRef: "N",
    GPSLatitude: overrides.lat || generateRandomCoord(48.8566, 0.05),
    GPSLongitudeRef: overrides.lonRef || "E",
    GPSLongitude: overrides.lon || generateRandomCoord(2.3522, 0.05),
    GPSAltitudeRef: 0,
    GPSAltitude: Math.floor(randomBetween(30, 150)),
    GPSSpeedRef: "K",
    GPSSpeed: randomBetween(0, 5).toFixed(2),
    GPSImgDirectionRef: "T",
    GPSImgDirection: randomBetween(0, 360).toFixed(2),
    GPSDestBearingRef: "T",
    GPSDestBearing: randomBetween(0, 360).toFixed(2),
    GPSHPositioningError: randomBetween(3, 15).toFixed(6),

    // -- Apple MakerNote style tags (written as XMP) --
    ContentIdentifier: generateSerialish(),
    ImageUniqueID: generateSerialish(),
  };

  return meta;
}

module.exports = { buildIPhone16ProMetadata };
