export const idleScreenConfig = {
  // Place your MP4 files inside public/videos/ using these configured filenames.
  videos: ["/videos/intro-1.mp4", "/videos/intro-2.mp4", "/videos/intro-3.mp4", "/videos/intro-4.mp4", "/videos/intro-5.mp4", "/videos/intro-6.mp4"],
  videoIntervalMs: 9000,
  transitionDurationMs: 1200,
  minimumPlaybackBeforeTransitionMs: 4000,
  startTransitionMs: 500,
  title: "MORROW",
  slogan: "Fresh. Fast. Delicious.",
  description: "Start your delicious journey",
  buttonLabel: "START ORDER",
  touchLabel: "Touch anywhere to begin",
} as const;
