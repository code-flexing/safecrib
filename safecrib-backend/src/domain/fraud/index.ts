export type {
  ListingFingerprint,
  DuplicateFlag,
  DuplicateDetectionConfig,
} from './duplicate-detector.engine.js';
export {
  comparePhash,
  compareListingText,
  evaluateDuplicateRisk,
  isHighRiskFlag,
} from './duplicate-detector.engine.js';
export { computePhash } from './image-phash.js';
